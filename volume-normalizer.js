// Volume Normalization for YouTube Music
// This script normalizes audio levels across different songs

(function() {
    'use strict';
    
    // Configuration
    const TARGET_VOLUME = -14; // Target loudness in LUFS (standard for streaming)
    const UPDATE_INTERVAL = 100; // ms
    const SMOOTHING_FACTOR = 0.3; // How quickly to adjust (0-1, lower = smoother)
    
    let audioContext = null;
    let sourceNode = null;
    let gainNode = null;
    let analyserNode = null;
    let currentVideo = null;
    let normalizationEnabled = true;
    
    // Initialize audio context and processing chain
    function initAudioProcessing() {
        const video = document.querySelector('video');
        if (!video || video === currentVideo) return;
        
        currentVideo = video;
        
        // Create audio context if it doesn't exist
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume audio context if suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // Disconnect previous nodes if they exist
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch (e) {}
        }
        if (gainNode) {
            try { gainNode.disconnect(); } catch (e) {}
        }
        if (analyserNode) {
            try { analyserNode.disconnect(); } catch (e) {}
        }
        
        try {
            // Create processing nodes
            sourceNode = audioContext.createMediaElementSource(video);
            gainNode = audioContext.createGain();
            analyserNode = audioContext.createAnalyser();
            
            // Configure analyser
            analyserNode.fftSize = 2048;
            analyserNode.smoothingTimeConstant = 0.8;
            
            // Connect: source -> gain -> analyser -> destination
            sourceNode.connect(gainNode);
            gainNode.connect(analyserNode);
            analyserNode.connect(audioContext.destination);
            
            // Start monitoring
            monitorAndAdjust();
            
            console.log('[Basitune] Volume normalization initialized');
        } catch (err) {
            console.error('[Basitune] Failed to initialize audio processing:', err);
        }
    }
    
    // Calculate RMS (Root Mean Square) level
    function calculateRMS(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / dataArray.length);
    }
    
    // Convert RMS to approximate LUFS
    function rmsToLUFS(rms) {
        if (rms === 0) return -Infinity;
        return 20 * Math.log10(rms) - 3; // Approximate conversion
    }
    
    // Monitor audio levels and adjust gain
    function monitorAndAdjust() {
        if (!normalizationEnabled || !analyserNode || !gainNode) {
            setTimeout(monitorAndAdjust, UPDATE_INTERVAL);
            return;
        }
        
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteTimeDomainData(dataArray);
        
        const rms = calculateRMS(dataArray);
        const currentLUFS = rmsToLUFS(rms);
        
        // Only adjust if we have a valid signal
        if (currentLUFS > -60) {
            const difference = TARGET_VOLUME - currentLUFS;
            const gainAdjustment = Math.pow(10, difference / 20);
            
            // Smooth the gain changes to avoid abrupt volume jumps
            const currentGain = gainNode.gain.value;
            const targetGain = Math.max(0.1, Math.min(3.0, gainAdjustment)); // Clamp between 0.1x and 3x
            const newGain = currentGain + (targetGain - currentGain) * SMOOTHING_FACTOR;
            
            gainNode.gain.setValueAtTime(newGain, audioContext.currentTime);
        }
        
        setTimeout(monitorAndAdjust, UPDATE_INTERVAL);
    }
    
    // Watch for video element changes
    const observer = new MutationObserver(() => {
        initAudioProcessing();
    });
    
    // Start observing
    function startObserving() {
        const ytmusicApp = document.querySelector('ytmusic-app');
        if (ytmusicApp) {
            observer.observe(ytmusicApp, {
                childList: true,
                subtree: true
            });
            initAudioProcessing();
        } else {
            setTimeout(startObserving, 500);
        }
    }
    
    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }
    
    // Expose control interface
    window.baситune = {
        enableNormalization: () => {
            normalizationEnabled = true;
            console.log('[Basitune] Volume normalization enabled');
        },
        disableNormalization: () => {
            normalizationEnabled = false;
            if (gainNode) gainNode.gain.value = 1.0;
            console.log('[Basitune] Volume normalization disabled');
        },
        setTargetVolume: (lufs) => {
            TARGET_VOLUME = lufs;
            console.log(`[Basitune] Target volume set to ${lufs} LUFS`);
        },
        getStatus: () => ({
            enabled: normalizationEnabled,
            targetVolume: TARGET_VOLUME,
            currentGain: gainNode ? gainNode.gain.value : 1.0
        })
    };
    
    console.log('[Basitune] Volume normalization script loaded');
})();
