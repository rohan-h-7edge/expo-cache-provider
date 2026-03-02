# Native-Only Cache Provider

A specialized Expo Build Cache Provider that caches **native build artifacts only**, allowing Metro to always serve fresh JavaScript bundles.

> **Note**: This provider is designed for **local development** (`npx expo run:android/ios`). 
> 
> **About Repack**: Expo Repack is **only available in EAS Workflows** (cloud-based CI/CD), not as a local tool. Our provider achieves the same goal for local development by caching native binaries and allowing Metro to serve fresh JS. See [REPACK-EXPLANATION.md](./REPACK-EXPLANATION.md) for details.

## Features

✅ **Native-only caching** - Only caches APK/.app files, not JS bundles  
✅ **JS-agnostic fingerprint** - Does NOT invalidate cache on JS/TS changes  
✅ **Profile-aware** - Supports `development` and `qa`, blocks `production`  
✅ **Local-first strategy** - Fast local disk cache with S3 fallback  
✅ **Custom fingerprint** - Implements `calculateFingerprintHash` to exclude JS files  

## Use Case

Perfect for **local development** workflows where:
- Native dependencies change infrequently
- JavaScript code changes frequently
- You want fast native builds while always getting fresh JS from Metro
- You need local disk caching with optional S3 backup

> **For CI/CD**: Use [Expo's Repack](https://expo.dev/blog/accelerating-continuous-integration-with-fingerprint-repack-in-eas-workflows) in EAS Workflows instead.

## Installation

```bash
npm install --save-dev expo-native-cache-provider
```

## Configuration

Add to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "buildCacheProvider": {
      "plugin": "./provider/build/index.js",
      "options": {
        "localCacheDir": "./.expo-native-cache",
        "s3": {
          "bucket": "my-cache-bucket",
          "region": "us-east-1",
          "prefix": "expo-native-cache"
        }
      }
    }
  }
}
```

### Environment Variables

```bash
EXPO_NATIVE_CACHE_LOCAL_DIR=./.expo-native-cache
EXPO_NATIVE_CACHE_S3_BUCKET=my-bucket
EXPO_NATIVE_CACHE_S3_REGION=us-east-1
EXPO_NATIVE_CACHE_S3_ACCESS_KEY_ID=xxx
EXPO_NATIVE_CACHE_S3_SECRET_ACCESS_KEY=xxx
EXPO_NATIVE_CACHE_S3_ENDPOINT=https://s3.amazonaws.com
EXPO_NATIVE_CACHE_S3_PREFIX=expo-native-cache
```

## Profile Detection

The provider automatically detects the build profile:

- **development**: `debug`/`Debug` variant/configuration
- **qa**: `release`/`Release` + `expo-dev-client` present
- **production**: `release`/`Release` + no `expo-dev-client` → **BLOCKED**

## Cache Key Format

```
expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>
```

Examples:
- `expo-native-cache/development/android/abc123def456.apk`
- `expo-native-cache/qa/ios/xyz789.app`

## Fingerprint Calculation

The custom `calculateFingerprintHash` includes:

✅ Expo SDK version  
✅ Platform (android/ios)  
✅ Native directories (`android/` or `ios/`)  
✅ Native app.json fields (package, versionCode, bundleId, etc.)  
✅ Native module versions  

❌ **Excludes**: All JS/TS source files, React components, business logic

## Usage

### Development Build

```bash
npx expo run:android
# Profile: development
# Cache: ✅ Enabled
# JS changes: ✅ Metro serves fresh JS, native cache reused
```

### QA Build (with dev-client)

```bash
npx expo run:android --variant release
# Profile: qa
# Cache: ✅ Enabled
```

### Production Build

```bash
npx expo run:android --variant release
# Profile: production (no dev-client)
# Cache: ❌ SKIPPED (production builds not cached)
```

## How It Works

1. **Fingerprint Calculation**: Custom hash excludes JS/TS files
2. **Profile Detection**: Automatically detects development/qa/production
3. **Cache Lookup**: Checks local disk first, then S3
4. **Cache Write**: Saves to local disk + S3 (if configured)
5. **Metro Bundling**: Always runs, serving fresh JS regardless of cache

## Example Workflow

```bash
# First build - creates cache
npx expo run:android
# [NativeCache] [INFO] Cache MISS: expo-native-cache/development/android/abc123.apk
# [NativeCache] [INFO] Cache UPLOADED: expo-native-cache/development/android/abc123.apk

# Change JavaScript code
echo "console.log('new code');" >> App.tsx

# Second build - cache HIT for native, Metro bundles new JS
npx expo run:android
# [NativeCache] [INFO] Cache HIT: expo-native-cache/development/android/abc123.apk
# Metro bundles new JS ✅
```

## Project Structure

```
provider/
├─ src/
│  ├─ index.ts                    # Main plugin
│  ├─ fingerprint/
│  │  └─ nativeFingerprint.ts    # Custom fingerprint calculation
│  ├─ local/
│  │  └─ DiskCache.ts            # Local disk cache
│  ├─ s3/
│  │  └─ S3Cache.ts              # S3 remote cache
│  ├─ hybrid/
│  │  └─ HybridCache.ts          # Local-first + S3 fallback
│  └─ utils/
│     ├─ hash.ts                 # Hashing utilities
│     ├─ logger.ts               # Logging
│     └─ guards.ts               # Profile/platform guards
└─ tsconfig.json
```

## Building

```bash
cd provider
npm run build
```

## License

MIT



