// Music Visualizer for YouTube Music
// Connects to the audio/video element and renders frequency visualization
// 
// Architecture:
// - Uses Web Audio API to tap into YouTube Music's audio stream
// - Supports 11 visualization styles (bars, wave, circular, radial, spectrum, particles, symmetrical, spiral, blob, line, dual)
// - Canvas-based rendering at 60fps via requestAnimationFrame
// - Settings persistence via Tauri backend (style, color, sensitivity)
// - Full-window overlay mode for immersive experience
//
// Critical patterns:
// - createMediaElementSource() can only be called once per video element (permanent audio routing)
// - GainNode matches YouTube Music's volume slider to maintain consistent volume
// - Auto-advance workaround: Web Audio API breaks YouTube Music's native autoplay, so we manually click next button + video.play()

(function() {
    'use strict';

    // Prevent double-injection
    if (window.__basituneVisualizerInitialized) {
        console.log('[Basitune Visualizer] Already initialized, skipping re-run');
        return;
    }
    window.__basituneVisualizerInitialized = true;

    console.log('[Basitune Visualizer] Initializing...');

    // Web Audio API state
    let audioContext = null;
    let analyser = null;
    let dataArray = null;
    let bufferLength = 0;
    let sourceNode = null;        // MediaElementSource - can only create once
    let gainNode = null;          // Volume matching for YouTube Music slider
    let isAudioConnected = false; // Tracks if we've permanently taken over audio routing
    
    // Canvas rendering state
    let canvas = null;
    let canvasCtx = null;
    let animationId = null;
    let isVisualizerActive = false;
    
    // Visualizer settings (configurable via UI)
    let visualizerStyle = 'bars';  // Current visualization style
    let barColor = '#ff0000';      // Primary color for visualization
    let backgroundColor = '#0a0a0a'; // Canvas background color
    let sensitivity = 1.0;         // Multiplier for bar heights (0.5 - 2.0)

    // Get the video element from YouTube Music
    function getVideoElement() {
        return document.querySelector('video');
    }

    // Initialize Web Audio API
    function initializeAudioContext() {
        if (isAudioConnected) {
            console.log('[Basitune Visualizer] Audio already connected');
            return true;
        }

        const video = getVideoElement();
        if (!video) {
            console.warn('[Basitune Visualizer] No video element found');
            return false;
        }

        try {
            // Create audio context only once
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Create analyser node
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);

                // Create gain node to match YouTube Music's volume slider
                gainNode = audioContext.createGain();
                
                // Try to get YouTube Music's volume slider value
                const ytVolumeSlider = document.querySelector('#volume-slider');
                let targetGain = 0.7; // Default to 70% if slider not found
                
                if (ytVolumeSlider && ytVolumeSlider.value) {
                    // YouTube Music slider is 0-100, convert to 0-1 range
                    // Use the slider value directly as our gain target
                    targetGain = parseInt(ytVolumeSlider.value) / 100;
                }
                
                gainNode.gain.value = targetGain;
                console.log('[Basitune Visualizer] GainNode set to match YouTube Music slider:', targetGain);
            }

            // Connect video element to analyser only once
            if (!sourceNode) {
                sourceNode = audioContext.createMediaElementSource(video);
                sourceNode.connect(analyser);
                analyser.connect(gainNode);
                gainNode.connect(audioContext.destination);
                isAudioConnected = true;
                
                // Once we take over audio routing, YouTube Music's autoplay breaks
                // Listen for song end and manually advance to next track
                video.addEventListener('ended', () => {
                    console.log('[Basitune Visualizer] Song ended, auto-advancing to next track');
                    const nextButton = document.querySelector('.next-button[aria-label="Next"]');
                    if (nextButton) {
                        nextButton.click();
                        // YouTube Music loads the next track but doesn't auto-play it
                        // Wait a moment for the new track to load, then start playback
                        setTimeout(() => {
                            const video = getVideoElement();
                            if (video && video.paused) {
                                video.play().catch(err => console.warn('[Basitune Visualizer] Auto-play failed:', err));
                            }
                        }, 500);
                    }
                });
                
                console.log('[Basitune Visualizer] Audio routing established');
            }

            // Resume context if needed
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            return true;
        } catch (error) {
            console.error('[Basitune Visualizer] Failed to initialize audio context:', error);
            return false;
        }
    }

    // Set canvas element for rendering
    function setCanvas(canvasElement) {
        canvas = canvasElement;
        if (canvas) {
            canvasCtx = canvas.getContext('2d');
            console.log('[Basitune Visualizer] Canvas set successfully');
        }
    }

    // Resize canvas to fit its container
    function resizeCanvas() {
        if (!canvas) return;
        
        const container = canvas.parentElement;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        console.log('[Basitune Visualizer] Canvas resized to', canvas.width, 'x', canvas.height);
    }

    // Start visualization
    function start() {
        if (isVisualizerActive) {
            console.log('[Basitune Visualizer] Already active');
            return;
        }

        if (!canvas || !canvasCtx) {
            console.error('[Basitune Visualizer] Cannot start - canvas not set');
            return;
        }

        // Ensure audio is connected (should already be if music is playing)
        if (!isAudioConnected) {
            initializeAudioContext();
        }

        // Resume audio context if suspended
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }

        isVisualizerActive = true;
        console.log('[Basitune Visualizer] Started rendering');
        render();
    }

    // Stop visualization
    function stop() {
        if (!isVisualizerActive) return;

        isVisualizerActive = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        // Clear canvas
        if (canvas && canvasCtx) {
            canvasCtx.fillStyle = backgroundColor;
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        }

        console.log('[Basitune Visualizer] Stopped rendering');
        // Note: We keep the audio connection active to avoid crackling on restart
    }

    // Render visualization frame
    function render() {
        if (!isVisualizerActive) return;

        animationId = requestAnimationFrame(render);

        // Get frequency data
        analyser.getByteFrequencyData(dataArray);

        // Render based on current style
        if (visualizerStyle === 'bars') {
            renderBars();
        } else if (visualizerStyle === 'wave') {
            renderWaveform();
        } else if (visualizerStyle === 'circular') {
            renderCircular();
        } else if (visualizerStyle === 'radial') {
            renderRadialBars();
        } else if (visualizerStyle === 'spectrum') {
            renderSpectrum();
        } else if (visualizerStyle === 'particles') {
            renderParticles();
        } else if (visualizerStyle === 'symmetrical') {
            renderSymmetrical();
        } else if (visualizerStyle === 'spiral') {
            renderSpiral();
        } else if (visualizerStyle === 'blob') {
            renderBlob();
        } else if (visualizerStyle === 'line') {
            renderLineSpectrum();
        } else if (visualizerStyle === 'dual') {
            renderDualWaveform();
        }
    }

    // Render bar visualizer
    function renderBars() {
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas with background color
        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * sensitivity;

            // Create gradient for bars
            const gradient = canvasCtx.createLinearGradient(0, height - barHeight, 0, height);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, adjustColorBrightness(barColor, -40));

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    // Render waveform visualizer
    function renderWaveform() {
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        // Get time domain data for waveform
        const waveData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(waveData);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = barColor;
        canvasCtx.beginPath();

        const sliceWidth = width / waveData.length;
        let x = 0;

        for (let i = 0; i < waveData.length; i++) {
            const v = (waveData[i] / 128.0) * sensitivity;
            const y = (v * height) / 2;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        canvasCtx.lineTo(width, height / 2);
        canvasCtx.stroke();
    }

    // Render circular visualizer
    function renderCircular() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 3;

        // Clear canvas
        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barCount = bufferLength;
        const angleStep = (Math.PI * 2) / barCount;

        for (let i = 0; i < barCount; i++) {
            const angle = i * angleStep;
            const barHeight = (dataArray[i] / 255) * radius * sensitivity;

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            // Create gradient
            const gradient = canvasCtx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, adjustColorBrightness(barColor, -40));

            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineWidth = 2;
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }

        // Draw center circle
        canvasCtx.beginPath();
        canvasCtx.arc(centerX, centerY, radius * 0.1, 0, Math.PI * 2);
        canvasCtx.fillStyle = barColor;
        canvasCtx.fill();
    }

    // Render radial bars (sunburst)
    function renderRadialBars() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const radius = Math.min(width, height) * 0.3;
        const barCount = 64;

        for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI * 2;
            const barHeight = (dataArray[i * 2] / 255) * radius * sensitivity;

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            const gradient = canvasCtx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, adjustColorBrightness(barColor, 40));

            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineWidth = 4;
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }
    }

    // Render spectrum with gradient
    function renderSpectrum() {
        const width = canvas.width;
        const height = canvas.height;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = width / bufferLength;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * sensitivity;
            const x = i * barWidth;
            const y = height - barHeight;

            // Create vertical gradient
            const gradient = canvasCtx.createLinearGradient(x, height, x, y);
            gradient.addColorStop(0, adjustColorBrightness(barColor, -60));
            gradient.addColorStop(0.5, barColor);
            gradient.addColorStop(1, adjustColorBrightness(barColor, 60));

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, y, barWidth - 1, barHeight);
        }
    }

    // Render particles
    function renderParticles() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const particleCount = 80;

        for (let i = 0; i < particleCount; i++) {
            const dataIndex = Math.floor((i / particleCount) * bufferLength);
            const intensity = dataArray[dataIndex] / 255;
            const angle = (i / particleCount) * Math.PI * 2 + (Date.now() / 1000);
            const distance = intensity * Math.min(width, height) * 0.4 * sensitivity;

            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            const size = 2 + intensity * 6;

            const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, size);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, 'transparent');

            canvasCtx.fillStyle = gradient;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, size, 0, Math.PI * 2);
            canvasCtx.fill();
        }
    }

    // Render symmetrical bars (mirrored)
    function renderSymmetrical() {
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = width / bufferLength;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * (height / 2) * sensitivity;
            const x = i * barWidth;

            // Top half
            const gradient1 = canvasCtx.createLinearGradient(x, centerY, x, centerY - barHeight);
            gradient1.addColorStop(0, barColor);
            gradient1.addColorStop(1, adjustColorBrightness(barColor, -40));
            canvasCtx.fillStyle = gradient1;
            canvasCtx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);

            // Bottom half (mirrored)
            const gradient2 = canvasCtx.createLinearGradient(x, centerY, x, centerY + barHeight);
            gradient2.addColorStop(0, barColor);
            gradient2.addColorStop(1, adjustColorBrightness(barColor, -40));
            canvasCtx.fillStyle = gradient2;
            canvasCtx.fillRect(x, centerY, barWidth - 1, barHeight);
        }
    }

    // Render spiral
    function renderSpiral() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const points = 200;
        const spiralTurns = 3;
        const time = Date.now() / 2000;

        canvasCtx.strokeStyle = barColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();

        for (let i = 0; i < points; i++) {
            const progress = i / points;
            const angle = progress * Math.PI * 2 * spiralTurns + time;
            const dataIndex = Math.floor(progress * bufferLength);
            const intensity = (dataArray[dataIndex] / 255) * sensitivity;
            const distance = progress * Math.min(width, height) * 0.4 * (0.5 + intensity);

            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.stroke();

        // Add glow points
        for (let i = 0; i < points; i += 5) {
            const progress = i / points;
            const angle = progress * Math.PI * 2 * spiralTurns + time;
            const dataIndex = Math.floor(progress * bufferLength);
            const intensity = (dataArray[dataIndex] / 255) * sensitivity;
            const distance = progress * Math.min(width, height) * 0.4 * (0.5 + intensity);

            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;

            const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, 4);
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, 'transparent');

            canvasCtx.fillStyle = gradient;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 4, 0, Math.PI * 2);
            canvasCtx.fill();
        }
    }

    // Render blob
    function renderBlob() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const points = 32;
        const baseRadius = Math.min(width, height) * 0.2;
        const time = Date.now() / 1000;

        canvasCtx.beginPath();

        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const dataIndex = Math.floor((i / points) * bufferLength);
            const intensity = (dataArray[dataIndex] / 255) * sensitivity;
            const wobble = Math.sin(angle * 3 + time * 2) * 0.1;
            const radius = baseRadius * (1 + intensity + wobble);

            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.closePath();

        // Fill with gradient
        const gradient = canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 2);
        gradient.addColorStop(0, adjustColorBrightness(barColor, 40));
        gradient.addColorStop(0.7, barColor);
        gradient.addColorStop(1, adjustColorBrightness(barColor, -40));

        canvasCtx.fillStyle = gradient;
        canvasCtx.fill();

        // Add outline
        canvasCtx.strokeStyle = barColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
    }

    // Render line spectrum
    function renderLineSpectrum() {
        const width = canvas.width;
        const height = canvas.height;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const pointWidth = width / bufferLength;

        canvasCtx.strokeStyle = barColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const y = height - (dataArray[i] / 255) * height * sensitivity;
            const x = i * pointWidth;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.stroke();

        // Fill area under line
        canvasCtx.lineTo(width, height);
        canvasCtx.lineTo(0, height);
        canvasCtx.closePath();

        const gradient = canvasCtx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, barColor + '80'); // Semi-transparent
        gradient.addColorStop(1, backgroundColor);

        canvasCtx.fillStyle = gradient;
        canvasCtx.fill();
    }

    // Render dual waveform (mirrored like DJ software)
    function renderDualWaveform() {
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const sliceWidth = width / bufferLength;

        // Top waveform
        canvasCtx.strokeStyle = barColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] / 255.0) * sensitivity;
            const y = centerY - (v * (height / 4));
            const x = i * sliceWidth;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.stroke();

        // Bottom waveform (mirrored)
        canvasCtx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] / 255.0) * sensitivity;
            const y = centerY + (v * (height / 4));
            const x = i * sliceWidth;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.stroke();

        // Center line
        canvasCtx.strokeStyle = adjustColorBrightness(barColor, -40);
        canvasCtx.lineWidth = 1;
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, centerY);
        canvasCtx.lineTo(width, centerY);
        canvasCtx.stroke();
    }

    // Helper function to adjust color brightness
    function adjustColorBrightness(color, amount) {
        // Parse hex color
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
        const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
        const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
        
        return '#' + 
            r.toString(16).padStart(2, '0') + 
            g.toString(16).padStart(2, '0') + 
            b.toString(16).padStart(2, '0');
    }

    // Update visualizer settings
    function updateSettings(settings) {
        if (settings.style) visualizerStyle = settings.style;
        if (settings.color) barColor = settings.color;
        if (settings.backgroundColor) backgroundColor = settings.backgroundColor;
        if (settings.sensitivity !== undefined) sensitivity = settings.sensitivity;
        
        console.log('[Basitune Visualizer] Settings updated:', settings);
    }

    // Expose API to window
    window.basituneVisualizer = {
        setCanvas,
        resizeCanvas,
        start,
        stop,
        updateSettings,
        isActive: () => isVisualizerActive
    };

    console.log('[Basitune Visualizer] API exposed to window.basituneVisualizer');
})();
