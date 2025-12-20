# Audio Dropout Investigation & Fix Plan

## Current Status (December 20, 2025)

**Unused code removed:** `volume-normalizer.js` has been deleted - it wasn't being used anyway.

**Symptoms:**
- Dropouts occur during normal playback
- No UI interaction required to trigger them
- Sidebar open/closed doesn't affect frequency
- Sounds like brief audio ducking (< 1 second)

**Current hypothesis:** Most likely YouTube Music's own code or browser audio buffering, NOT our code.

## Active Components

1. **volume-fix.js** - Syncs volume slider (every 500ms) - very lightweight
2. **sidebar.js** - Artist info/lyrics (only when sidebar is open)
3. **audio-diagnostics.js** - Monitoring tool (minimal overhead)

## Using the Diagnostics

1. **Build and run:**
   ```bash
   cd src-tauri
   cargo build
   cargo run
   ```

2. **Open DevTools** (F12 or right-click → Inspect)

3. **Play music and wait for a dropout**

4. **Check the console logs immediately:**
   - Look for `TIMEUPDATE_GAP` - indicates actual audio stoppage
   - Look for `VIDEO_WAITING` or `VIDEO_STALLED` - buffering issues
   - Look for `LONG_TASK` - main thread blocked
   - Look for `FRAME_DROP` - rendering lag

5. **Export diagnostic log:**
   ```javascript
   basituneDiagnostics.exportLog()
   ```

## What to Look For

### If you see `VIDEO_WAITING` or `VIDEO_STALLED`:
**Cause:** Network buffering issue (YouTube Music's adaptive streaming)
**Solution:** Not much we can do - this is YouTube's infrastructure

### If you see `TIMEUPDATE_GAP` with no other events:
**Cause:** Browser audio buffer underrun
**Possible solutions:**
- Check system audio settings
- Try different audio output device
- Could be hardware/driver issue

### If you see `LONG_TASK` events:
**Cause:** Something blocking the main thread
**Solution:** We need to identify what's running

### If you see `FRAME_DROP` events:
**Cause:** UI rendering lag affecting audio
**Solution:** Reduce UI complexity or disable animations

### If nothing shows up in diagnostics:
**Cause:** The issue might be in YouTube Music's Web Worker or outside the main thread
**What this means:** Likely YouTube Music's own audio processing, not our code

## Next Steps Based on Findings

1. **Run the app with diagnostics and observe the console**
2. **When you hear a dropout, check what events logged around that time**
3. **If the diagnostics don't show anything suspicious:**
   - The issue is likely in YouTube Music's code (outside our control)
   - Could be browser audio stack issues
   - Might need to try different browser engine or system audio settings

## Potential External Causes

Since dropouts happen during normal playback with no interaction:

1. **YouTube Music's adaptive bitrate streaming** - switches quality mid-playback
2. **Browser's audio resampling** - converting sample rates
3. **System audio mixer** - other processes interfering
4. **Hardware audio buffer** - too small, causing underruns
5. **Power management** - CPU throttling during "idle" playback

## Already Implemented Optimizations

- ✅ Removed unused `volume-normalizer.js` 
- ✅ Reduced `volume-fix.js` polling from 200ms → 500ms
- ✅ Simplified diagnostics to avoid interfering with YouTube Music's audio
- ✅ No custom AudioContext manipulation (letting YouTube Music handle it)

---

**Next:** Build, run, and monitor the console logs during playback.
