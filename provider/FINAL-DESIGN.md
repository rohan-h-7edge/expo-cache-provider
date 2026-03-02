# Final Design: Native-Only Cache Provider

## ✅ Finalized Decisions

### Profile Detection
```typescript
function detectProfile(runOptions, projectRoot): 'development' | 'qa' | 'production' {
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
  
  // Default: development if dev-client, production otherwise
  return hasDevClient ? 'development' : 'production';
}
```

### Native Fingerprint Calculation

**Include:**
1. Expo SDK version (from package.json)
2. Platform (android/ios)
3. Native directories: `android/` or `ios/` (if exist, after prebuild)
4. Native-affecting app.json fields:
   - `android.package`
   - `android.versionCode`
   - `ios.bundleIdentifier`
   - `ios.buildNumber`
   - `expo.plugins` (array)
   - `expo.sdkVersion`
5. Native module versions (packages with `android/` or `ios/` in node_modules)

**Exclude:**
- All JS/TS files in `src/`, `app/`, `components/`, etc.
- Any `.ts`, `.tsx`, `.js`, `.jsx` files outside native dirs
- Business logic, UI code, React components

### Cache Key Format
```
expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>
```

Examples:
- `expo-native-cache/development/android/abc123def456.apk`
- `expo-native-cache/qa/ios/xyz789.app`

### Guardrails
- ✅ Skip if `profile === 'production'` → return `null` immediately
- ✅ Never reuse across platforms (platform in key)
- ✅ Never reuse across profiles (profile in key)
- ✅ Log all decisions: `[Cache] [INFO] Cache HIT/MISS/SKIP`

## Implementation Structure

```
provider/
├─ src/
│  ├─ index.ts                    # Main plugin (default export)
│  ├─ fingerprint/
│  │  └─ nativeFingerprint.ts    # calculateFingerprintHash
│  ├─ local/
│  │  └─ DiskCache.ts            # Local disk operations
│  ├─ s3/
│  │  └─ S3Cache.ts              # S3 operations
│  ├─ hybrid/
│  │  └─ HybridCache.ts          # Local-first + S3 fallback
│  └─ utils/
│     ├─ hash.ts                 # Hashing utilities
│     ├─ logger.ts               # Logging
│     └─ guards.ts               # Profile/platform guards
└─ tsconfig.json
```

## Ready to Implement

All design decisions finalized. Ready to proceed with implementation.





