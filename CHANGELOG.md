# Changelog

All notable changes to Basitune will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Ghost playback: Intercept and block YouTube Music's internal video.play() calls during inactivity (>5 min) to prevent unwanted overnight playback
- Auto-advance no longer triggers after 5 minutes of inactivity, fully preventing ghost playback when computer is unattended
- Added comprehensive debug logging to track playback triggers and diagnose ghost playback issues

## [1.0.29] - 2026-01-01

### Added
- User-configurable setting to control automatic playback resumption on app startup
  - New "Automatically resume playback when the app starts" option in Settings tab
  - Enabled by default to maintain current behavior
  - When disabled, app will restore position but stay paused

### Fixed
- Auto-advance feature no longer triggers when window is hidden, preventing ghost playback after overnight runtime
- Playback position now saves reliably on quit (increased delay and made invoke async)
- Playback restoration now only triggers on app launch, not on YouTube Music page reloads (session-based flag instead of time-based throttle)
- Lyrics tab now fetches lyrics when opened even if song hasn't changed (improved robustness)
- Song context errors now display helpful messages instead of failing silently
- AI-generated content (artist info, song context) now validates cache entries to prevent serving empty responses from failed API calls

## [1.0.28] - 2025-12-31

### Changed
- **Major internal refactoring**: Modularized codebase for improved maintainability
  - Split monolithic 2117-line main.rs into 12 focused modules
  - Created dedicated modules: config, cache, utils, ai (openai/genius), discord, playback, tray, notifications, sidebar, updater
  - Organized JavaScript injection scripts into src/scripts/ directory
  - No user-facing changes or breaking API modifications

### Fixed
- Ghost playback and audio dropout after extended runtime (overnight)
  - Skips volume restoration during inactivity periods (>5 minutes) to prevent spurious volume changes
  - Prevents playback state updates when window is hidden (reduces unnecessary monitoring)
  - Fixes volume restoration loop that caused silent playback with moving playhead

## [1.0.27] - 2025-12-29

### Changed
- Discord Rich Presence now displays custom Basitune logo instead of default placeholder icon
  - Large image shows app branding in user profiles
  - Small overlay icon also uses Basitune logo

## [1.0.26] - 2025-12-28

### Added
- Clicking notification body now brings main window to focus (Linux only)
  - Shows window if hidden, unminimizes if minimized
  - Requests attention via taskbar if window is on another virtual desktop
  - Previous/Next buttons in notifications continue to work as before

### Fixed
- Playback restoration no longer triggers on YouTube Music's background page refreshes
  - Uses localStorage with time-based restriction (minimum 5 minutes between restore attempts)
  - Prevents random auto-play when app is idle or unattended
  - Fixes audio buffer corruption that caused 10-15 second pause/play delays

## [1.0.25] - 2025-12-27

### Fixed
- Playback restoration no longer triggers on YouTube Music's background page refreshes
  - Uses localStorage with time-based restriction (minimum 5 minutes between restore attempts)
  - Prevents random auto-play when app is idle or unattended
  - Fixes audio buffer corruption that caused 10-15 second pause/play delays

## [1.0.25] - 2025-12-27

LLMLibs

## [1.0.24] - 2025-12-25

### Added
- Playback position persistence: saves current song position when quitting, restores on next startup
  - Only restores if the same song is loaded (matches by artist and title)
  - Resumes playback automatically if song was playing when quit
  - Prevents duplicate restore attempts when YouTube Music reloads pages

## [1.0.23] - 2025-12-20

### Added
- Dynamic tray menu with playback controls (Play/Pause, Stop, Previous/Next Track)
- Smart menu visibility: Stop button only appears when music is playing or paused (not when just loaded)
- Three-state playback detection (none/paused/playing) for accurate menu state
- Current song display in tray menu (shows "♪ Title - Artist" as first menu item when playing)
- Desktop notifications when songs change (configurable in Settings)
  - Shows song title, artist, album, and duration
  - Interactive Previous/Next track buttons in notifications (Linux only)
  - 300ms delay to prevent UI glitches when triggered by button actions

