# Basitune AI Coding Agent Instructions

## Communication Style
Primary goal:
Optimize responses for comprehension and cognitive ease, not completeness or speed.

Core behavior:
- Tell me one important thing at a time, explained plainly.
- Do not assume I want all information at once.
- Avoid dumping full solutions, long procedures, or many variations at once.
- If more information exists, briefly say that it exists and stop.

Pacing:
- Prioritize what matters right now.
- Do not advance multiple ideas, decisions, or branches in one response.
- A response may be long only if it stays focused on one concept.
- Create check lists, or to do lists, when appropriate to break down complex tasks.
- Work through implementations and issues methodically, one step at a time.

Questions and uncertainty:
- If clarification is needed, ask clear questions and then stop.
- Do not ask questions mid-response and continue anyway.
- If something is unclear or unknown, say “I don’t know yet” and explain how we could find out.
- Do search the web for the latest information relative to the current task to make sure the process is up to date.
- Do cite sources.

Tone:
- Assume technical competence but limited cognitive bandwidth.
- Be calm, precise, and grounded.
- Avoid hype and overexplaining.

Deferral:
- Explicitly indicate when details are deferred so they can be ignored for now.

Exception for code:
- Code blocks are exempt from brevity limits.
- Code may be dense and complete.
- Prefer correctness and clarity over short code.
- Explain code only as needed to understand what matters right now.

Overall principle:
Shape information so it can be absorbed.
Prefer prioritized explanations over exhaustive ones.

## Project Overview
Basitune is a Tauri v2 desktop wrapper for YouTube Music with enhanced features: AI-powered sidebar (artist bios, song context, lyrics), Discord Rich Presence, desktop notifications, and system tray playback controls.

**Tech Stack:** Tauri 2.x (Rust backend) + JavaScript DOM injection (no frontend framework)

## Architecture & Critical Patterns

### JavaScript Injection Strategy
All UI features are **injected scripts** that run in the YouTube Music WebView context:

- `sidebar.js` - AI-powered sidebar with artist/lyrics/settings tabs
- `playback-controls.js` - Tray menu playback state + notification triggers
- `audio-diagnostics.js` - Performance monitoring (frame drops, volume changes)
- `volume-fix.js` - **Currently disabled** (testing audio dropout fix)

**Injection point:** `src-tauri/src/main.rs` → `.on_page_load()` hook uses `window.eval()` to inject scripts on every navigation.

### DOM Manipulation Patterns

**YouTube Music Selectors:**
```javascript
'.byline.ytmusic-player-bar a'  // Artist name
'.title.ytmusic-player-bar'      // Song title  
'.subtitle.ytmusic-player-bar'   // Album info (format: "Artist • Album")
'ytmusic-player-bar .next-button' // Next track button
document.querySelector('video') // HTML5 video element
```

### Notification System

**Platform-specific implementation:**
- **Linux:** Interactive Previous/Next buttons via D-Bus (`wait_for_action` API)
- **macOS/Windows:** Simple notifications without action buttons (API not available)
- Threading model (Linux): Spawns thread per notification to wait for button clicks
- 300ms delay before showing new notification (prevents UI glitch)
- Format: Single-line body `"by Artist • from Album • Duration"`
- **Conditional compilation:** Action button code wrapped in `#[cfg(target_os = "linux")]`

### Tray Menu System

**Dynamic Three-State Menu:**
- "Playing" state: Shows Pause + Stop + Next/Prev
- "Paused" state: Shows Play + Stop + Next/Prev  
- "None" state: Shows Play only (no Stop button)
- First menu item: Current song "♪ Title - Artist"
- Updates via `rebuild_tray()` on state changes (50ms delay)

### Playback Position Persistence

**Save on quit, restore on startup:**
- **ApiConfig fields:** `last_song_artist`, `last_song_title`, `last_position_seconds`, `was_playing` (all `Option<>`)
- **Save:** Quit tray menu handler calls `getCurrentPlaybackState()` via eval, invokes `save_playback_position` command (300ms delay for async completion)
- **Restore:** `on_page_load` hook waits 2s, calls `get_playback_position`, evals `restorePlaybackPosition(artist, title, position, shouldPlay)`
- **Song matching:** Case-insensitive artist/title comparison, polls up to 5 seconds (50 attempts at 100ms intervals)
- **Session flag:** `window.__basitunePlaybackRestored` prevents duplicate restores when YouTube Music reloads pages
- **Behavior:** Only restores if same song loads; otherwise fails silently

## Development Workflows

```bash
npm run dev          # Dev mode
npm run build        # Production build (auto-tags version from git)
```

**Version management:** Update `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md` together

## Common Gotchas

1. **Notification actions Linux-only:** `wait_for_action` doesn't exist on macOS/Windows - use conditional compilation
2. **Sidebar layout breaks:** YouTube Music sets inline styles - sidebar force-applies flex layout with `!important`
3. **Volume-fix disabled:** Testing audio dropout theory - don't re-enable without confirming fix
4. **Tray menu stuck:** Call `rebuild_tray()` after state changes, not just `set_state()`
