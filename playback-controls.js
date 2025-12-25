// YouTube Music Playback Controls
// Provides functions to control playback from the system tray

(function() {
    'use strict';
    
    if (window.__basitunePlaybackControlsInitialized) return;
    window.__basitunePlaybackControlsInitialized = true;
    
    console.log('[Basitune] Playback controls initialized');
    
    // Monitor playback state and notify Rust for tray menu updates
    let lastPlaybackState = "none";
    
    // Track current song for tooltip updates
    let lastSongInfo = null;
    
    function getCurrentSongInfo() {
        const artistElement = document.querySelector('.byline.ytmusic-player-bar a');
        const titleElement = document.querySelector('.title.ytmusic-player-bar');
        const video = getVideoElement();
        
        if (artistElement && titleElement) {
            const info = {
                artist: artistElement.textContent.trim(),
                title: titleElement.textContent.trim()
            };
            
            // Add duration if available
            if (video && video.duration && !isNaN(video.duration)) {
                const minutes = Math.floor(video.duration / 60);
                const seconds = Math.floor(video.duration % 60);
                info.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // Try to get album info from the player bar subtitle
            const subtitleElement = document.querySelector('.subtitle.ytmusic-player-bar');
            if (subtitleElement) {
                const subtitleText = subtitleElement.textContent.trim();
                // Subtitle often contains "Artist • Album" or just "Artist"
                if (subtitleText.includes('•')) {
                    const parts = subtitleText.split('•').map(p => p.trim());
                    if (parts.length > 1) {
                        info.album = parts[1];
                    }
                }
            }
            
            return info;
        }
        
        return null;
    }
    
    function updateTrayTooltip() {
        const songInfo = getCurrentSongInfo();
        
        if (!songInfo) {
            // No song info, set to default
            if (lastSongInfo !== null) {
                lastSongInfo = null;
                if (window.__TAURI_INTERNALS__?.invoke) {
                    window.__TAURI_INTERNALS__.invoke('update_tray_tooltip', {
                        title: '',
                        artist: ''
                    }).catch(err => console.error('[Basitune] Failed to update tray tooltip:', err));
                }
            }
            return;
        }
        
        // Check if song changed
        if (!lastSongInfo || 
            lastSongInfo.title !== songInfo.title || 
            lastSongInfo.artist !== songInfo.artist) {
            const isNewSong = lastSongInfo !== null; // Don't notify on first load
            lastSongInfo = songInfo;
            
            if (window.__TAURI_INTERNALS__?.invoke) {
                // Update tray menu
                window.__TAURI_INTERNALS__.invoke('update_tray_tooltip', {
                    title: songInfo.title,
                    artist: songInfo.artist
                }).catch(err => console.error('[Basitune] Failed to update tray tooltip:', err));
                
                // Show notification for song changes (not initial load)
                if (isNewSong) {
                    // Small delay to prevent UI glitches when previous notification had action buttons
                    setTimeout(() => {
                        window.__TAURI_INTERNALS__.invoke('show_notification', {
                            title: songInfo.title,
                            artist: songInfo.artist,
                            duration: songInfo.duration || null,
                            album: songInfo.album || null
                        }).catch(err => console.error('[Basitune] Failed to show notification:', err));
                    }, 300); // 300ms delay to let previous notification thread finish
                }
            }
        }
    }
    
    // Check for song changes every 2 seconds
    setInterval(updateTrayTooltip, 2000);
    // Also check immediately
    setTimeout(updateTrayTooltip, 1000);
    
    function notifyPlaybackState(state) {
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
            window.__TAURI_INTERNALS__.invoke('update_playback_state', { 
                state: state
            }).catch(err => {
                console.error('[Basitune] Failed to update playback state:', err);
            });
        } else if (window.__TAURI__ && window.__TAURI__.invoke) {
            window.__TAURI__.invoke('update_playback_state', { 
                state: state
            }).catch(err => {
                console.error('[Basitune] Failed to update playback state:', err);
            });
        } else {
            console.error('[Basitune] Tauri invoke not available! Cannot update playback state.');
        }
    }
    
    function updatePlaybackState() {
        const currentState = getPlaybackState();
        
        if (currentState !== lastPlaybackState) {
            lastPlaybackState = currentState;
            notifyPlaybackState(currentState);
        }
    }
    
    // Check playback state every 2 seconds
    setInterval(updatePlaybackState, 2000);
    
    // Also check on video events
    function attachVideoListeners() {
        const video = getVideoElement();
        if (video) {
            video.addEventListener('play', updatePlaybackState);
            video.addEventListener('pause', updatePlaybackState);
            video.addEventListener('ended', updatePlaybackState);
        } else {
            setTimeout(attachVideoListeners, 1000);
        }
    }
    attachVideoListeners();
    
    // Find player controls
    function findPlayPauseButton() {
        // YouTube Music uses different selectors
        return document.querySelector('ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button')
            || document.querySelector('.play-pause-button')
            || document.querySelector('[aria-label="Play"]')
            || document.querySelector('[aria-label="Pause"]');
    }
    
    function findNextButton() {
        return document.querySelector('ytmusic-player-bar .next-button')
            || document.querySelector('[aria-label="Next"]')
            || document.querySelector('[aria-label="Next track"]');
    }
    
    function findPreviousButton() {
        return document.querySelector('ytmusic-player-bar .previous-button')
            || document.querySelector('[aria-label="Previous"]')
            || document.querySelector('[aria-label="Previous track"]');
    }
    
    function getVideoElement() {
        return document.querySelector('video');
    }
    
    // Check if currently playing
    function isPlaying() {
        const video = getVideoElement();
        if (!video) return false;
        
        return !video.paused && !video.ended && video.currentTime > 0;
    }
    
    // Check if there's a song loaded (even if paused)
    function hasSongLoaded() {
        const video = getVideoElement();
        if (!video) return false;
        
        // Song is loaded if video has a source and duration
        return video.src && video.src.length > 0 && video.duration > 0;
    }
    
    // Get playback state: "none", "paused", or "playing"
    function getPlaybackState() {
        const video = getVideoElement();
        
        if (!video) return "none";
        if (!video.src || video.src === '' || video.src === 'about:blank') return "none";
        
        const hasValidDuration = video.duration && !isNaN(video.duration) && video.duration > 0;
        if (!hasValidDuration) return "none";
        
        // Song loaded but not played yet
        if (video.currentTime === 0 && video.paused) return "none";
        
        // Song has been played
        if (video.paused || video.ended) return "paused";
        return "playing";
    }
    
    // Playback control functions
    window.basitunePlayback = {
        play: function() {
            const button = findPlayPauseButton();
            const video = getVideoElement();
            
            if (video && video.paused) {
                if (button) {
                    button.click();
                    console.log('[Basitune] Play triggered via button click');
                } else {
                    video.play();
                    console.log('[Basitune] Play triggered via video.play()');
                }
                setTimeout(() => {
                    lastPlaybackState = "playing";
                    notifyPlaybackState("playing");
                }, 50);
                return true;
            }
            console.log('[Basitune] play() - conditions not met, no action taken');
            return false;
        },
        
        pause: function() {
            const button = findPlayPauseButton();
            const video = getVideoElement();
            
            if (video && !video.paused) {
                if (button) {
                    button.click();
                    console.log('[Basitune] Pause triggered via button click');
                } else {
                    video.pause();
                    console.log('[Basitune] Pause triggered via video.pause()');
                }
                // Immediately update state after action
                setTimeout(() => {
                    lastPlaybackState = "paused";
                    notifyPlaybackState("paused");
                }, 50);
                return true;
            }
            return false;
        },
        
        togglePlayPause: function() {
            const button = findPlayPauseButton();
            if (button) {
                button.click();
                console.log('[Basitune] Toggle play/pause via button click');
                // Check state after a short delay
                setTimeout(updatePlaybackState, 50);
                return true;
            }
            
            const video = getVideoElement();
            if (video) {
                if (video.paused) {
                    video.play();
                    console.log('[Basitune] Play via video.play()');
                    setTimeout(() => {
                        lastPlaybackState = "playing";
                        notifyPlaybackState("playing");
                    }, 100);
                } else {
                    video.pause();
                    console.log('[Basitune] Pause via video.pause()');
                    setTimeout(() => {
                        lastPlaybackState = "paused";
                        notifyPlaybackState("paused");
                    }, 100);
                }
                return true;
            }
            
            return false;
        },
        
        stop: function() {
            const video = getVideoElement();
            if (video) {
                video.pause();
                video.currentTime = 0;
                setTimeout(() => {
                    lastPlaybackState = "none";
                    notifyPlaybackState("none");
                }, 50);
                return true;
            }
            return false;
        },
        
        next: function() {
            const button = findNextButton();
            if (button) {
                button.click();
                console.log('[Basitune] Next track');
                // Check state after track change
                setTimeout(updatePlaybackState, 500);
                return true;
            }
            console.warn('[Basitune] Next button not found');
            return false;
        },
        
        previous: function() {
            const button = findPreviousButton();
            if (button) {
                button.click();
                console.log('[Basitune] Previous track');
                // Check state after track change
                setTimeout(updatePlaybackState, 500);
                return true;
            }
            console.warn('[Basitune] Previous button not found');
            return false;
        },
        
        isPlaying: isPlaying,
        
        getStatus: function() {
            const video = getVideoElement();
            return {
                playing: isPlaying(),
                currentTime: video ? video.currentTime : 0,
                duration: video ? video.duration : 0,
                paused: video ? video.paused : true,
                ended: video ? video.ended : false
            };
        },
        
        // Get current playback position for persistence
        getCurrentPlaybackState: function() {
            const songInfo = getCurrentSongInfo();
            const video = getVideoElement();
            
            if (!songInfo || !video) {
                return null;
            }
            
            return {
                artist: songInfo.artist,
                title: songInfo.title,
                position: video.currentTime || 0,
                duration: video.duration || 0,
                isPlaying: isPlaying()
            };
        },
        
        // Restore playback position
        restorePlaybackPosition: function(artist, title, position, shouldPlay) {
            const maxAttempts = 50; // 5 seconds total (100ms intervals)
            let attempts = 0;
            
            const tryRestore = () => {
                const currentInfo = getCurrentSongInfo();
                const video = getVideoElement();
                
                // Check if song matches
                if (currentInfo && 
                    currentInfo.artist.toLowerCase() === artist.toLowerCase() &&
                    currentInfo.title.toLowerCase() === title.toLowerCase()) {
                    
                    // Check if video is ready
                    if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
                        // Video is ready, seek to position
                        if (position > 0 && position < video.duration) {
                            video.currentTime = position;
                            console.log(`[Basitune] Restored playback position to ${position.toFixed(1)}s`);
                            
                            // Resume playback if it was playing
                            if (shouldPlay && video.paused) {
                                setTimeout(() => {
                                    const button = findPlayPauseButton();
                                    if (button) {
                                        button.click();
                                        console.log('[Basitune] Resumed playback');
                                    }
                                }, 100);
                            }
                        }
                        return;
                    }
                }
                
                // Try again if we haven't exceeded max attempts
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(tryRestore, 100);
                } else {
                    console.log(`[Basitune] Could not restore playback - song not found or different song loaded`);
                }
            };
            
            tryRestore();
        },
        
        // Debug function to show available controls
        debug: function() {
            console.log('[Basitune] Playback Controls Debug:');
            console.log('  Play/Pause button:', findPlayPauseButton());
            console.log('  Next button:', findNextButton());
            console.log('  Previous button:', findPreviousButton());
            console.log('  Video element:', getVideoElement());
            console.log('  Is playing:', isPlaying());
            console.log('  Status:', this.getStatus());
        }
    };
    
    console.log('[Basitune] Playback controls ready. Use window.basitunePlayback to control playback.');
    console.log('[Basitune] Available methods: play(), pause(), togglePlayPause(), stop(), next(), previous(), isPlaying(), getStatus(), getCurrentPlaybackState(), restorePlaybackPosition(), debug()');
})();
