import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/scripts/cli.ts"],
	format: ["cjs", "esm"],
	dts: {
		banner: "/// <reference types=\"node\" />",
	},
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
});

