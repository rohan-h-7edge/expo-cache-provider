#!/usr/bin/env node
/**
 * CLI for expo-cache-provider.
 * Usage: npx expo-cache-provider build-android [--project-root=.] [--variant=<variant>] [--apk-path=<path>]
 */
import path from "node:path";
import { buildAndroidWithoutDevice } from "../expo/buildWithoutDevice.js";

type CliArgs = {
	command: string | undefined;
	projectRoot: string;
	variant: string;
	apkPath: string | undefined;
	isHelp: boolean;
};

function parseFlag(args: string[], flag: string): string | undefined {
	const fromEq = args.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
	const idx = args.indexOf(flag);
	const fromNext = idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
	return fromEq ?? fromNext;
}

function parseCliArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);
	const command = args.find((a) => !a.startsWith("-"));
	const projectRoot = parseFlag(args, "--project-root") ?? process.cwd();
	const variant = parseFlag(args, "--variant") ?? "release";
	const apkPath = parseFlag(args, "--apk-path");
	const isHelp = args.includes("--help") || args.includes("-h");
	return { command, projectRoot, variant, apkPath, isHelp };
}

const { command, projectRoot, variant, apkPath, isHelp } = parseCliArgs(process.argv);

if (command === "build-android") {
	buildAndroidWithoutDevice(path.resolve(projectRoot), { variant, apkPath })
		.then((result) => {
			console.log("APK path:", result);
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
} else {
	console.log(
		`Usage: npx expo-cache-provider build-android [--project-root=<dir>] [--variant=<variant>] [--apk-path=<path>]

  --variant   Gradle variant. Simple: "release", "debug". Compound: "qaRelease", "developDebug", "preprodRelease". Default: "release".
  --apk-path  Explicit APK output path. Overrides auto-detection for non-standard layouts.

  Builds Android APK using cache (and optional repack) without requiring a device.`,
	);
	process.exit(isHelp ? 0 : 1);
}