### Changed
- Optimized volume-fix.js polling from 200ms to 500ms for better performance
- Tray menu now updates dynamically based on playback state
- Faster menu response time (50ms state updates)
- Improved playback state detection to distinguish between loaded vs played content
- Temporarily disabled volume-fix.js injection to test audio dropout fix

### Technical
- Updated PlaybackState from boolean to three-state string enum ("none"/"paused"/"playing")
- Created playback-controls.js with YouTube Music DOM control functions
- Implemented update_playback_state Tauri command for state synchronization
- Added notify-rust dependency for desktop notifications
- Added dynamic tray menu rebuilding based on playback state
- Fixed Tauri v2 API compatibility (__TAURI_INTERNALS__.invoke)
- Extended PlaybackState with current_song storage (title, artist)
- Implemented update_tray_tooltip command for song info synchronization
- Menu-based song display (KDE/AppIndicator doesn't support tooltips)
- Added notify-rust crate for cross-platform desktop notifications
- Implemented show_notification Tauri command with enable_notifications config setting
- Song change notifications skip initial load, only trigger when tracks change

## [1.0.22] - 2025-12-17

### Added
- System tray icon with menu support (Show/Hide, Quit)
- "Close to system tray" option in Settings tab
- Window can now minimize to tray instead of closing when setting is enabled
- Left-click tray icon to toggle window visibility
- Right-click tray icon for menu options
- Tray icon tooltip displays "Basitune"

### Changed
- Window close behavior now respects close-to-tray setting
- Added `tray-icon` feature to Tauri for system tray support
- Added `image` crate dependency for icon loading
- Settings now persist close-to-tray preference

### Technical
- Enabled built-in Tauri v2 tray functionality with `tray-icon` feature
- Added `core:tray:default` permission to capability configuration
- Implemented tray menu with event handlers for show/hide and quit actions
- Extended ApiConfig struct with `close_to_tray` field
- Updated frontend settings UI to include tray preference checkbox

## [1.0.21] - 2025-12-17

### Fixed
- About tab links now properly open in system default browser
- Added shell plugin permissions (`shell:allow-open`) required by Tauri v2 security model
- Configured capability-based permissions for external URL handling

## [1.0.20] - 2025-12-17

### Added
- New About tab with app metadata and version info
- Clickable links to GitHub repository and official website (🐙 GitHub, 🌐 Website)
- Vertical navigation tabs with icons for better scalability (🎤 Artist, 📝 Lyrics, ⚙️ Settings, ℹ️ About)
- Tauri command `get_app_metadata()` for displaying app information
- Professional sidebar layout with tabs positioned on the right side

### Changed
- Refactored horizontal tabs to vertical tabs on the right side of sidebar
- Doubled default sidebar width from 380px to 760px for better content visibility
- Moved font size controls to header row (no longer competing with tabs for space)
- Updated tab styling with accent bars, hover effects, and smooth animations
- Version number now syncs correctly with git tags (fixed from 0.1.x to 1.0.x)
- Replaced changelog viewer with direct links to external resources

### Fixed
- Removed tag trigger from build.yml workflow to prevent duplicate workflow runs
- Version mismatch between git tags and app version resolved

## [1.0.19] - 2025-12-15

### Fixed
- Fixed auto-update signing by correcting workflow to write key file without base64 decoding (secret already contains correct format)
- Changed environment variable from TAURI_SIGNING_PRIVATE_KEY_PATH to TAURI_SIGNING_PRIVATE_KEY (Tauri auto-detects file paths)
- Signature files (.sig) now generate successfully for secure package verification

## [1.0.18] - 2025-12-14

### Fixed
- Attempted fix for signing environment variable (incorrect - was not the issue)

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
- Corrected environment variable name to TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD per Tauri v2 documentation

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
