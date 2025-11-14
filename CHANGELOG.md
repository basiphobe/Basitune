# Changelog

All notable changes to Basitune will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
