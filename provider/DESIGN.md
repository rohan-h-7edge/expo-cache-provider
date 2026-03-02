# Native-Only Cache Provider Design

## Requirements Summary

### Core Behavior
- ✅ Cache **native build artifacts only** (APK/.app)
- ✅ **Do NOT** invalidate cache on JS/TS changes
- ✅ Always allow Metro to serve fresh JS
- ✅ Support: `development`, `qa`
- ❌ Block: `production`

### Fingerprint Strategy

**Include (Native-Affecting):**
- Expo SDK version
- Platform (android/ios)
- Profile (development/qa)
- `android/` and `ios/` directories (if exist)
- Expo plugins (from app.json)
- Native module versions (from package.json)
- Native-affecting fields from app.json:
  - `android.package`
  - `android.versionCode`
  - `ios.bundleIdentifier`
  - `ios.buildNumber`
  - `expo.plugins`
  - `expo.sdkVersion`

**Exclude (JS-Only):**
- JS/TS source files (`src/`, `app/`, `components/`, etc.)
- React components
- Business logic
- UI code
- Any `.ts`, `.tsx`, `.js`, `.jsx` files outside native dirs

### Cache Key Format
```
expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>
```

Examples:
- `expo-native-cache/development/android/fingerprint.abc123.apk`
- `expo-native-cache/qa/ios/fingerprint.xyz789.app`

### Profile Detection

From `runOptions`:
- Android: `variant === "debug"` → `development`, `variant === "release"` → check further
- iOS: `configuration === "Debug"` → `development`, `configuration === "Release"` → check further
- Default: `development` (if dev-client present)
- Production: `variant === "release"` AND no dev-client → `production` (BLOCK)

### Guardrails Implementation

```typescript
function shouldUseCache(profile: string): boolean {
  if (profile === "production") {
    logger.warn("Cache SKIP: Production builds are not cached");
    return false;
  }
  return true;
}

function getCacheKey(profile: string, platform: string, fingerprint: string, ext: string): string {
  return `expo-native-cache/${profile}/${platform}/${fingerprint}.${ext}`;
}
```

## Proposed File Structure

```
provider/
├─ src/
│  ├─ index.ts                    # Main plugin export (default export)
│  ├─ fingerprint/
│  │  └─ nativeFingerprint.ts    # calculateFingerprintHash implementation
│  ├─ local/
│  │  └─ DiskCache.ts            # Local disk cache operations
│  ├─ s3/
│  │  └─ S3Cache.ts              # S3 remote cache operations
│  ├─ hybrid/
│  │  └─ HybridCache.ts          # Local-first + S3 fallback logic
│  └─ utils/
│     ├─ hash.ts                 # Hashing utilities
│     ├─ logger.ts               # Logging utility
│     └─ guards.ts               # Profile/platform guards
├─ tsconfig.json
└─ package.json (if separate package)
```

## Implementation Details

### 1. `calculateFingerprintHash` (nativeFingerprint.ts)

```typescript
async function calculateNativeFingerprint(
  projectRoot: string,
  platform: 'android' | 'ios',
  runOptions: RunOptions
): Promise<string> {
  const hash = createHash('sha256');
  
  // 1. Expo SDK version
  const expoVersion = await getExpoSDKVersion(projectRoot);
  hash.update(`expo:${expoVersion}`);
  
  // 2. Platform
  hash.update(`platform:${platform}`);
  
  // 3. Native directories (android/ or ios/)
  if (platform === 'android') {
    await hashDirectory(path.join(projectRoot, 'android'), hash);
  } else {
    await hashDirectory(path.join(projectRoot, 'ios'), hash);
  }
  
  // 4. Native-affecting app.json fields
  const appConfig = await getAppConfig(projectRoot);
  hash.update(`package:${appConfig.android?.package || ''}`);
  hash.update(`versionCode:${appConfig.android?.versionCode || ''}`);
  hash.update(`bundleId:${appConfig.ios?.bundleIdentifier || ''}`);
  hash.update(`buildNumber:${appConfig.ios?.buildNumber || ''}`);
  hash.update(`plugins:${JSON.stringify(appConfig.plugins || [])}`);
  
  // 5. Native module versions (from package.json)
  const nativeModules = await getNativeModules(projectRoot);
  for (const module of nativeModules) {
    hash.update(`${module.name}:${module.version}`);
  }
  
  return hash.digest('hex');
}
```

### 2. Profile Detection

```typescript
function detectProfile(
  runOptions: RunOptions,
  projectRoot: string
): 'development' | 'qa' | 'production' {
  const hasDevClient = hasDirectDevClientDependency(projectRoot);
  
  // Android
  if ('variant' in runOptions) {
    if (runOptions.variant === 'debug') return 'development';
    if (runOptions.variant === 'release' && !hasDevClient) return 'production';
    if (runOptions.variant === 'release' && hasDevClient) return 'qa';
  }
  
  // iOS
  if ('configuration' in runOptions) {
    if (runOptions.configuration === 'Debug') return 'development';
    if (runOptions.configuration === 'Release' && !hasDevClient) return 'production';
    if (runOptions.configuration === 'Release' && hasDevClient) return 'qa';
  }
  
  // Default
  return hasDevClient ? 'development' : 'production';
}
```

### 3. Cache Flow

**Resolve (read):**
```
1. Detect profile → if production: SKIP, return null
2. Calculate native fingerprint
3. Build cache key: expo-native-cache/{profile}/{platform}/{fingerprint}.{ext}
4. Check local disk
   - HIT → return path
   - MISS → check S3
     - HIT → download → save locally → return path
     - MISS → return null
```

**Upload (write):**
```
1. Detect profile → if production: SKIP, return null
2. Calculate native fingerprint
3. Build cache key
4. Save to local disk
5. Upload to S3 (if writeThrough enabled)
6. Return local path
```

## Questions to Resolve

1. **Profile Detection**: 
   - How to distinguish `qa` from `production`?
   - Should we use environment variable `EXPO_PROFILE`?
   - Or infer from variant + dev-client presence?

2. **Native Module Detection**:
   - Parse `package.json` for known native modules?
   - Check for `android/` or `ios/` in `node_modules/<package>`?
   - Use Expo autolinking info?

3. **Fingerprint Granularity**:
   - Should ANY native dependency change invalidate cache?
   - Or only Expo plugins?
   - Or only app.json native config?

## Proposed Answers

1. **Profile**: Use `variant/configuration` + dev-client presence:
   - `debug`/`Debug` → `development`
   - `release`/`Release` + dev-client → `qa`
   - `release`/`Release` + no dev-client → `production` (BLOCK)

2. **Native Modules**: Check `node_modules` for `android/` or `ios/` directories, plus known Expo modules

3. **Fingerprint**: Include all native-affecting inputs for safety

## Next Steps

1. ✅ Finalize design (this document)
2. ⏳ Implement fingerprint calculation
3. ⏳ Implement profile detection
4. ⏳ Implement guardrails
5. ⏳ Implement cache providers
6. ⏳ Test with different profiles





