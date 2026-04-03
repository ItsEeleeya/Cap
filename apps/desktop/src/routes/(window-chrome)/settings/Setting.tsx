import type { JSX } from "solid-js";
import { Toggle } from "~/components/Toggle";

export function SettingItem(props: {
	pro?: boolean;
	label: string;
	description?: string;
	children: JSX.Element;
	onClick?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
}) {
	return (
		<div class="flex flex-row gap-2 justify-between items-center py-3 text-sm" onClick={props.onClick}>
			<div class="flex flex-col justify-between items-start space-y-1">
				<div class="flex gap-2 items-center">
					<p class="text-gray-12">{props.label}</p>
				</div>
				{props.description && (
					<p class="text-xs text-gray-11">{props.description}</p>
				)}
			</div>
			{props.children}
		</div>
	);
}

export function ToggleSettingItem(props: {
	pro?: boolean;
	label: string;
	description?: string;
	value: boolean;
	onChange(v: boolean): void;
}) {
	return (
		<SettingItem {...props} onClick={() => props.onChange(!props.value)}>
			<Toggle
				size="md"
				checked={props.value}
				onChange={(v) => props.onChange(v)}
				onClick={(e: PointerEvent) => e.stopPropagation()}
			/>
		</SettingItem>
	);
}