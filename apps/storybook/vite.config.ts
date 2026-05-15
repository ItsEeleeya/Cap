import capUIPlugin from "@cap/ui-desktop/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [solid(), capUIPlugin],
});
