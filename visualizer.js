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
    
    // Create loading overlay for audio context initialization
    const createLoadingOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = 'basitune-audio-loading';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            opacity: 1;
            transition: opacity 0.5s ease-out;
        `;
        
        // Create content container (avoiding innerHTML for CSP compliance)
        const container = document.createElement('div');
        container.style.textAlign = 'center';
        
        // Create SVG icon
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '80');
        svg.setAttribute('height', '80');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', '#ff6b6b');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.style.cssText = 'margin-bottom: 24px; animation: pulse 2s ease-in-out infinite;';
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M9 18V5l12-2v13');
        const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle1.setAttribute('cx', '6');
        circle1.setAttribute('cy', '18');
        circle1.setAttribute('r', '3');
        const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle2.setAttribute('cx', '18');
        circle2.setAttribute('cy', '16');
        circle2.setAttribute('r', '3');
        svg.appendChild(path);
        svg.appendChild(circle1);
        svg.appendChild(circle2);
        
        // Create title
        const title = document.createElement('h2');
        title.textContent = 'Basitune';
        title.style.cssText = 'color: #fff; font-size: 24px; font-weight: 600; margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
        
        // Create subtitle
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Initializing high-quality audio...';
        subtitle.style.cssText = 'color: rgba(255, 255, 255, 0.6); font-size: 14px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
        
        // Create progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = 'width: 200px; height: 3px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; margin: 24px auto 0; overflow: hidden;';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width: 100%; height: 100%; background: linear-gradient(90deg, #ff6b6b, #ff8e53); animation: loading 1.5s ease-in-out infinite;';
        progressContainer.appendChild(progressBar);
        
        // Create style element for animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.05); }
            }
            @keyframes loading {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
        `;
        
        // Assemble the overlay
        container.appendChild(svg);
        container.appendChild(title);
        container.appendChild(subtitle);
        container.appendChild(progressContainer);
        overlay.appendChild(container);
        overlay.appendChild(style);
        
        document.body.appendChild(overlay);
        return overlay;
    };
    
    let loadingOverlay = null;
    
    // Wait for body to exist before creating overlay
    const ensureOverlay = () => {
        if (!loadingOverlay && document.body) {
            loadingOverlay = createLoadingOverlay();
        }
        return loadingOverlay;
    };
    
    // Try to create immediately if body exists, otherwise wait
    if (document.body) {
        loadingOverlay = createLoadingOverlay();
    } else {
        // Body doesn't exist yet, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => {
            loadingOverlay = createLoadingOverlay();
        });
    }

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
    
    // Advanced settings
    let colorPalette = 'single';   // 'single', 'rainbow', 'fire', 'ocean', 'synthwave', 'neon'
    let animationSpeed = 1.0;      // 0.5 - 2.0x multiplier for animated visualizers
    let glowEnabled = false;       // Enable glow/bloom effect
    let glowIntensity = 10.0;      // Shadow blur radius (0-20px)
    let barSpacing = 1.0;          // Gap between bars (0-5px)
    let particleCount = 80;        // Number of particles (20-200)
    
    // Color palette definitions
    const COLOR_PALETTES = {
        'single': null, // Uses barColor
        'rainbow': ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'],
        'fire': ['#ff0000', '#ff4500', '#ffa500', '#ffff00'],
        'ocean': ['#000080', '#0000ff', '#00ffff', '#40e0d0'],
        'synthwave': ['#ff00ff', '#ff1493', '#00ffff', '#9400d3'],
        'neon': ['#ff00ff', '#00ff00', '#00ffff', '#ffff00']
    };

    // Get colors for current palette
    function getPaletteColors() {
        if (colorPalette === 'single' || !COLOR_PALETTES[colorPalette]) {
            return [barColor, adjustColorBrightness(barColor, -40)];
        }
        return COLOR_PALETTES[colorPalette];
    }
    
    // Get color from palette at position (0.0 - 1.0)
    function getColorForPalette(position) {
        const colors = getPaletteColors();
        if (colors.length === 1) return colors[0];
        
        const scaledPos = position * (colors.length - 1);
        const index = Math.floor(scaledPos);
        const nextIndex = Math.min(index + 1, colors.length - 1);
        
        // Simple color at index (no interpolation for now)
        return colors[index];
    }
    
    // Apply glow effect
    function applyGlow() {
        if (glowEnabled) {
            canvasCtx.shadowBlur = glowIntensity;
            canvasCtx.shadowColor = barColor;
        }
    }
    
    // Clear glow effect
    function clearGlow() {
        canvasCtx.shadowBlur = 0;
    }
    
    // Get animation time with speed multiplier
    function getAnimationTime() {
        return Date.now() / (1000 / animationSpeed);
    }

    // Get the video element from YouTube Music
    function getVideoElement() {
        return document.querySelector('video');
    }

    // Initialize Web Audio API - returns Promise that resolves when ready
    function initializeAudioContext() {
        if (isAudioConnected) {
            console.log('[Basitune Visualizer] Audio already connected');
            return Promise.resolve(true);
        }

        return new Promise((resolve, reject) => {
            // Wait for video element to appear (YouTube Music loads it asynchronously)
            const waitForVideo = () => {
                const video = getVideoElement();
                if (!video) {
                    setTimeout(waitForVideo, 200);
                    return;
                }
                
                connectAudio(video, resolve, reject);
            };
            waitForVideo();
        });
    }
    
    // Connect audio after video element is found
    function connectAudio(video, resolve, reject) {
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
                
                // Listen for volume slider changes to keep gainNode in sync
                if (ytVolumeSlider) {
                    const updateGainFromSlider = () => {
                        if (gainNode && ytVolumeSlider.value) {
                            const newGain = parseInt(ytVolumeSlider.value) / 100;
                            gainNode.gain.value = newGain;
                            console.log('[Basitune Visualizer] Volume synced to:', newGain);
                        }
                    };
                    
                    // Try multiple event types to catch volume changes
                    ytVolumeSlider.addEventListener('input', updateGainFromSlider);
                    ytVolumeSlider.addEventListener('change', updateGainFromSlider);
                    ytVolumeSlider.addEventListener('value-change', updateGainFromSlider); // Polymer custom event
                    
                    console.log('[Basitune Visualizer] Volume sync listeners attached');
                }
                
                // Listen for mute/unmute via video volumechange event
                const syncVolumeFromVideo = () => {
                    if (video && gainNode) {
                        if (video.muted) {
                            gainNode.gain.value = 0;
                            console.log('[Basitune Visualizer] Muted');
                        } else if (ytVolumeSlider && ytVolumeSlider.value) {
                            const newGain = parseInt(ytVolumeSlider.value) / 100;
                            gainNode.gain.value = newGain;
                            console.log('[Basitune Visualizer] Unmuted, volume restored to:', newGain);
                        }
                    }
                };
                
                video.addEventListener('volumechange', syncVolumeFromVideo);
                console.log('[Basitune Visualizer] Video volumechange listener attached for mute/unmute');
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
                    
                    const nextButton = document.querySelector('ytmusic-player-bar .next-button')
                        || document.querySelector('[aria-label="Next"]')
                        || document.querySelector('[aria-label="Next track"]');
                    
                    if (nextButton) {
                        nextButton.click();
                        
                        // YouTube Music loads the next track but doesn't auto-play it
                        // Wait for track to load, then start playback with retry logic
                        let retryCount = 0;
                        const attemptPlay = () => {
                            const video = getVideoElement();
                            
                            if (video && video.paused) {
                                video.play()
                                    .catch(err => {
                                        console.warn('[Basitune Visualizer] Auto-play attempt', retryCount + 1, 'failed:', err.message);
                                        if (retryCount < 3) {
                                            retryCount++;
                                            setTimeout(attemptPlay, 300);
                                        }
                                    });
                            }
                        };
                        setTimeout(attemptPlay, 800);
                    } else {
                        console.warn('[Basitune Visualizer] Next button not found');
                    }
                });
                
                console.log('[Basitune Visualizer] Audio routing established');
            }

            // Wait for audio context to reach 'running' state
            const waitForRunning = () => {
                if (audioContext.state === 'running') {
                    console.log('[Basitune Visualizer] Audio context running');
                    // Add extra 500ms for stability
                    setTimeout(() => {
                        console.log('[Basitune Visualizer] Audio context stable and ready');
                        resolve(true);
                    }, 500);
                } else if (audioContext.state === 'suspended') {
                    console.log('[Basitune Visualizer] Audio context suspended, resuming...');
                    audioContext.resume().then(() => {
                        setTimeout(waitForRunning, 100);
                    });
                } else {
                    // Context is still initializing
                    setTimeout(waitForRunning, 100);
                }
            };
            
            waitForRunning();
            
        } catch (error) {
            console.error('[Basitune Visualizer] Failed to initialize audio context:', error);
            reject(error);
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
    async function start() {
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
            await initializeAudioContext();
        }

        // Resume audio context if suspended
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Show canvas, hide placeholder
        const placeholder = document.getElementById('basitune-visualizer-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        if (canvas) canvas.style.display = 'block';

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

        // Hide canvas, show placeholder
        const placeholder = document.getElementById('basitune-visualizer-placeholder');
        if (canvas) canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';

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

        const barWidth = ((width / bufferLength) * 2.5) - barSpacing;
        let x = 0;

        applyGlow();

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * sensitivity;

            // Create gradient for bars using palette
            const gradient = canvasCtx.createLinearGradient(0, height - barHeight, 0, height);
            const colors = getPaletteColors();
            if (colors.length > 2) {
                // Multi-color palette
                colors.forEach((color, idx) => {
                    gradient.addColorStop(idx / (colors.length - 1), color);
                });
            } else {
                gradient.addColorStop(0, colors[0]);
                gradient.addColorStop(1, colors[1] || adjustColorBrightness(colors[0], -40));
            }

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + barSpacing + 1;
        }

        clearGlow();
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

        // Create gradient for palette support
        const colors = getPaletteColors();
        if (colors.length > 1) {
            const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
            colors.forEach((color, i) => {
                gradient.addColorStop(i / (colors.length - 1), color);
            });
            canvasCtx.strokeStyle = gradient;
        } else {
            canvasCtx.strokeStyle = barColor;
        }

        if (glowEnabled) {
            canvasCtx.shadowBlur = glowIntensity;
            canvasCtx.shadowColor = getColorForPalette(0.5);
        }
        
        canvasCtx.lineWidth = 2;
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
        clearGlow();
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

        applyGlow();
        for (let i = 0; i < barCount; i++) {
            const angle = i * angleStep;
            const barHeight = (dataArray[i] / 255) * radius * sensitivity;

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            // Create gradient with palette support
            const gradient = canvasCtx.createLinearGradient(x1, y1, x2, y2);
            const color = getColorForPalette(i / barCount);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, adjustColorBrightness(color, -40));

            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineWidth = 2;
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }
        clearGlow();

        // Draw center circle
        canvasCtx.beginPath();
        canvasCtx.arc(centerX, centerY, radius * 0.1, 0, Math.PI * 2);
        canvasCtx.fillStyle = getColorForPalette(0.5);
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

        applyGlow();
        for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI * 2;
            const barHeight = (dataArray[i * 2] / 255) * radius * sensitivity;

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            const gradient = canvasCtx.createLinearGradient(x1, y1, x2, y2);
            const color = getColorForPalette(i / barCount);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, adjustColorBrightness(color, 40));

            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineWidth = 4;
            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.stroke();
        }
        clearGlow();
    }

    // Render spectrum with gradient
    function renderSpectrum() {
        const width = canvas.width;
        const height = canvas.height;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) - barSpacing;

        applyGlow();

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * sensitivity;
            const x = i * (barWidth + barSpacing);
            const y = height - barHeight;

            // Create vertical gradient with palette
            const gradient = canvasCtx.createLinearGradient(x, height, x, y);
            const colors = getPaletteColors();
            if (colors.length > 2) {
                colors.forEach((color, idx) => {
                    gradient.addColorStop(idx / (colors.length - 1), color);
                });
            } else {
                gradient.addColorStop(0, adjustColorBrightness(colors[0], -60));
                gradient.addColorStop(0.5, colors[0]);
                gradient.addColorStop(1, adjustColorBrightness(colors[0], 60));
            }

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, y, barWidth, barHeight);
        }

        clearGlow();
    }

    // Render particles
    function renderParticles() {
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        applyGlow();

        for (let i = 0; i < particleCount; i++) {
            const dataIndex = Math.floor((i / particleCount) * bufferLength);
            const intensity = dataArray[dataIndex] / 255;
            const angle = (i / particleCount) * Math.PI * 2 + getAnimationTime();
            const distance = intensity * Math.min(width, height) * 0.4 * sensitivity;

            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            const size = 2 + intensity * 6;

            const color = getColorForPalette(i / particleCount);
            const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, size);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'transparent');

            canvasCtx.fillStyle = gradient;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, size, 0, Math.PI * 2);
            canvasCtx.fill();
        }

        clearGlow();
    }

    // Render symmetrical bars (mirrored)
    function renderSymmetrical() {
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) - barSpacing;

        applyGlow();

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * (height / 2) * sensitivity;
            const x = i * (barWidth + barSpacing);

            const colors = getPaletteColors();
            
            // Top half
            const gradient1 = canvasCtx.createLinearGradient(x, centerY, x, centerY - barHeight);
            if (colors.length > 2) {
                colors.forEach((color, idx) => {
                    gradient1.addColorStop(idx / (colors.length - 1), color);
                });
            } else {
                gradient1.addColorStop(0, colors[0]);
                gradient1.addColorStop(1, adjustColorBrightness(colors[0], -40));
            }
            canvasCtx.fillStyle = gradient1;
            canvasCtx.fillRect(x, centerY - barHeight, barWidth, barHeight);

            // Bottom half (mirrored)
            const gradient2 = canvasCtx.createLinearGradient(x, centerY, x, centerY + barHeight);
            if (colors.length > 2) {
                colors.forEach((color, idx) => {
                    gradient2.addColorStop(idx / (colors.length - 1), color);
                });
            } else {
                gradient2.addColorStop(0, colors[0]);
                gradient2.addColorStop(1, adjustColorBrightness(colors[0], -40));
            }
            canvasCtx.fillStyle = gradient2;
            canvasCtx.fillRect(x, centerY, barWidth, barHeight);
        }

        clearGlow();
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
        const time = getAnimationTime() / 2;

        applyGlow();

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

            const color = getColorForPalette(progress);
            const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, 4);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'transparent');

            canvasCtx.fillStyle = gradient;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 4, 0, Math.PI * 2);
            canvasCtx.fill();
        }

        clearGlow();
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
        const time = getAnimationTime();

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

        applyGlow();

        // Fill with gradient using palette
        const colors = getPaletteColors();
        const gradient = canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 2);
        if (colors.length > 2) {
            colors.forEach((color, idx) => {
                gradient.addColorStop(idx / (colors.length - 1), color);
            });
        } else {
            gradient.addColorStop(0, adjustColorBrightness(colors[0], 40));
            gradient.addColorStop(0.7, colors[0]);
            gradient.addColorStop(1, adjustColorBrightness(colors[0], -40));
        }

        canvasCtx.fillStyle = gradient;
        canvasCtx.fill();

        // Add outline
        canvasCtx.strokeStyle = barColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();

        clearGlow();
    }

    // Render line spectrum
    function renderLineSpectrum() {
        const width = canvas.width;
        const height = canvas.height;

        canvasCtx.fillStyle = backgroundColor;
        canvasCtx.fillRect(0, 0, width, height);

        const pointWidth = width / bufferLength;

        // Create gradient for palette support
        const colors = getPaletteColors();
        if (colors.length > 1) {
            const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
            colors.forEach((color, i) => {
                gradient.addColorStop(i / (colors.length - 1), color);
            });
            canvasCtx.strokeStyle = gradient;
        } else {
            canvasCtx.strokeStyle = barColor;
        }

        applyGlow();
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
        clearGlow();

        // Fill area under line
        canvasCtx.lineTo(width, height);
        canvasCtx.lineTo(0, height);
        canvasCtx.closePath();

        const fillGradient = canvasCtx.createLinearGradient(0, 0, 0, height);
        const topColor = getColorForPalette(0.5);
        fillGradient.addColorStop(0, topColor + '80'); // Semi-transparent
        fillGradient.addColorStop(1, backgroundColor);

        canvasCtx.fillStyle = fillGradient;
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

        // Create gradient for palette support
        const colors = getPaletteColors();
        if (colors.length > 1) {
            const gradient = canvasCtx.createLinearGradient(0, 0, width, 0);
            colors.forEach((color, i) => {
                gradient.addColorStop(i / (colors.length - 1), color);
            });
            canvasCtx.strokeStyle = gradient;
        } else {
            canvasCtx.strokeStyle = barColor;
        }

        applyGlow();
        canvasCtx.lineWidth = 2;

        // Top waveform
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
        clearGlow();

        // Center line
        const centerColor = getColorForPalette(0.5);
        canvasCtx.strokeStyle = adjustColorBrightness(centerColor, -40);
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
        if (settings.colorPalette) colorPalette = settings.colorPalette;
        if (settings.animationSpeed !== undefined) animationSpeed = settings.animationSpeed;
        if (settings.glowEnabled !== undefined) glowEnabled = settings.glowEnabled;
        if (settings.glowIntensity !== undefined) glowIntensity = settings.glowIntensity;
        if (settings.barSpacing !== undefined) barSpacing = settings.barSpacing;
        if (settings.particleCount !== undefined) particleCount = settings.particleCount;
        
        console.log('[Basitune Visualizer] Settings updated:', settings);
    }
    
    // Reset to default settings
    function resetToDefaults() {
        visualizerStyle = 'bars';
        barColor = '#ff0000';
        backgroundColor = '#0a0a0a';
        sensitivity = 1.0;
        colorPalette = 'single';
        animationSpeed = 1.0;
        glowEnabled = false;
        glowIntensity = 10.0;
        barSpacing = 1.0;
        particleCount = 80;
        
        console.log('[Basitune Visualizer] Reset to defaults');
    }

    // Expose API to window
    window.basituneVisualizer = {
        setCanvas,
        resizeCanvas,
        start,
        stop,
        updateSettings,
        resetToDefaults,
        isActive: () => isVisualizerActive,
        getSettings: () => ({
            style: visualizerStyle,
            color: barColor,
            sensitivity,
            colorPalette,
            animationSpeed,
            glowEnabled,
            glowIntensity,
            barSpacing,
            particleCount
        })
    };

    console.log('[Basitune Visualizer] API exposed to window.basituneVisualizer');
    
    // Initialize audio context immediately for high-quality audio from start
    // Show loading overlay until audio is ready
    const startTime = Date.now();
    const MIN_LOADING_TIME = 2000; // Minimum 2 seconds display
    
    console.log('[Basitune Visualizer] DEBUG: Scheduling audio init in 1000ms');
    
    setTimeout(() => {
        console.log('[Basitune Visualizer] DEBUG: Starting audio initialization...');
        
        // Ensure overlay is created if it wasn't already
        const overlay = ensureOverlay();
        console.log('[Basitune Visualizer] DEBUG: Loading overlay exists:', !!overlay);
        console.log('[Basitune Visualizer] DEBUG: Loading overlay in DOM:', overlay?.parentNode !== null);
        
        initializeAudioContext()
            .then(() => {
                const elapsed = Date.now() - startTime;
                const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
                
                console.log('[Basitune Visualizer] DEBUG: Audio ready. Elapsed:', elapsed, 'ms, Remaining:', remainingTime, 'ms');
                
                // Wait for minimum display time before hiding
                setTimeout(() => {
                    console.log('[Basitune Visualizer] DEBUG: Hiding loading overlay');
                    // Fade out loading overlay
                    const currentOverlay = ensureOverlay();
                    if (currentOverlay) {
                        currentOverlay.style.opacity = '0';
                        console.log('[Basitune Visualizer] DEBUG: Overlay opacity set to 0');
                        setTimeout(() => {
                            if (currentOverlay.parentNode) {
                                currentOverlay.parentNode.removeChild(currentOverlay);
                                console.log('[Basitune Visualizer] DEBUG: Overlay removed from DOM');
                            }
                        }, 500);
                    }
                    
                    // Signal to Rust backend that audio is ready for playback restore
                    if (window.__TAURI_INTERNALS__) {
                        window.__TAURI_INTERNALS__.invoke('audio_context_ready').catch(() => {
                            // Command may not exist yet, that's OK
                        });
                    }
                }, remainingTime);
            })
            .catch(err => {
                console.error('[Basitune Visualizer] DEBUG: Failed to initialize audio:', err);
                // Hide overlay even on error
                const currentOverlay = ensureOverlay();
                if (currentOverlay && currentOverlay.parentNode) {
                    currentOverlay.style.opacity = '0';
                    setTimeout(() => {
                        if (currentOverlay.parentNode) {
                            currentOverlay.parentNode.removeChild(currentOverlay);
                        }
                    }, 500);
                }
            });
    }, 100); // Start almost immediately
})();


