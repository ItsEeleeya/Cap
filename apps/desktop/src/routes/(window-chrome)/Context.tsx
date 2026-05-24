import { createContextProvider } from "@solid-primitives/context";
import {
	createRenderEffect,
	createSignal,
	type JSX,
	onCleanup,
	type ParentProps,
} from "solid-js";

interface WindowChromeState {
	/** @deprecated */
	hideMaximize?: boolean;
	/** @deprecated */
	items?: () => JSX.Element;
}

export const [WindowChromeContext, useWindowChromeContext] =
	createContextProvider(() => {
		const [state, setState] = createSignal<WindowChromeState>();

		return {
			state,
			setState: (newState: WindowChromeState | undefined) => {
				if (newState === undefined) {
					setState(undefined);
				} else {
					setState((prev) => ({ ...prev, ...newState }));
				}
			},
		};
	});

export function useWindowChrome(state: WindowChromeState) {
	const ctx = useWindowChromeContext();
	if (!ctx)
		throw new Error(
			"useWindowChrome must be used within a WindowChromeContext",
		);

	createRenderEffect(() => ctx.setState?.(state));
	onCleanup(() => {
		ctx.setState?.(undefined);
	});
}

export function WindowChromeHeader(
	props: ParentProps<{
		hideMaximize?: boolean;
		/** @deprecated */
		items?: JSX.Element;
	}>,
) {
	useWindowChrome({
		hideMaximize: props.hideMaximize,
		items: () => props.children,
	});

	return null;
}
