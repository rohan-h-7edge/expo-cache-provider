# About Expo Repack

## Important: Repack is EAS Workflows Only

**Expo Repack is NOT available as a local tool or npm package.** It's only available as a pre-packaged job in **EAS Workflows** (cloud-based CI/CD).

## What is Repack?

Repack is an EAS Workflows feature that:
- Takes an existing EAS build (APK/.app)
- Injects a new JavaScript bundle into it
- Skips the entire native compilation step
- Returns a repacked binary with fresh JS

## Repack Availability

### ✅ Available In:
- **EAS Workflows** (`.eas/workflows/*.yml`)
- **CI/CD pipelines** (GitHub Actions, etc. via EAS)
- **Cloud-based builds** (EAS Build system)

### ❌ NOT Available For:
- Local `npx expo run:android/ios` commands
- Standalone npm package (`@expo/repack` doesn't exist)
- Direct programmatic use outside EAS

## Why Repack Isn't Available Locally

Repack requires:
1. **EAS Build system** - To access existing builds
2. **EAS infrastructure** - To repack binaries in the cloud
3. **EAS Workflows** - To orchestrate the repack job

These are cloud-only services, not available for local development.

## Our Provider vs Repack

### Similar Goals, Different Approaches

| Aspect | Expo Repack (EAS) | Our Provider (Local) |
|--------|-------------------|----------------------|
| **Environment** | EAS Cloud | Local development |
| **Command** | EAS Workflows | `npx expo run:*` |
| **JS Bundle** | Injected into binary | Metro serves separately |
| **Storage** | EAS Build system | Local disk + S3 |
| **Use Case** | CI/CD, PR testing | Local dev, testing |

### How They Work

**Repack (EAS Workflows):**
```
1. Calculate fingerprint
2. Find matching EAS build
3. Repack binary with new JS bundle ← Injects JS into binary
4. Return repacked binary
```

**Our Provider (Local):**
```
1. Calculate fingerprint (using @expo/fingerprint)
2. Find cached native binary
3. Use cached binary
4. Metro serves fresh JS separately ← JS served by Metro
```

## The Key Difference

- **Repack**: JS bundle is **injected into the binary** (for CI/CD testing)
- **Our Provider**: JS bundle is **served by Metro** (for local development)

Both achieve the same goal (avoid native rebuilds when only JS changes), but:
- Repack creates a **standalone binary** with JS embedded
- Our provider uses **Metro bundler** to serve JS dynamically

## When to Use Each

### Use Expo Repack When:
- ✅ Running CI/CD pipelines
- ✅ Need standalone binaries for testing
- ✅ Using EAS Workflows
- ✅ PR smoke testing
- ✅ Internal QA builds

### Use Our Provider When:
- ✅ Local development (`npx expo run:android/ios`)
- ✅ Want fast local builds
- ✅ Metro bundler is available
- ✅ Development/QA profiles

## Can We Use Repack Locally?

**No.** Even with `eas build --local`, Repack is not available because:

1. **Repack is a Workflows job type**, not a CLI command
2. **Repack needs EAS Build history** (cloud-only) to find existing builds
3. **No `eas repack` command exists** - it's only available as a Workflows job

However, our provider achieves the same goal for local development:

1. ✅ Uses same fingerprinting (`@expo/fingerprint`)
2. ✅ Caches native binaries
3. ✅ Allows fresh JS bundles
4. ✅ Avoids unnecessary native rebuilds

The difference is **how JS is delivered**:
- Repack: Embedded in binary
- Our Provider: Served by Metro (better for local dev)

## Conclusion

**Repack is EAS-only.** For local development, our provider is the equivalent solution that:
- Uses Expo's official `@expo/fingerprint`
- Caches native binaries
- Allows Metro to serve fresh JS

Both solve the same problem (avoid native rebuilds) but for different environments.

## References

- [EAS Repack Blog Post](https://expo.dev/blog/accelerating-continuous-integration-with-fingerprint-repack-in-eas-workflows)
- [EAS Workflows Documentation](https://docs.expo.dev/eas/workflows/)
- [@expo/fingerprint](https://www.npmjs.com/package/@expo/fingerprint)

