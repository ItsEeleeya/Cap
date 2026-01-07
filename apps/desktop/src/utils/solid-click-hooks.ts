import { createEventListenerMap } from "@solid-primitives/event-listener";
import { type Accessor, onMount } from "solid-js";

export function useEscape<T extends HTMLElement>(
	ref: Accessor<T | undefined>,
	handler: (event: Event) => void,
) {
	onMount(() => {
		const element = ref();
		if (!element) return;

		function handle(event: Event) {
			if (!element?.contains(event.target as Node)) {
				handler(event);
			}
		}

		createEventListenerMap(window, {
			keydown: (e) => {
				if (e.code === "Escape") handle(e);
			},
			pointerdown: (e) => handle(e),
		});
	});
}
