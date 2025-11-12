# Creating Releases

## Quick Release Process

1. **Update version in `src-tauri/Cargo.toml`**:
   ```toml
   [package]
   version = "1.0.0"  # Update this
   ```

2. **Update version in `src-tauri/tauri.conf.json`**:
   ```json
   {
     "version": "1.0.0"  # Update this
   }
   ```

3. **Commit the version changes**:
   ```bash
   git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
   git commit -m "chore: bump version to 1.0.0"
   git push
   ```

4. **Create and push a version tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

5. **Wait for the build**: The release workflow will automatically:
   - Build for Linux (`.deb`, `.AppImage`, `.rpm`)
   - Build for macOS (`.dmg`)
   - Build for Windows (`.msi`, `.exe`)
   - Create a **draft release** on GitHub

6. **Publish the release**:
   - Go to your GitHub repository
   - Click **Releases** → find your draft release
   - Edit the description/changelog if needed
   - Click **Publish release**

## Quick Commands (Fish Shell)

```fish
# Example: Release version 1.0.0
set VERSION "1.0.0"

# Update versions (manually edit the files)
nano src-tauri/Cargo.toml
nano src-tauri/tauri.conf.json

# Commit and tag
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to $VERSION"
git push
git tag "v$VERSION"
git push origin "v$VERSION"
```

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):
- `v1.0.0` - Major release (breaking changes)
- `v1.1.0` - Minor release (new features)
- `v1.0.1` - Patch release (bug fixes)

## Artifacts

After the workflow completes, your release will have:

**Linux**:
- `Basitune_1.0.0_amd64.deb` - Debian/Ubuntu package
- `Basitune_1.0.0_amd64.AppImage` - Universal Linux app
- `Basitune-1.0.0-1.x86_64.rpm` - Fedora/RHEL package

**macOS**:
- `Basitune_1.0.0_x64.dmg` - Disk image installer

**Windows**:
- `Basitune_1.0.0_x64_en-US.msi` - MSI installer
- `Basitune_1.0.0_x64-setup.exe` - NSIS installer

## Troubleshooting

**Release workflow not triggered?**
- Make sure your tag starts with `v` (e.g., `v1.0.0`)
- Check that the tag was pushed: `git push origin v1.0.0`

**Build failing?**
- Check the Actions tab for error logs
- Ensure `OPENAI_API_KEY` is set in repository secrets

**Want to delete a release?**
```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Then delete the release from GitHub web interface
```
