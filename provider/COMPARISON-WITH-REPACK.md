# Comparison: Native-Only Cache Provider vs Expo's Repack

## Overview

Both solutions solve a similar problem: **avoiding unnecessary native builds when only JavaScript changes**. However, they target different use cases and environments.

## Expo's Repack Workflow

**What it is:**
- EAS Workflows feature (cloud-based)
- Uses `@expo/fingerprint` for native fingerprinting
- Repacks existing EAS builds with new JS bundle
- Integrated into CI/CD pipelines

**Use cases:**
- ✅ PR smoke testing
- ✅ Internal QA builds
- ✅ CI/CD automation
- ❌ App Store submissions (production)

**How it works:**
1. Calculate fingerprint hash (native dependencies)
2. Check if matching EAS build exists
3. If yes: Repack existing build with new JS bundle
4. If no: Trigger full native build
5. Run tests against repacked/fresh build

**Performance:**
- Full build: ~23 minutes
- Repack: ~5 minutes
- **78% reduction** in CI time

## Our Native-Only Cache Provider

**What it is:**
- Local/S3 cache provider for `npx expo run:android/ios`
- Custom `calculateFingerprintHash` (excludes JS files)
- Caches native binaries (APK/.app) locally and in S3
- Works with Expo's build cache provider API

**Use cases:**
- ✅ Local development (`npx expo run:android`)
- ✅ Development builds (debug)
- ✅ QA builds (release with dev-client)
- ❌ Production builds (explicitly blocked)

**How it works:**
1. Calculate native-only fingerprint (excludes JS)
2. Check local disk cache
3. If miss: Check S3 cache
4. If hit: Download and use cached native binary
5. Metro always bundles fresh JS (separate from native cache)

**Performance:**
- Full build: Varies (depends on project)
- Cache hit: ~seconds (download + Metro bundling)
- **Near-instant** native binary reuse

## Key Differences

| Feature | Expo Repack | Our Provider |
|---------|-------------|--------------|
| **Environment** | EAS Cloud (CI/CD) | Local development |
| **Target** | EAS Workflows | `npx expo run:*` |
| **Storage** | EAS Build system | Local disk + S3 |
| **Fingerprint** | `@expo/fingerprint` | Custom (native-only) |
| **JS Bundle** | Injected into binary | Metro serves separately |
| **Use Case** | CI/CD, QA | Local dev, testing |
| **Production** | ❌ Not for App Store | ❌ Explicitly blocked |

## When to Use Each

### Use Expo Repack When:
- ✅ Running CI/CD pipelines
- ✅ Need EAS Build integration
- ✅ Want cloud-based workflow
- ✅ PR smoke testing
- ✅ Internal QA builds

### Use Our Native-Only Cache Provider When:
- ✅ Local development (`npx expo run:android/ios`)
- ✅ Want local disk caching
- ✅ Need S3-compatible storage
- ✅ Self-hosted infrastructure
- ✅ Development/QA profiles only

## Complementary Use Cases

These solutions are **complementary**, not competing:

1. **Local Development**: Use our provider for fast local builds
2. **CI/CD**: Use Expo Repack for cloud-based workflows
3. **Both**: Use fingerprinting to avoid unnecessary native builds

## Implementation Similarities

Both solutions:
- ✅ Calculate native-only fingerprints
- ✅ Exclude JS/TS files from fingerprint
- ✅ Cache/reuse native binaries
- ✅ Allow fresh JS bundles
- ✅ Block production builds (or warn against them)

## Implementation Differences

### Fingerprint Calculation

**Expo Repack:**
```typescript
// Uses @expo/fingerprint
import { createFingerprintAsync } from '@expo/fingerprint';

const fingerprint = await createFingerprintAsync(projectRoot, {
  platforms: ['android', 'ios'],
});
```

**Our Provider:**
```typescript
// Custom implementation
async function calculateNativeFingerprint(
  projectRoot: string,
  platform: 'android' | 'ios',
  runOptions: RunOptions
): Promise<string> {
  // Includes: Expo SDK, platform, native dirs, native modules
  // Excludes: JS/TS source files
}
```

### Cache Strategy

**Expo Repack:**
- Checks EAS Build system for matching fingerprint
- Repacks existing EAS build with new JS bundle
- Stores in EAS (cloud)

**Our Provider:**
- Checks local disk cache first
- Falls back to S3 cache
- Stores locally + optionally in S3

## Best Practices

### For Local Development
1. Use our native-only cache provider
2. Fast local builds with S3 backup
3. Metro always serves fresh JS

### For CI/CD
1. Use Expo Repack in EAS Workflows
2. Leverage EAS Build system
3. Fast PR smoke tests

### For Both
1. Calculate native-only fingerprints
2. Avoid unnecessary native builds
3. Always allow fresh JS bundles

## Conclusion

Both solutions solve the same core problem (avoiding native builds when only JS changes) but target different environments:

- **Expo Repack**: Cloud-based CI/CD workflows
- **Our Provider**: Local development with S3 backup

They can be used together in a complete development workflow:
- Local dev → Our provider (fast local builds)
- CI/CD → Expo Repack (cloud-based automation)

## References

- [Expo Repack Blog Post](https://expo.dev/blog/accelerating-continuous-integration-with-fingerprint-repack-in-eas-workflows)
- [@expo/fingerprint](https://www.npmjs.com/package/@expo/fingerprint)
- [EAS Workflows](https://docs.expo.dev/eas/workflows/)



