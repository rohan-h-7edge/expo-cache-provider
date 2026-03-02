# Using Expo's Official @expo/fingerprint

## Overview

The native-only cache provider now uses **Expo's official `@expo/fingerprint`** package instead of a custom implementation.

## Why Use @expo/fingerprint?

✅ **Official Expo tool** - Maintained by Expo team  
✅ **Native-only by default** - Automatically excludes JS/TS files  
✅ **Platform-aware** - Handles Android and iOS differences  
✅ **Well-tested** - Used by EAS Build and EAS Workflows  
✅ **Consistent** - Same fingerprinting logic as EAS Repack  

## How It Works

The `@expo/fingerprint` package calculates a hash based on:

### ✅ Included (Native-Affecting):
- Expo SDK version
- Native dependencies (packages with native code)
- Native directories (`android/` or `ios/`)
- App configuration (`app.json` / `app.config.js`)
- Expo plugins
- Native module versions
- Platform-specific build settings

### ❌ Excluded (JS-Only):
- JavaScript/TypeScript source files
- React components
- Business logic
- UI code
- Any `.ts`, `.tsx`, `.js`, `.jsx` files outside native dirs

## Implementation

```typescript
import { createFingerprintAsync } from '@expo/fingerprint';

const fingerprint = await createFingerprintAsync(projectRoot, {
  platforms: [platform], // 'android' or 'ios'
});

// Returns: { hash: string, sources: FingerprintSource[] }
return fingerprint.hash;
```

## Benefits

1. **Consistency**: Same fingerprint as EAS Build/Workflows
2. **Reliability**: Official Expo tool, well-maintained
3. **Native-only**: Automatically excludes JS/TS files
4. **Platform-aware**: Handles Android/iOS differences correctly

## Migration from Custom Implementation

The custom fingerprint calculation has been replaced with:

**Before (Custom):**
```typescript
// Manual hash calculation
const hash = createHash('sha256');
hash.update(`expo:${expoVersion}`);
hash.update(`platform:${platform}`);
// ... many more manual steps
```

**After (Expo Official):**
```typescript
// Use Expo's official tool
const fingerprint = await createFingerprintAsync(projectRoot, {
  platforms: [platform],
});
return fingerprint.hash;
```

## Compatibility

- ✅ Works with EAS Build fingerprints
- ✅ Compatible with EAS Repack workflow
- ✅ Same hash calculation as Expo's official tools
- ✅ Supports both Android and iOS

## References

- [@expo/fingerprint npm](https://www.npmjs.com/package/@expo/fingerprint)
- [Expo Fingerprint Documentation](https://docs.expo.dev/fingerprint/)
- [EAS Repack Blog Post](https://expo.dev/blog/accelerating-continuous-integration-with-fingerprint-repack-in-eas-workflows)



