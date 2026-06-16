import { createQuery, useQueryClient } from "@tanstack/solid-query";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import * as shell from "@tauri-apps/plugin-shell";
import { cx } from "cva";
import {
    createContext,
    createEffect,
    createMemo,
    createSignal,
    on,
    onCleanup,
    onMount,
    type ParentProps,
    Show,
    useContext,
} from "solid-js";
import { authStore, userProfileStore } from "~/store";
import { createSignInMutation } from "~/utils/auth";
import { commands } from "~/utils/tauri";
import { apiClient, getConfiguredServerUrl, protectedHeaders } from "~/utils/web-api";
import IconLucideUserRound from "~icons/lucide/user-round";

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_PROFILE_CACHE_GC_MS = 2 * 60 * 60 * 1000;
const USER_PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthState = Awaited<ReturnType<typeof authStore.get>>;
type CachedUserProfile = Awaited<ReturnType<typeof userProfileStore.get>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function profileQueryKey(userId: string | null | undefined) {
    return ["settings-user-profile", userId ?? null] as const;
}

function isAuthExpired(auth: AuthState): boolean {
    const secret = auth?.secret;
    return !!secret && "expires" in secret && secret.expires * 1000 <= Date.now();
}

function isCachedProfileForUser(
    cached: CachedUserProfile,
    userId: string | null | undefined,
) {
    return cached?.userId === (userId ?? null);
}

async function loadProfileImageObjectUrl(signal: AbortSignal): Promise<string> {
    const imageUrl = new URL(
        "/api/desktop/user/profile/image",
        await getConfiguredServerUrl(),
    ).toString();

    const response = await tauriFetch(imageUrl, {
        headers: await protectedHeaders(),
        signal,
    });
    if (!response.ok) throw new Error("Failed to load profile image");

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().startsWith("image/"))
        throw new Error("Invalid content-type");

    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > MAX_PROFILE_IMAGE_BYTES)
        throw new Error("Profile image too large");

    const blob = await response.blob();
    if (blob.size > MAX_PROFILE_IMAGE_BYTES)
        throw new Error("Profile image blob too large");

    return URL.createObjectURL(blob);
}

// ─── Context ──────────────────────────────────────────────────────────────────

type UserProfileContextValue = {
    isLoaded: () => boolean;
    isSignedIn: () => boolean;
    isSignInPending: () => boolean;
    name: () => string | null;
    email: () => string | null;
    pictureUrl: () => string | null;
    onPictureError: () => void;
    handleProfileClick: () => void;
    signOut: () => Promise<void>;
};

const UserProfileContext = createContext<UserProfileContextValue>();

