import type { BuildCacheProviderPlugin } from "@expo/config";
import { type HybridCacheConfig } from "./hybrid/HybridCache.js";
/**
 * Native-only cache provider plugin.
 *
 * Features:
 * - Caches native build artifacts only (APK/.app)
 * - Does NOT invalidate on JS/TS changes
 * - Blocks production builds
 * - Supports development and qa profiles only
 */
declare const NativeCacheProvider: BuildCacheProviderPlugin<Partial<HybridCacheConfig> | undefined>;
/**
 * Generates a JavaScript bundle using Expo/Metro.
 * Exported for use by root expo-cache-provider when enableRepack is true.
 */
export declare function generateJSBundle(projectRoot: string, platform: "android" | "ios"): Promise<string>;
export { Repack } from "./repack/Repack.js";
export default NativeCacheProvider;
//# sourceMappingURL=index.d.ts.map