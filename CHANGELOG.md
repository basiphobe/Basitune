# Changelog

All notable changes to Basitune will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