export function useUserProfile(): UserProfileContextValue {
    const ctx = useContext(UserProfileContext);
    if (!ctx)
        throw new Error("<UserProfile.*> must be inside <UserProfile.Provider>");
    return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

function Provider(props: ParentProps) {
    const queryClient = useQueryClient();
    const signIn = createSignInMutation();

    const [auth, setAuth] = createSignal<AuthState>();
    const [authLoaded, setAuthLoaded] = createSignal(false);
    const [failedImageUrl, setFailedImageUrl] = createSignal<string | null>(null);
    const [profileImageObjectUrl, setProfileImageObjectUrl] = createSignal<
        string | null
    >(null);

    let disposed = false;
    let stopAuthListening: UnlistenFn | undefined;

    // ── Auth ──────────────────────────────────────────────────────────────────

    const clearLocalAuth = async () => {
        setAuth(undefined);
        queryClient.removeQueries({ queryKey: ["settings-user-profile"] });
        await Promise.all([
            authStore.set(undefined),
            userProfileStore.set(undefined),
        ]);
    };

    const applyAuth = (value: AuthState) => {
        if (isAuthExpired(value)) {
            void clearLocalAuth();
            setAuthLoaded(true);
            return;
        }
        setAuth(() => value);
        setAuthLoaded(true);
    };

    // ── Profile query ─────────────────────────────────────────────────────────

    const userProfile = createQuery(() => ({
        queryKey: profileQueryKey(auth()?.user_id),
        enabled: !!auth(),
        staleTime: USER_PROFILE_REFRESH_INTERVAL_MS,
        gcTime: USER_PROFILE_CACHE_GC_MS,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async () => {
            const currentAuth = auth();
            if (!currentAuth) return null;

            if (isAuthExpired(currentAuth)) {
                await clearLocalAuth();
                return null;
            }

            const response = await apiClient.desktop.getUserProfile({
                headers: await protectedHeaders(),
            });

            if (response.status === 401) {
                await clearLocalAuth();
                return null;
            }
            if (response.status !== 200)
                throw new Error("Failed to load account profile");

            await userProfileStore.set({
                userId: currentAuth.user_id,
                profile: response.body,
                updatedAt: Date.now(),
            });

            return response.body;
        },
    }));

    // ── Profile image ─────────────────────────────────────────────────────────

    const accountRemoteImageUrl = createMemo(() => {
        if (!userProfile.isSuccess) return null;
        const url = userProfile.data?.imageUrl?.trim();
        if (!url || url === failedImageUrl()) return null;
        return url;
    });

    const handleProfileImageError = (imageUrl: string) => {
        setFailedImageUrl(imageUrl);
        void userProfile.refetch();
    };

    // Matches the working pattern exactly — on() makes the dependency explicit
    // so this never runs speculatively on mount
    createEffect(
        on(accountRemoteImageUrl, (imageUrl) => {
            setProfileImageObjectUrl(null);
            if (!imageUrl) return;

            const abort = new AbortController();
            let effectDisposed = false;
            let objectUrl: string | null = null;

            void loadProfileImageObjectUrl(abort.signal)
                .then((url) => {
                    if (effectDisposed) {
                        URL.revokeObjectURL(url);
                        return;
                    }
                    objectUrl = url;
                    setProfileImageObjectUrl(url);
                })
                .catch(() => {
                    if (!effectDisposed && !abort.signal.aborted)
                        handleProfileImageError(imageUrl);
                });

            onCleanup(() => {
                effectDisposed = true;
                abort.abort();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            });
        }),
    );

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onMount(() => {
        // Populate cache from persisted store before any network request fires,
        // so the profile renders immediately on open without a loading flash
        void Promise.all([authStore.get(), userProfileStore.get()])
            .then(([value, cached]) => {
                if (disposed) return;

                if (value && cached && isCachedProfileForUser(cached, value.user_id)) {
                    queryClient.setQueryData(
                        profileQueryKey(value.user_id),
                        cached.profile,
                        { updatedAt: cached.updatedAt },
                    );
                }

                if (isAuthExpired(value)) {
                    void clearLocalAuth();
                    return;
                }

                setAuth(() => value);
            })
            .catch((err) => console.error("Failed to load auth store:", err))
            .finally(() => {
                if (!disposed) setAuthLoaded(true);
            });

        void authStore
            .listen(applyAuth)
            .then((unlisten) => {
                if (disposed) {
                    unlisten();
                    return;
                }
                stopAuthListening = unlisten;
            })
            .catch((err) => console.error("Failed to listen to auth store:", err));
    });

    onCleanup(() => {
        disposed = true;
        stopAuthListening?.();
    });

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleProfileClick = () => {
        if (auth()) {
            void getConfiguredServerUrl().then((serverUrl) =>
                shell.open(new URL("/dashboard", serverUrl).toString()),
            );
            return;
        }
        if (signIn.isPending) {
            signIn.variables.abort();
            signIn.reset();
            return;
        }
        signIn.mutate(new AbortController());
    };

    // ── Context value ─────────────────────────────────────────────────────────

    const ctx: UserProfileContextValue = {
        isLoaded: authLoaded,
        isSignedIn: () => !!auth(),
        isSignInPending: () => signIn.isPending,
        name: () => userProfile.data?.name?.trim() || null,
        email: () => userProfile.data?.email?.trim() || null,
        pictureUrl: profileImageObjectUrl,
        onPictureError: () => {
            const url = accountRemoteImageUrl();
            if (url) handleProfileImageError(url);
            setProfileImageObjectUrl(null);
        },
        handleProfileClick,
        signOut: clearLocalAuth,
    };

    // Children render immediately — context values start as empty signals
    // and reactively update as auth/profile loads in the background
    return (
        <UserProfileContext.Provider value={ctx}>
            {props.children}
        </UserProfileContext.Provider>
    );
}

function Picture(props: { class?: string }) {
    const { pictureUrl, onPictureError } = useUserProfile();
    return (
        <Show
            when={pictureUrl()}
            fallback={
                <div
                    class={cx(
                        "flex items-center justify-center rounded-full bg-gray-3 text-gray-11",
                        props.class,
                    )}
                >
                    <IconLucideUserRound class="size-[45%]" aria-hidden="true" />
                </div>
            }
        >
            {(url) => (
                <img
                    src={url()}
                    alt=""
                    draggable={false}
                    class={cx("rounded-full object-cover bg-gray-3", props.class)}
                    onError={onPictureError}
                />
            )}
        </Show>
    );
}

function Name(props: { class?: string; fallback?: string }) {
    const { isSignedIn, isSignInPending, name, email } = useUserProfile();
    const display = () => {
        if (!isSignedIn())
            return isSignInPending()
                ? "Signing in…"
                : (props.fallback ?? "Click to sign in");
        return name() ?? email() ?? "Signed in";
    };
    return <span class={props.class}>{display()}</span>;
}

function Email(props: { class?: string }) {
    const { email } = useUserProfile();
    commands.log("use profile");
    return (
        <Show when={email()}>{(e) => <span class={props.class}>{e()}</span>}</Show>
    );
}

function SignedIn(props: ParentProps) {
    const { isSignedIn } = useUserProfile();
    return <Show when={isSignedIn()}>{props.children}</Show>;
}

function SignedOut(props: ParentProps) {
    const { isSignedIn } = useUserProfile();
    return <Show when={!isSignedIn()}>{props.children}</Show>;
}

export const UserProfile = { Picture, Name, Email, SignedIn, SignedOut, Provider };
