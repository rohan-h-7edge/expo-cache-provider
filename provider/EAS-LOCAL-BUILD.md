# EAS Build --local and Repack

## EAS Build --local

Yes! `eas build --local` runs builds on your local machine instead of EAS servers. However, there are important distinctions:

### What `eas build --local` Does:
- ✅ Runs the native build process locally
- ✅ Uses your local machine's resources
- ✅ Still uses EAS CLI and build configuration
- ✅ Can use EAS Build cache (if configured)

### What `eas build --local` Does NOT Do:
- ❌ Does NOT run EAS Workflows locally
- ❌ Does NOT have access to Repack job type
- ❌ Does NOT have access to EAS Build history for repacking

## Repack Availability

### Repack is EAS Workflows Only

Repack is a **pre-packaged job type** in EAS Workflows (`.eas/workflows/*.yml`), not a CLI command:

```yaml
# .eas/workflows/ci.yml
jobs:
  repack:
    type: repack  # ← This is a Workflows job, not a CLI command
    params:
      build_id: ${{ needs.get_build.outputs.build_id }}
```

**Repack is NOT available as:**
- ❌ `eas repack` command
- ❌ `eas build --local --repack` flag
- ❌ Standalone npm package

## Why Repack Needs EAS Infrastructure

Repack requires:
1. **EAS Build History** - To find existing builds by fingerprint
2. **EAS Storage** - To access build artifacts
3. **EAS Workflows** - To orchestrate the repack job
4. **Cloud Processing** - To repack binaries

These are **cloud-only** services, even with `--local` builds.

## Local Alternatives

### Option 1: Our Cache Provider (Current Solution)

Our provider achieves similar functionality for local development:

```bash
npx expo run:android  # Uses our cache provider
```

**How it works:**
- Uses `@expo/fingerprint` (same as Repack)
- Caches native binaries locally/S3
- Metro serves fresh JS bundles
- No EAS infrastructure needed

### Option 2: EAS Build --local with Cache

You can use `eas build --local` with EAS Build cache:

```bash
eas build --local --platform android
```

**Limitations:**
- Still does full native build (no repack)
- Can use EAS Build cache for dependencies
- But can't repack existing builds

### Option 3: Hybrid Approach

Use both:

1. **Local Development**: Our cache provider
   ```bash
   npx expo run:android  # Fast local builds
   ```

2. **CI/CD**: EAS Workflows with Repack
   ```yaml
   # .eas/workflows/ci.yml
   jobs:
     repack:
       type: repack  # Fast CI builds
   ```

## Comparison

| Feature | EAS Build --local | EAS Repack (Workflows) | Our Provider |
|---------|-------------------|------------------------|--------------|
| **Location** | Local machine | EAS Cloud | Local machine |
| **Repack** | ❌ No | ✅ Yes | ❌ No (Metro serves JS) |
| **Cache** | ✅ EAS Build cache | ✅ EAS Build history | ✅ Local/S3 cache |
| **JS Bundle** | Embedded in build | Injected via repack | Metro serves separately |
| **Use Case** | Local production builds | CI/CD testing | Local development |

## Can We Use Repack Locally?

**Short answer: No.**

Repack is a Workflows job type that requires:
- EAS Build history (cloud)
- EAS storage (cloud)
- EAS Workflows infrastructure (cloud)

Even with `eas build --local`, you can't access Repack because:
1. No `eas repack` command exists
2. Repack needs EAS Build history (cloud-only)
3. Repack is a Workflows feature, not a CLI feature

## Recommended Approach

### For Local Development:
```bash
# Use our cache provider
npx expo run:android
```

**Benefits:**
- Fast builds (cached native binaries)
- Fresh JS via Metro
- No EAS infrastructure needed
- Works offline

### For CI/CD:
```yaml
# Use EAS Workflows with Repack
.eas/workflows/ci.yml:
  jobs:
    repack:
      type: repack
```

**Benefits:**
- Fast CI builds (repack existing builds)
- Standalone binaries for testing
- EAS infrastructure

## Conclusion

- ✅ `eas build --local` exists and works
- ❌ Repack is NOT available with `--local`
- ✅ Our provider is the local equivalent of Repack
- ✅ Use both: Our provider (local) + EAS Repack (CI/CD)

## References

- [EAS Build Local](https://docs.expo.dev/build-reference/local-builds/)
- [EAS Workflows](https://docs.expo.dev/eas/workflows/)
- [EAS Repack Blog](https://expo.dev/blog/accelerating-continuous-integration-with-fingerprint-repack-in-eas-workflows)



