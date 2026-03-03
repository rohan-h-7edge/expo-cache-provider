# expo-native-cache-provider

Native-only build cache provider for Expo projects. It plugs into Expo's `buildCacheProvider` plugin system and caches **native build artifacts** (APK / `.app` bundles) using a **local‑first + optional S3** strategy.

- Caches only native artifacts (no JS/TS hash) for fast reuse while iterating on native code
- Supports **development** and **QA**-style profiles; **production builds are never cached**
- Local disk cache with optional S3 backing store

## Installation

```bash
npm install expo-native-cache-provider
```

Peer dependency (already present in Expo apps):

```bash
npm install --save-dev @expo/config
```

## Basic usage (Expo app config)

In your `app.config.(js|ts)` or `app.json`, register the plugin:

```js
// app.config.js
export default {
  // ...
  buildCacheProvider: {
    plugin: "expo-native-cache-provider",
    options: {
      // Optional: see configuration section below
    },
  },
};
```

The provider will:

- Calculate a **native-only fingerprint** (no JS/TS files)
- Decide a **profile** based on your build settings:
  - `debug` / `Debug` → `development`
  - `release` / `Release` + `expo-dev-client` dependency → `qa`
  - `release` / `Release` without dev client → `production`
- Use the cache **only for non‑production** profiles

## Configuration

The plugin accepts a partial `HybridCacheConfig`:

```ts
type HybridCacheConfig = {
  localCacheDir: string;
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    prefix?: string;
  };
  writeThrough?: boolean; // default: true
  enableRepack?: boolean; // default: false
};
```

### Example

```js
export default {
  // ...
  buildCacheProvider: {
    plugin: "expo-native-cache-provider",
    options: {
      localCacheDir: "/tmp/expo-native-cache",
      s3: {
        bucket: "my-expo-native-cache",
        region: "us-east-1",
        // accessKeyId / secretAccessKey can also come from the environment
      },
      writeThrough: true,
      enableRepack: false,
    },
  },
};
```

### Environment variables

If you omit some options, the provider falls back to environment variables:

- `EXPO_NATIVE_CACHE_LOCAL_DIR` – overrides `localCacheDir`
- `EXPO_NATIVE_CACHE_S3_REGION` – default S3 region (when not set in `options.s3.region`)
- `EXPO_NATIVE_CACHE_S3_ACCESS_KEY_ID`
- `EXPO_NATIVE_CACHE_S3_SECRET_ACCESS_KEY`
- `EXPO_NATIVE_CACHE_S3_ENDPOINT`
- `EXPO_NATIVE_CACHE_S3_PREFIX`

The **S3 bucket** must be provided via `options.s3.bucket`.

## How it works (high level)

- A **hybrid cache** checks:
  1. Local disk first
  2. S3 second (optional); on S3 hit, it writes back to disk
- Artifacts are:
  - `.apk` files (Android)
  - `.app` bundles (iOS, stored as compressed tarballs)
- On `resolveBuildCache`:
  - Cache miss → returns `null` (let Expo build as normal)
  - Cache hit → restores the artifact to the local cache directory
- On `uploadBuildCache`:
  - Reads the built artifact
  - Stores it in the hybrid cache
  - Copies it into the local cache directory for fast reuse

## When to use this provider

Use `expo-native-cache-provider` when you want:

- Faster **native iteration loops** for Android/iOS builds
- A clear separation between native build caching and JS/TS bundling concerns
- Optional S3 storage for sharing artifacts across machines or CI agents

