# Changelog

All notable changes to Basitune will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.18] - 2025-12-14

### Fixed
- Corrected password environment variable back to TAURI_KEY_PASSWORD (verified working with local tests)

## [1.0.17] - 2025-12-14

### Fixed
- Corrected password environment variable to TAURI_SIGNING_PRIVATE_KEY_PASSWORD (the actual env var Tauri expects)

## [1.0.16] - 2025-12-14

### Fixed
- Regenerated signing keypair with simpler password to avoid special character encoding issues in CI/CD

## [1.0.15] - 2025-12-14

### Fixed
- Corrected environment variable name to TAURI_SIGNING_PRIVATE_KEY (not TAURI_PRIVATE_KEY) as required by Tauri v2

## [1.0.14] - 2025-12-14

### Fixed
- Enabled createUpdaterArtifacts in bundle configuration to generate signature files for secure auto-updates

## [1.0.13] - 2025-12-14

### Fixed
- Corrected environment variable name for Tauri signing (TAURI_PRIVATE_KEY) to properly generate signature files

## [1.0.12] - 2025-12-14

### Added
- Configured Tauri update signing with cryptographic keypair for secure auto-updates
- Public key added to updater configuration for signature verification

### Changed
- Auto-updates now require valid signatures from release workflow

## [1.0.11] - 2025-12-14

### Fixed
- Updater manifest now includes signature files for secure updates
- Release workflow uploads .sig files alongside binaries for signature verification
- Auto-updates now work properly with cryptographic signature validation

## [1.0.10] - 2025-12-14

### Fixed
- GitHub Actions release workflow now builds correctly without passing unsupported --target flag to Tauri CLI v2

## [1.0.9] - 2025-12-14

### Added
- Settings tab in sidebar for in-app API key configuration
- Get and save config commands in Tauri backend
- UI for entering OpenAI API key and Genius Access Token without editing config files
- Visual feedback (loading, success, error states) when saving settings
- Password input fields with focus styling for API keys

### Changed
- API configuration is now user-friendly with dedicated Settings tab alongside Artist and Lyrics tabs
- Settings are automatically loaded when switching to Settings tab

## [1.0.8] - 2025-12-14

### Fixed
- GitHub Actions release workflow now checks for directory existence before attempting to upload bundle artifacts, preventing ENOENT errors when specific bundle formats aren't generated

## [1.0.7] - 2025-12-14

### Fixed
- Updater manifest now detects architectures from asset filenames so macOS and Windows downloads match the user's CPU
- Release builds are generated with the matrix target passed through Tauri to ensure matching binaries for each platform

## [1.0.6] - 2025-12-14

### Changed
- GitHub release workflow now publishes releases immediately (no drafts) so updates can flow to users without manual promotion

### Fixed
- Updater checks are skipped in debug/dev builds to avoid noisy failures during development runs

## [1.0.5] - 2025-12-14

### Fixed
- Cleaned up Clippy warnings in the Rust backend to keep release builds lint-free

## [1.0.4] - 2025-12-14

### Fixed
- Release build version now comes from the tagged version to keep installer metadata accurate

## [1.0.3] - 2024-11-16

### Added
- Volume bridge that syncs YouTube Music's UI slider to the underlying media element (WebKit workaround)
- Trusted Types-safe sidebar rendering with clear logging for data fetch/render steps

### Changed
- Sidebar injection is now tied to page load, with duplicate-injection guards and cleanup
- Sidebar hide/show updates `--sidebar-width` and layout so collapsing no longer leaves an empty pane

### Fixed
- Sidebar content (artist info, song context, lyrics) now renders reliably on YouTube Music despite TT CSP
- Collapsing the sidebar no longer leaves a black placeholder; the main UI reclaims the space

## [1.0.2] - 2024-11-15

### Added
- Automatic update downloads with visual progress notifications
- Runtime configuration file support for API keys (works alongside environment variables)
- Beautiful animated notification UI for update status
- Progress bar during update downloads
- Platform-specific config.json documentation for end users

### Changed
- API keys now read from environment variables first, then config.json fallback
- Update system now auto-downloads and prompts user to restart instead of showing dialog
- Configuration now works for both development (env vars) and distribution (config file)

### Fixed
- Release builds now correctly read API keys from environment variables
- ImageMagick installation in GitHub Actions CI/CD workflow
- Fish shell syntax in documentation (replaced heredoc with printf)

## [1.0.1] - 2024-11-14

### Added
- Conditional "Go Back" button for lyrics navigation - appears only when viewing lyrics from search results
- Clickable suggestion items in lyrics search results for easier navigation
- Field labels for manual lyrics search form inputs
- Result type filtering to prevent fetching non-song content from Genius API
- Prose content validation for cached lyrics to detect and re-fetch literature pages

### Changed
- Search button styling updated to full-width for visual consistency with input fields
- Improved search form UI with better spacing and layout
- Enhanced Genius API search filtering to exclude non-song content (literature, books, etc.)

### Fixed
- "Go Back" button now preserves search results state correctly
- Search suggestions no longer disappear when navigating back from lyrics view
- Exact lyric matches no longer show unnecessary "Go Back" button

## [0.1.71] - Previous Version

### Features
- Artist information sidebar with Wikipedia integration
- Lyrics fetching from Genius API
- Song context analysis using AI
- Discord Rich Presence integration
- Window state persistence
- Adjustable sidebar width and font size
- Caching for artist info, song context, and lyrics
