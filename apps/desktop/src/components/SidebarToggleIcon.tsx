import { cx } from "cva";

type SidebarSide = "left" | "right";

interface SidebarToggleIconProps {
	collapsed?: boolean;
	overlayOpen?: boolean;
	side?: SidebarSide;
	class?: string;
}

export default function SidebarToggleIcon(props: SidebarToggleIconProps) {
	const side = () => props.side ?? "left";
	const expanded = () => !props.collapsed || props.overlayOpen;
	const insetSide = () => (side() === "left" ? "left" : "right");
	const oppositeSide = () => (side() === "left" ? "right" : "left");
	const railWidth = () => (expanded() ? "5px" : "2px");
	const railInset = () => (expanded() ? "7px" : "4px");
	const dividerInset = () => (expanded() ? "6px" : "3px");

	return (
		<span
			class={cx("relative block size-[18px]", props.class)}
			aria-hidden="true"
		>
			<span
				class="absolute inset-y-[2px] rounded-[4px] border border-current/20 bg-current/10 transition-all duration-200 ease-out"
				style={{
					[insetSide()]: "1px",
					width: railWidth(),
					transform: expanded() ? "scale(1)" : "scaleY(0.92)",
				}}
			/>
			<span
				class="absolute inset-y-[2px] rounded-[4px] border border-current/15 bg-current/5 transition-all duration-200 ease-out"
				style={{
					[insetSide()]: railInset(),
					[oppositeSide()]: "1px",
				}}
			/>
			<span
				class="absolute top-[3px] bottom-[3px] w-px rounded-full bg-current/10 transition-all duration-200 ease-out"
				style={{
					[insetSide()]: dividerInset(),
					opacity: expanded() ? "1" : "0.55",
				}}
			/>
		</span>
	);
}
