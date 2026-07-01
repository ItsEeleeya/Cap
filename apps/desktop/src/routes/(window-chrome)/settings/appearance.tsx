import { cx } from "cva";
import { createResource, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import themePreviewAuto from "~/assets/theme-previews/auto.jpg";
import themePreviewDark from "~/assets/theme-previews/dark.jpg";
import themePreviewLight from "~/assets/theme-previews/light.jpg";
import { ElasticSurface } from "~/components/ElasticSurface";
import { Platform } from "~/components/Platform";
import { Scroller } from "~/components/ScrollView";
import { KineticSlider } from "~/components/solarium/SolariumSlider";
import { Toggle } from "~/components/Toggle";
import { generalSettingsStore } from "~/store";
import { deriveGeneralSettings } from "~/utils/general-settings";
import {
	type Appearance as AppAppearance,
	commands,
	type GeneralSettingsStore,
} from "~/utils/tauri";
import {
	Section,
	SectionCard,
	SectionRows,
	SettingItem,
	ToggleSettingItem,
} from "./Setting";

export default function Appearance() {
	const [store] = createResource(() => generalSettingsStore.get());

	const [settings, setSettings] = createStore<GeneralSettingsStore>(
		deriveGeneralSettings(store()),
	);

	const [elasticity, setElasticity] = createSignal(50);
	function elasticityLabel(value: number) {
		if (value < 33) return "Snappy";
		if (value < 66) return "Springy";
		return "Mellow";
	}

	return (
		<div class="size-full relative flex gap-5 flex-col min-h-0">
			<AppearanceSection
				currentTheme={settings.appearance ?? "system"}
				onThemeChange={(newAppearance) => {
					setSettings("appearance", newAppearance);
					commands.setAppearance(newAppearance);
				}}
			/>
			<Platform.macOS>
				<Section title="Liquid Glass">
					<SectionRows>
						<SettingItem
							label="Elasticity"
							description={elasticityLabel(elasticity())}
						>
							<div class="w-50 flex flex-col gap-1.5">
								<KineticSlider
									kinetic={{ preset: "position-bouncy" }}
									defaultValue={[50]}
									onChange={(v) => setElasticity(v[0])}
								/>
							</div>
						</SettingItem>
					</SectionRows>
				</Section>
			</Platform.macOS>

			<Section title="Theme" pro>
				<SectionRows>
					<SettingItem label="Light Theme">
						<p class="text-xs">Cap Light</p>
					</SettingItem>
					<SettingItem label="Dark Theme">
						<p class="text-xs">Cap Dark</p>
					</SettingItem>

					<SettingItem label="Typography">
						<p class="text-xs opacity-40 px-4">Geist Sans</p>
						<p class="text-xs">SF Pro</p>
					</SettingItem>
				</SectionRows>
			</Section>

			<Section title="Colors">
				<SectionRows>
					{/* Accent */}

					<div id="settings-section-studio-quality" class="flex flex-col gap-3">
						<div class="flex justify-between items-start gap-4 px-4 pt-4">
							<div class="flex flex-col gap-0.5 min-w-0">
								<p class="text-[13px] text-gray-12">Accent Color</p>
							</div>
							<div>
								<div class="flex items-center">
									<div class="size-6 rounded-full flex items-center justify-center shrink-0 relative mr-2 ring-offset-1 ring-2 ring-accent bg-accent">
										<i
											class="ti ti-check text-white text-[16px]"
											aria-hidden="true"
										></i>
									</div>

									<For
										each={[
											"bg-blue-10",
											"bg-purple-400",
											"bg-pink-400",
											"bg-red-300",
											"bg-orange-400",
											"bg-green-400",
											"bg-lime-400",
										]}
									>
										{(color, i) => (
											<div
												class={`size-6 rounded-full shrink-0 relative apple-glass hover:scale-120 hover:z-50! transition-transform duration-250 ease-[--ease-gentle-spring] ${color}`}
												classList={{ "-ml-1.5": i() > 0 }}
												style={{ "z-index": 8 - i() }}
											></div>
										)}
									</For>

									<button
										type="button"
										class="size-6 rounded-full shrink-0 relative flex items-center justify-center border text-gray-12 border-gray-12 border-dashed transition-colors z-0 ml-2"
										aria-label="Add color"
									>
										<IconLucidePaintbrushVertical class="p-0.5" />
									</button>
								</div>
							</div>
						</div>
						<SettingItem label="Use System Accent">
							<div class="size-3.5 rounded-full flex items-center justify-center shrink-0 relative mr-2 bg-[-apple-system-control-accent]">
								<i
									class="ti ti-check text-white text-[16px]"
									aria-hidden="true"
								></i>
							</div>
							<Toggle size="sm" checked={false} />
						</SettingItem>
					</div>

					<ToggleSettingItem
						label="Tint editor window backgrounds with wallpaper color"
						description="Allows for background tinting within editor windows when this option is enabled within System Settings."
						value={!settings.hideDockIcon}
						onChange={(v) => {}}
					/>
				</SectionRows>
			</Section>
		</div>
	);
}

function AppearanceSection(props: {
	currentTheme: AppAppearance;
	onThemeChange: (theme: AppAppearance) => void;
}) {
	const options = [
		{ id: "system", name: "System" },
		{ id: "light", name: "Light" },
		{ id: "dark", name: "Dark" },
	] satisfies { id: AppAppearance; name: string }[];

	const previews = {
		system: themePreviewAuto,
		light: themePreviewLight,
		dark: themePreviewDark,
	};

	return (
		<Section title="Appearance">
			<SectionCard class="bg-transparent">
				<div
					class="grid grid-cols-3 gap-3 rounded-[inherit]"
					onContextMenu={(e) => e.preventDefault()}
				>
					<For each={options}>
						{(theme) => {
							const isSelected = () => props.currentTheme === theme.id;
							return (
								<button
									type="button"
									aria-checked={isSelected()}
									aria-label={`Select theme: ${theme.name}`}
									onClick={() => props.onThemeChange(theme.id)}
									class="flex flex-col gap-2 items-center group focus-visible:outline-none focus-visible:border-accent-hover rounded-[inherit]"
								>
									<div
										class={cx(
											"w-full aspect-5/3 border-2 rounded-[inherit] overflow-hidden transition-[border-color,box-shadow] duration-150",
											isSelected()
												? "border-accent"
												: "group-hover:border-gray-6",
										)}
									>
										<Show when={previews[theme.id]} keyed>
											{(preview) => (
												<img
													class="object-cover w-full h-full animate-in fade-in duration-200 smoothed"
													draggable={false}
													src={preview}
													alt={`Preview of ${theme.name} theme`}
												/>
											)}
										</Show>
									</div>
									<span
										class={cx(
											"text-xs transition-colors",
											isSelected()
												? "text-accent font-bold"
												: "text-gray-10 font-medium",
										)}
									>
										{theme.name}
									</span>
								</button>
							);
						}}
					</For>
				</div>
			</SectionCard>
		</Section>
	);
}
