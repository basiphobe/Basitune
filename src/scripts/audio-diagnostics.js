// Audio Performance Diagnostics
// Monitors for audio dropouts and performance issues

(function() {
    'use strict';
    
    if (window.__basituneAudioDiagnosticsInitialized) return;
    window.__basituneAudioDiagnosticsInitialized = true;
    
    console.log('[Basitune Diagnostics] Initializing audio performance monitoring...');
    
    const diagnostics = {
        startTime: performance.now(),
        events: [],
        maxEvents: 1000,
        audioContextCreations: 0,
        gainChanges: 0,
        volumeChanges: 0,
        lastAudioContextState: null,
        lastVideoState: null,
        lastGainValue: null,
        performanceMarks: []
    };
    
    // Log event helper
    function logEvent(type, data = {}) {
        const event = {
            timestamp: performance.now(),
            relativeTime: (performance.now() - diagnostics.startTime).toFixed(2),
            type,
            ...data
        };
        
        diagnostics.events.push(event);
        if (diagnostics.events.length > diagnostics.maxEvents) {
            diagnostics.events.shift();
        }
        
        console.log(`[Basitune Diagnostics] ${event.relativeTime}ms - ${type}:`, data);
        return event;
    }
    
    // Performance marker
    function markPerformance(label) {
        const mark = {
            label,
            timestamp: performance.now(),
            memory: performance.memory ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            } : null
        };
        diagnostics.performanceMarks.push(mark);
        performance.mark(label);
        return mark;
    }
    
    // Monitor video element
    function monitorVideo() {
        const video = document.querySelector('video');
        if (!video) {
            setTimeout(monitorVideo, 1000);
            return;
        }
        
        logEvent('VIDEO_FOUND', { 
            src: video.currentSrc ? video.currentSrc.substring(0, 100) : 'none',
            readyState: video.readyState,
            paused: video.paused,
            volume: video.volume,
            muted: video.muted
        });
        
        // Track playback interruptions
        let lastTimeUpdate = Date.now();
        let lastCurrentTime = video.currentTime;
        
        video.addEventListener('play', () => {
            logEvent('VIDEO_PLAY', { currentTime: video.currentTime });
            markPerformance('video-play');
        });
        
        video.addEventListener('pause', () => {
            logEvent('VIDEO_PAUSE', { currentTime: video.currentTime });
        });
        
        video.addEventListener('waiting', () => {
            logEvent('VIDEO_WAITING', { 
                currentTime: video.currentTime,
                readyState: video.readyState,
                buffered: video.buffered.length > 0 ? {
                    start: video.buffered.start(0),
                    end: video.buffered.end(0)
                } : 'none'
            });
        });
        
        video.addEventListener('stalled', () => {
            logEvent('VIDEO_STALLED', { currentTime: video.currentTime });
        });
        
        video.addEventListener('suspend', () => {
            logEvent('VIDEO_SUSPEND', { currentTime: video.currentTime });
        });
        
        video.addEventListener('volumechange', () => {
            diagnostics.volumeChanges++;
            logEvent('VIDEO_VOLUME_CHANGE', { 
                volume: video.volume,
                muted: video.muted,
                changeCount: diagnostics.volumeChanges
            });
        });
        
        video.addEventListener('error', (e) => {
            logEvent('VIDEO_ERROR', { 
                error: e.error,
                code: video.error ? video.error.code : 'unknown'
            });
        });
        
        // Monitor for gaps in timeupdate (indicates dropout)
        video.addEventListener('timeupdate', () => {
            const now = Date.now();
            const timeDelta = now - lastTimeUpdate;
            const currentTimeDelta = video.currentTime - lastCurrentTime;
            
            // If more than 500ms between timeupdate events and video is playing, something's wrong
            if (timeDelta > 500 && !video.paused) {
                logEvent('TIMEUPDATE_GAP', {
                    gapMs: timeDelta,
                    expectedDelta: currentTimeDelta,
                    currentTime: video.currentTime
                });
            }
            
            lastTimeUpdate = now;
            lastCurrentTime = video.currentTime;
        });
    }
    
    // Monitor AudioContext operations (but don't interfere)
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OriginalAudioContext) {
        window.AudioContext = function(...args) {
            diagnostics.audioContextCreations++;
            logEvent('AUDIOCONTEXT_CREATED', { count: diagnostics.audioContextCreations });
            markPerformance('audiocontext-create');
            
            const context = new OriginalAudioContext(...args);
            
            // Monitor state changes
            context.addEventListener('statechange', () => {
                logEvent('AUDIOCONTEXT_STATE_CHANGE', { 
                    state: context.state,
                    sampleRate: context.sampleRate,
                    baseLatency: context.baseLatency
                });
            });
            
            // Don't wrap internal methods - YouTube Music might be using AudioContext
            // and we don't want to interfere with their audio processing
            return context;
        };
        
        // Also wrap webkit version
        if (window.webkitAudioContext) {
            window.webkitAudioContext = window.AudioContext;
        }
    }
    
    // Monitor long tasks (tasks that block the main thread for >50ms)
    if ('PerformanceObserver' in window) {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 50) {
                        logEvent('LONG_TASK', {
                            duration: entry.duration.toFixed(2),
                            name: entry.name,
                            startTime: entry.startTime.toFixed(2)
                        });
                    }
                }
            });
            observer.observe({ entryTypes: ['longtask', 'measure'] });
        } catch (e) {
            console.warn('[Basitune Diagnostics] PerformanceObserver not available:', e);
        }
    }
    
    // Monitor main thread blocking
    let lastFrameTime = performance.now();
    function checkFrameRate() {
        const now = performance.now();
        const delta = now - lastFrameTime;
        
        // If frame took longer than 32ms (less than 30fps), log it
        if (delta > 32) {
            logEvent('FRAME_DROP', {
                frameDuration: delta.toFixed(2),
                fps: (1000 / delta).toFixed(1)
            });
        }
        
        lastFrameTime = now;
        requestAnimationFrame(checkFrameRate);
    }
    requestAnimationFrame(checkFrameRate);
    
    // Export diagnostics API
    window.basituneDiagnostics = {
        getEvents: () => diagnostics.events,
        getStats: () => ({
            audioContextCreations: diagnostics.audioContextCreations,
            gainChanges: diagnostics.gainChanges,
            volumeChanges: diagnostics.volumeChanges,
            totalEvents: diagnostics.events.length,
            uptime: ((performance.now() - diagnostics.startTime) / 1000).toFixed(2) + 's'
        }),
        getPerformanceMarks: () => diagnostics.performanceMarks,
        clear: () => {
            diagnostics.events = [];
            diagnostics.audioContextCreations = 0;
            diagnostics.gainChanges = 0;
            diagnostics.volumeChanges = 0;
            diagnostics.performanceMarks = [];
            console.log('[Basitune Diagnostics] Cleared');
        },
        exportLog: () => {
            const data = {
                stats: window.basituneDiagnostics.getStats(),
                events: diagnostics.events,
                performanceMarks: diagnostics.performanceMarks,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            };
            
            const json = JSON.stringify(data, null, 2);
            console.log('[Basitune Diagnostics] Export:', json);
            return json;
        }
    };
    
    // Start monitoring
    monitorVideo();
    
    console.log('[Basitune Diagnostics] Ready. Use window.basituneDiagnostics to access diagnostic data.');
    console.log('[Basitune Diagnostics] Commands:');
    console.log('  - basituneDiagnostics.getStats()  - Get statistics');
    console.log('  - basituneDiagnostics.getEvents() - Get all events');
    console.log('  - basituneDiagnostics.exportLog() - Export diagnostic log');
    console.log('  - basituneDiagnostics.clear()     - Clear diagnostic data');
})();
