#!/usr/bin/env node
/**
 * CLI for expo-cache-provider.
 * Usage: npx expo-cache-provider build-android [--project-root=.] [--variant=release|debug]
 */
import path from "node:path";
import { buildAndroidWithoutDevice } from "../expo/buildWithoutDevice.js";

type CliArgs = {
	command: string | undefined;
	projectRoot: string;
	variant: "debug" | "release";
	isHelp: boolean;
};

function parseCliArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);
	const command = args.find((a) => !a.startsWith("-"));
	const projectRoot =
		args.find((a) => a.startsWith("--project-root="))?.split("=")[1] ?? process.cwd();

	const variantFromEq = args.find((a) => a.startsWith("--variant="))?.split("=")[1];
	const variantIdx = args.indexOf("--variant");
	const variantFromNext = variantIdx >= 0 && variantIdx + 1 < args.length ? args[variantIdx + 1] : undefined;
	const variantRaw = variantFromEq ?? variantFromNext;
	const variant = variantRaw === "debug" || variantRaw === "release" ? variantRaw : "release";

	const isHelp = args.includes("--help") || args.includes("-h");

	return { command, projectRoot, variant, isHelp };
}

const { command, projectRoot, variant, isHelp } = parseCliArgs(process.argv);

if (command === "build-android") {
	buildAndroidWithoutDevice(path.resolve(projectRoot), { variant })
		.then((apkPath) => {
			console.log("APK path:", apkPath);
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
} else {
	console.log(`Usage: npx expo-cache-provider build-android [--project-root=<dir>] [--variant=release|debug]
  Builds Android APK using cache (and optional repack) without requiring a device.`);
	process.exit(isHelp ? 0 : 1);
}
