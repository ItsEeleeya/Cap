import { createContextProvider } from "@solid-primitives/context";
import { makePersisted } from "@solid-primitives/storage";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { fetch } from "@tauri-apps/plugin-http";
import * as shell from "@tauri-apps/plugin-shell";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { authStore, userProfileStore } from "~/store";
import { createSignInMutation } from "~/utils/auth";
import {
	apiClient,
	getConfiguredServerUrl,
	protectedHeaders,
} from "~/utils/web-api";
import { commands } from "./tauri";

const USER_PROFILE_CACHE_GC_MS = 2 * 60 * 60 * 1000;
const USER_PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

type AuthState = Awaited<ReturnType<typeof authStore.get>>;
type CachedUserProfile = Awaited<ReturnType<typeof userProfileStore.get>>;

export type UserProfileInfo = {
	name: string | null;
	email: string | null;
	imageUrl: string | null;
};

type UserAccountContextValue = {
	auth: Accessor<AuthState | null>;
	authLoaded: Accessor<boolean>;
	signedIn: Accessor<boolean>;
	avatarDataUrl: Accessor<string | null>;
	profile: Accessor<UserProfileInfo | null>;
	startLogInProcess: () => void;
	signOut: () => Promise<void>;
	refreshUserProfile: () => void;
	openDashboard: () => void;
};

function profileQueryKey(userId: string | null | undefined) {
	return ["settings-user-profile", userId ?? null] as const;
}

function isAuthExpired(auth: AuthState) {
	const secret = auth?.secret;
	return !!secret && "expires" in secret && secret.expires * 1000 <= Date.now();
}

function isCachedProfileForUser(
	cachedProfile: CachedUserProfile,
	userId: string | null | undefined,
) {
	return cachedProfile?.userId === (userId ?? null);
}

async function loaduserAccountAvatarDataUrl(signal: AbortSignal): Promise<string> {
	const imageUrl = new URL(
		"/api/desktop/user/profile/image",
		await getConfiguredServerUrl(),
	).toString();

	const response = await fetch(imageUrl, {
		headers: await protectedHeaders(),
		signal,
	});

	if (!response.ok) throw new Error("Failed to load profile image");

	const contentType = response.headers.get("content-type");
	if (contentType && !contentType.toLowerCase().startsWith("image/")) {
		throw new Error("Invalid profile image response");
	}

	const contentLength = Number(response.headers.get("content-length"));
	if (
		Number.isFinite(contentLength) &&
		contentLength > MAX_PROFILE_IMAGE_BYTES
	) {
		throw new Error("Profile image is too large");
	}

	const blob = await response.blob();
	if (blob.size > MAX_PROFILE_IMAGE_BYTES)
		throw new Error("Profile image is too large");

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read profile image"));
		reader.readAsDataURL(blob);
	});
}

function createUserContext() {
	const queryClient = useQueryClient();
	const signIn = createSignInMutation();

	const [auth, setAuth] = createSignal<AuthState | null>(null);
	const [authLoaded, setAuthLoaded] = createSignal(false);
	const [failedAvatarImage, setFailedAvatarImage] = createSignal<string | null>(
		null,
	);
	const [avatarDataUrl, setAvatarDataUrl] = createSignal(localStorage.getItem("userAccountAvatarDataUrl"));

	function updateAvatarDataUrl(value: string | null) {
		if (value) localStorage.setItem("userAccountAvatarDataUrl", value);
		else localStorage.removeItem("userAccountAvatarDataUrl");
		setAvatarDataUrl(value);
	}

	async function clearLocalAuth() {
		setAuth(null);
		setFailedAvatarImage(null);
		updateAvatarDataUrl(null);

		queryClient.removeQueries({ queryKey: ["settings-user-profile"] });

		await Promise.all([
			authStore.set(undefined),
			userProfileStore.set(undefined),
		]);
	}

	const userProfileQuery = useQuery(() => ({
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

			const userInfo = response.body as UserProfileInfo;

			await userProfileStore.set({
				userId: currentAuth.user_id,
				profile: userInfo,
				updatedAt: Date.now(),
			});

			return userInfo;
		},
	}));

	const profile = createMemo(() => userProfileQuery.data ?? null);

	const signedIn = createMemo(() => !!auth());

	const remoteAvatarUrl = createMemo(() => {
		const imageUrl = profile()?.imageUrl?.trim();
		if (!imageUrl) return null;
		if (imageUrl === failedAvatarImage()) return null;
		return imageUrl;
	});

	function openDashboard() {
		getConfiguredServerUrl().then((serverUrl) =>
			shell.open(new URL("/dashboard", serverUrl).toString()),
		);
	}

	function startLogInProcess() {
		if (auth()) {
			openDashboard();
			return;
		}

		if (signIn.isPending) {
			signIn.variables.abort();
			signIn.reset();
			return;
		}

		signIn.mutate(new AbortController());
	}

	function refreshUserProfile() {
		void userProfileQuery.refetch();
	}

	function markAvatarAsFailed(imageUrl: string) {
		setFailedAvatarImage(imageUrl);
		updateAvatarDataUrl(null);
		void userProfileQuery.refetch();
	}

	// Fetch and cache the avatar as a data URL when the remote URL changes
	createEffect(
		on(remoteAvatarUrl, (imageUrl) => {
			if (!imageUrl) return;
			// Already cached
			if (avatarDataUrl()) return;

			const abort = new AbortController();
			let disposed = false;

			loaduserAccountAvatarDataUrl(abort.signal)
				.then((dataUrl) => {
					if (!disposed) updateAvatarDataUrl(dataUrl);
				})
				.catch(() => {
					if (!disposed && !abort.signal.aborted) markAvatarAsFailed(imageUrl);
				});

			onCleanup(() => {
				disposed = true;
				abort.abort();
			});
		}),
	);

	createEffect(
		on(
			() => auth()?.user_id ?? null,
			(userId, previousUserId) => {
				// Skip the initial run and the null -> first-user transition
				if (previousUserId === undefined) return;
				if (!userId || userId === previousUserId) return;
				setFailedAvatarImage(null);
			},
		),
	);

	let disposed = false;
	let stopAuthListening: (() => void) | undefined;

	function applyAuth(value: AuthState) {
		if (isAuthExpired(value)) {
			void clearLocalAuth();
			setAuthLoaded(true);
			return;
		}

		setAuth(() => value);
		setAuthLoaded(true);
	}

	onMount(() => {
		void Promise.all([authStore.get(), userProfileStore.get()])
			.then(([value, cachedProfile]) => {
				if (disposed) return;

				if (
					value &&
					cachedProfile &&
					isCachedProfileForUser(cachedProfile, value.user_id)
				) {
					queryClient.setQueryData(
						profileQueryKey(value.user_id),
						cachedProfile.profile,
						{ updatedAt: cachedProfile.updatedAt },
					);
				}

				if (isAuthExpired(value)) {
					void clearLocalAuth();
					return;
				}

				setAuth(() => value ?? null);
			})
			.catch((error) => console.error("Failed to load auth store:", error))
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
			.catch((error) =>
				console.error("Failed to listen to auth store:", error),
			);
	});

	onCleanup(() => {
		disposed = true;
		stopAuthListening?.();
	});

	return {
		auth,
		authLoaded,
		signedIn,
		startLogInProcess,
		profile,
		avatarDataUrl,
		signOut: clearLocalAuth,
		refreshUserProfile,
		openDashboard,
	} satisfies UserAccountContextValue;
}

export const [UserAccountContextProvider, useUserAccount] =
	createContextProvider(
		createUserContext,
		null as unknown as ReturnType<typeof createUserContext>,
	);
