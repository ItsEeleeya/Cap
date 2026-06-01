import type { RouteSectionProps } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { RevealWindowWithSuspense } from "~/App";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { Sidebar, SidebarProvider, SidebarTrigger } from "~/components/Sidebar";

export default function Settings(props: RouteSectionProps) {
    getCurrentWebviewWindow().setBackgroundColor({ red: 255, green: 0, blue: 0, alpha: 1 });
    return (
        <SidebarProvider
            side="left"
            storageKey="settings"
        >
            <div class="flex h-screen w-screen">
                <Sidebar>
                    <nav class="p-4 pt-14 flex flex-col gap-2 text-sm size-full">
                        <span>Item 1</span>
                        <span>Item 2</span>
                        <span>Item 3</span>
                    </nav>
                </Sidebar>

                <main class="size-full flex items-justify-center overflow-y-scroll">
                    <CapErrorBoundary>
                        <RevealWindowWithSuspense>{props.children}</RevealWindowWithSuspense>
                    </CapErrorBoundary>

                </main>
            </div>
        </SidebarProvider>

    );
}
