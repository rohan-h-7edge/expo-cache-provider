#!/usr/bin/env node
/**
 * CLI for expo-cache-provider.
 * Usage: npx expo-cache-provider build-android [--project-root=.] [--variant=release|debug]
 */
import path from "node:path";
import { buildAndroidWithoutDevice } from "../expo/buildWithoutDevice.js";

const args = process.argv.slice(2);
const projectRoot =
	args.find((a) => a.startsWith("--project-root="))?.split("=")[1] ?? process.cwd();
const variantEq = args.find((a) => a.startsWith("--variant="))?.split("=")[1];
const variantIdx = args.indexOf("--variant");
const variantNext = variantIdx >= 0 && variantIdx + 1 < args.length ? args[variantIdx + 1] : undefined;
const variantArg = variantEq ?? variantNext;
const variant =
	variantArg === "debug" || variantArg === "release" ? variantArg : "release";

if (args.includes("build-android")) {
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
	process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
}
