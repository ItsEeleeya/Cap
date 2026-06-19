import { Button } from "@cap/ui-solid";
import { Separator } from "@kobalte/core";
import { Show } from "solid-js";
import { createLicenseQuery } from "~/utils/queries";
import { useUserAccount } from "~/utils/UserAccountProvider";
import { SectionCard } from "./Setting";

export default function Account() {
	const user = useUserAccount();

	return (
		<Show when={user.signedIn()} fallback={<SignInPage user={user} />}>
			<UserAccountPage user={user} />
		</Show>
	);
}

function SignInPage(props: { user: ReturnType<typeof useUserAccount> }) {
	return (
		<div>
			<Button onClick={props.user.startLogInProcess}>Sign In</Button>
		</div>
	);
}

function UserAccountPage(props: { user: ReturnType<typeof useUserAccount> }) {
	const profile = props.user.profile;
	const license = createLicenseQuery();

	return (
		<>
			<div class="flex flex-col items-center justify-center p-5 gap-3">
				<img
					draggable={false}
					class="size-20 rounded-full apple-glass not-solarium:border p-1 active:scale-105 transition-transform ease-(--gentle-spring) duration-200"
					src={props.user.avatarDataUrl() ?? ""}
				/>
				<span class="inline-flex flex-col items-center">
					<span class="text-lg font-semibold">{profile()?.name}</span>
					<span class="text-md opacity-80">{profile()?.email}</span>
				</span>
			</div>
			<SectionCard class="p-2 text-sm flex flex-col items-start gap-2">
				<button onClick={props.user.openDashboard}>Open Dashboard</button>
				<button class="text-red-8" onClick={props.user.signOut}>
					Log Out
				</button>
			</SectionCard>
		</>
	);
}
