# Custom Repack Implementation Options

## What is Repack?

Repack = Taking an existing native binary (APK/.app) and injecting a new JavaScript bundle into it, skipping native compilation.

## Current Solution: Cache Provider

Our current provider achieves similar goals **without repacking**:

✅ Caches native binaries  
✅ Uses `@expo/fingerprint` (same as Repack)  
✅ Allows fresh JS via Metro bundler  
✅ Avoids unnecessary native rebuilds  

**Difference**: Metro serves JS separately (better for local dev) vs embedding JS in binary (needed for CI/CD).

## Custom Repack Implementation

If you want **actual repack** (injecting JS into binaries), here's what's involved:

### Android (APK)

1. **Extract APK** (it's a ZIP file)
   ```typescript
   import { extract } from 'tar';
   // APK is just a ZIP
   ```

2. **Replace JS Bundle**
   - Find: `assets/index.android.bundle`
   - Replace with new bundle

3. **Update Metadata**
   - Update `AndroidManifest.xml` if needed
   - Update version codes

4. **Re-sign APK**
   ```bash
   # Requires Android SDK tools
   apksigner sign --ks debug.keystore app.apk
   ```

5. **Repackage**
   - Zip everything back into APK

### iOS (.app)

1. **Extract .app bundle**
   - It's a directory structure

2. **Replace JS Bundle**
   - Find: `main.jsbundle` or similar
   - Replace with new bundle

3. **Update Info.plist**
   - Update bundle version if needed

4. **Re-sign** (complex!)
   ```bash
   # Requires certificates and provisioning profiles
   codesign --sign "Developer ID" MyApp.app
   ```

5. **Repackage**
   - Create new .app bundle

## Challenges

### ❌ Complexity
- Platform-specific code (Android vs iOS)
- Requires native tools (apksigner, codesign)
- Different bundle locations per platform

### ❌ Signing
- Android: Need keystore
- iOS: Need certificates + provisioning profiles
- Debug vs Release signing differs

### ❌ Compatibility
- Different Expo SDK versions have different bundle structures
- Native module changes affect bundle location
- App configuration affects structure

### ❌ Maintenance
- Expo updates might change bundle structure
- Need to handle edge cases
- Platform-specific bugs

## Recommended Approach

### Option 1: Keep Current Solution (Recommended)

Our cache provider already achieves the goal:
- ✅ Fast builds (cached native binaries)
- ✅ Fresh JS (Metro serves separately)
- ✅ Simple (no repack complexity)
- ✅ Works with Expo's tools

**For local dev, Metro serving JS is actually better** than embedding it.

### Option 2: Hybrid Approach

If you need embedded JS bundles:

1. **Use our cache provider** for local dev
   ```bash
   npx expo run:android  # Fast, Metro serves JS
   ```

2. **Use EAS Repack** for CI/CD
   ```yaml
   # .eas/workflows/ci.yml
   jobs:
     repack:
       type: repack  # Official Expo tool
   ```

3. **Custom repack only if**:
   - You need standalone binaries locally
   - You can't use EAS Workflows
   - You're willing to maintain platform-specific code

### Option 3: Custom Repack Implementation

If you really need custom repack, you'd need:

```typescript
// Pseudo-code - very simplified
async function repackBinary(
  binaryPath: string,
  newJSBundle: Buffer,
  platform: 'android' | 'ios'
): Promise<string> {
  if (platform === 'android') {
    // 1. Extract APK (ZIP)
    // 2. Replace assets/index.android.bundle
    // 3. Re-sign with debug keystore
    // 4. Repackage
  } else {
    // 1. Extract .app bundle
    // 2. Replace main.jsbundle
    // 3. Re-sign (complex!)
    // 4. Repackage
  }
}
```

**But this is:**
- ❌ Complex (hundreds of lines of code)
- ❌ Platform-specific
- ❌ Requires native tools
- ❌ Hard to maintain
- ❌ May break with Expo updates

## Recommendation

**Don't implement custom repack.** Instead:

1. ✅ **Local Dev**: Use our cache provider (current solution)
2. ✅ **CI/CD**: Use EAS Repack (official Expo tool)
3. ✅ **Both**: Use `@expo/fingerprint` (already integrated)

Our cache provider + Metro is actually **better for local dev** than repack because:
- Metro serves JS dynamically (hot reload works)
- No signing complexity
- No binary manipulation
- Simpler and more reliable

## If You Still Want Custom Repack

If you absolutely need it, I can help implement, but be aware:
- Will require significant code
- Platform-specific implementations
- Need to handle signing
- Maintenance burden
- May not work with all Expo versions

**What's your use case?** That will help determine if custom repack is needed or if our current solution works.



