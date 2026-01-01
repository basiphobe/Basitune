// Artist Info Sidebar for YouTube Music
// Monitors current song and displays artist bio from Wikipedia
// Version: 1.3.0

(function() {
    'use strict';

    // Prevent double-injection if the script runs multiple times
    if (window.__basituneSidebarInitialized) {
        console.log('[Basitune] Sidebar script already initialized, skipping re-run');
        return;
    }
    window.__basituneSidebarInitialized = true;
    
    let currentArtist = '';
    let currentTitle = '';
    let sidebarVisible = false;
    let activeTab = 'artist'; // 'artist', 'lyrics', 'visualizer', 'settings', or 'about'
    let sidebarWidth = 760; // Default width in pixels
    let sidebarFontSize = 14; // Default font size in pixels
    let isResizing = false;
    let lastSearchResults = null; // Store last search results for "Go Back"
    let ttPolicy = null; // Trusted Types policy (if available)

    // Safely set innerHTML while respecting Trusted Types
    function setHTML(element, html) {
        if (!element) return;

        if (!ttPolicy && window.trustedTypes) {
            try {
                ttPolicy = window.trustedTypes.createPolicy('basitune', {
                    createHTML: (input) => input
                });
            } catch (error) {
                console.warn('[Basitune] Trusted Types policy creation failed:', error);
            }
        }

        try {
            if (ttPolicy) {
                element.innerHTML = ttPolicy.createHTML(html);
            } else {
                element.innerHTML = html;
            }
        } catch (error) {
            console.error('[Basitune] Failed to set HTML:', error);
        }
    }

    // Plain text setter to avoid Trusted Types when HTML is unnecessary
    function setText(element, text) {
        if (!element) return;
        element.textContent = text;
    }
    
    // Update notification functions
    window.showUpdateNotification = function(message, persistent) {
        console.log('[Basitune] Update:', message);
        
        // Find or create notification container
        let container = document.getElementById('basitune-update-notification');
        if (!container) {
            container = document.createElement('div');
            container.id = 'basitune-update-notification';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: 'Roboto', sans-serif;
                font-size: 14px;
                max-width: 350px;
                animation: slideIn 0.3s ease-out;
            `;
            document.body.appendChild(container);
        }
        
        container.textContent = message;
        container.style.display = 'block';
        
        // Auto-hide after 8 seconds unless persistent
        if (!persistent) {
            setTimeout(() => {
                if (container) {
                    container.style.animation = 'slideOut 0.3s ease-in';
                    setTimeout(() => {
                        if (container && container.parentNode) {
                            container.parentNode.removeChild(container);
                        }
                    }, 300);
                }
            }, 8000);
        }
    };
    
    window.updateDownloadProgress = function(percent) {
        const container = document.getElementById('basitune-update-notification');
        if (container) {
            setHTML(container, `
                <div>Downloading update...</div>
                <div style="margin-top: 8px; background: rgba(255,255,255,0.3); border-radius: 4px; height: 6px; overflow: hidden;">
                    <div style="background: white; height: 100%; width: ${percent}%; transition: width 0.3s;"></div>
                </div>
                <div style="margin-top: 4px; font-size: 12px; opacity: 0.9;">${percent}%</div>
            `);
        }
    };
    
    // Create sidebar HTML
    function createSidebar() {
        // Clean up any existing sidebar artifacts from prior injections
        const existingSidebar = document.getElementById('basitune-sidebar');
        const existingReopen = document.getElementById('basitune-reopen');
        const existingStyles = document.getElementById('basitune-styles');
        if (existingSidebar) existingSidebar.remove();
        if (existingReopen) existingReopen.remove();
        if (existingStyles) existingStyles.remove();

        const sidebar = document.createElement('div');
        sidebar.id = 'basitune-sidebar';
        setHTML(sidebar, `
            <div id="basitune-resize-handle"></div>
            <div id="basitune-sidebar-header">
                <div id="basitune-controls">
                    <button id="basitune-font-decrease" title="Decrease font size">A-</button>
                    <button id="basitune-font-increase" title="Increase font size">A+</button>
                    <button id="basitune-toggle">×</button>
                </div>
            </div>
            <div id="basitune-sidebar-body">
                <div id="basitune-tabs">
                    <button class="basitune-tab active" data-tab="artist" title="Artist Information">
                        <span class="basitune-tab-icon">🎤</span>
                        <span class="basitune-tab-label">Artist</span>
                    </button>
                    <button class="basitune-tab" data-tab="lyrics" title="Song Lyrics">
                        <span class="basitune-tab-icon">📝</span>
                        <span class="basitune-tab-label">Lyrics</span>
                    </button>
                    <button class="basitune-tab" data-tab="visualizer" title="Music Visualizer">
                        <span class="basitune-tab-icon">🎵</span>
                        <span class="basitune-tab-label">Visualizer</span>
                    </button>
                    <button class="basitune-tab" data-tab="settings" title="Settings">
                        <span class="basitune-tab-icon">⚙️</span>
                        <span class="basitune-tab-label">Settings</span>
                    </button>
                    <button class="basitune-tab" data-tab="about" title="About Basitune">
                        <span class="basitune-tab-icon">ℹ️</span>
                        <span class="basitune-tab-label">About</span>
                    </button>
                </div>
                <div id="basitune-sidebar-content">
                    <div id="basitune-artist-tab" class="basitune-tab-content active">
                        <div id="basitune-song-context">
                        </div>
                        <div id="basitune-artist-bio">
                            <p class="basitune-placeholder">Play a song to see artist information</p>
                        </div>
                    </div>
                    <div id="basitune-lyrics-tab" class="basitune-tab-content">
                        <div id="basitune-lyrics-content">
                            <p class="basitune-placeholder">Play a song to see lyrics</p>
                        </div>
                    </div>
                    <div id="basitune-visualizer-tab" class="basitune-tab-content">
                        <div id="basitune-visualizer-content">
                            <div id="basitune-visualizer-placeholder" style="width: 100%; height: 400px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%); border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px;">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 18V5l12-2v13"></path>
                                    <circle cx="6" cy="18" r="3"></circle>
                                    <circle cx="18" cy="16" r="3"></circle>
                                </svg>
                                <p style="color: rgba(255, 255, 255, 0.4); font-size: 14px; margin: 0;">Click Start to begin visualization</p>
                            </div>
                            <canvas id="basitune-visualizer-canvas" width="720" height="400" style="width: 100%; height: auto; background: #0a0a0a; border-radius: 8px; margin-bottom: 20px; display: none;"></canvas>
                            
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Visualization Style</label>
                                <select id="basitune-viz-style" style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1) !important; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #fff !important; font-size: 13px; cursor: pointer; -webkit-appearance: none; -moz-appearance: none; appearance: none; box-sizing: border-box;">
                                    <option value="bars" style="background: #1a1a1a !important; color: #fff !important;">Frequency Bars</option>
                                    <option value="wave" style="background: #1a1a1a !important; color: #fff !important;">Waveform</option>
                                    <option value="circular" style="background: #1a1a1a !important; color: #fff !important;">Circular</option>
                                    <option value="radial" style="background: #1a1a1a !important; color: #fff !important;">Radial Bars</option>
                                    <option value="spectrum" style="background: #1a1a1a !important; color: #fff !important;">Spectrum</option>
                                    <option value="particles" style="background: #1a1a1a !important; color: #fff !important;">Particles</option>
                                    <option value="symmetrical" style="background: #1a1a1a !important; color: #fff !important;">Symmetrical Bars</option>
                                    <option value="spiral" style="background: #1a1a1a !important; color: #fff !important;">Spiral</option>
                                    <option value="blob" style="background: #1a1a1a !important; color: #fff !important;">Blob</option>
                                    <option value="line" style="background: #1a1a1a !important; color: #fff !important;">Line Spectrum</option>
                                    <option value="dual" style="background: #1a1a1a !important; color: #fff !important;">Dual Waveform</option>
                                </select>
                            </div>

                            <!-- Colors Section -->
                            <div class="basitune-viz-section">
                                <div class="basitune-viz-section-header" data-section="colors">
                                    <span>🎨 Colors</span>
                                    <span class="basitune-viz-section-toggle">▼</span>
                                </div>
                                <div class="basitune-viz-section-content" id="basitune-viz-colors-section">
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Color Palette</label>
                                        <select id="basitune-viz-palette" style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1) !important; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #fff !important; font-size: 13px; cursor: pointer; -webkit-appearance: none; -moz-appearance: none; appearance: none; box-sizing: border-box;">
                                            <option value="single" style="background: #1a1a1a !important; color: #fff !important;">Single Color</option>
                                            <option value="rainbow" style="background: #1a1a1a !important; color: #fff !important;">Rainbow</option>
                                            <option value="fire" style="background: #1a1a1a !important; color: #fff !important;">Fire</option>
                                            <option value="ocean" style="background: #1a1a1a !important; color: #fff !important;">Ocean</option>
                                            <option value="synthwave" style="background: #1a1a1a !important; color: #fff !important;">Synthwave</option>
                                            <option value="neon" style="background: #1a1a1a !important; color: #fff !important;">Neon</option>
                                        </select>
                                    </div>
                                    <div id="basitune-viz-single-color-container" style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Color</label>
                                        <input type="color" id="basitune-viz-color" value="#ff0000" style="width: 100%; height: 40px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; cursor: pointer;" />
                                    </div>
                                </div>
                            </div>

                            <!-- Animation Section -->
                            <div class="basitune-viz-section">
                                <div class="basitune-viz-section-header" data-section="animation">
                                    <span>⚡ Animation</span>
                                    <span class="basitune-viz-section-toggle">▼</span>
                                </div>
                                <div class="basitune-viz-section-content" id="basitune-viz-animation-section">
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Sensitivity: <span id="basitune-viz-sensitivity-value">1.0</span>x</label>
                                        <input type="range" id="basitune-viz-sensitivity" min="0.5" max="2.0" step="0.1" value="1.0" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                    <div id="basitune-viz-speed-container" style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Animation Speed: <span id="basitune-viz-speed-value">1.0</span>x</label>
                                        <input type="range" id="basitune-viz-speed" min="0.5" max="2.0" step="0.1" value="1.0" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                </div>
                            </div>

                            <!-- Effects Section -->
                            <div class="basitune-viz-section">
                                <div class="basitune-viz-section-header" data-section="effects">
                                    <span>✨ Effects</span>
                                    <span class="basitune-viz-section-toggle">▼</span>
                                </div>
                                <div class="basitune-viz-section-content" id="basitune-viz-effects-section">
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9); font-weight: 500; font-size: 13px; cursor: pointer;">
                                            <input type="checkbox" id="basitune-viz-glow" style="margin-right: 8px; cursor: pointer;">
                                            Enable Glow Effect
                                        </label>
                                    </div>
                                    <div id="basitune-viz-glow-intensity-container" style="margin-bottom: 12px; display: none;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Glow Intensity: <span id="basitune-viz-glow-value">10</span>px</label>
                                        <input type="range" id="basitune-viz-glow-intensity" min="0" max="20" step="1" value="10" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                    <div id="basitune-viz-line-thickness-container" style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Line Thickness: <span id="basitune-viz-thickness-value">2</span>px</label>
                                        <input type="range" id="basitune-viz-line-thickness" min="1" max="10" step="0.5" value="2" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                    <div id="basitune-viz-bar-spacing-container" style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Bar Spacing: <span id="basitune-viz-spacing-value">1</span>px</label>
                                        <input type="range" id="basitune-viz-bar-spacing" min="0" max="5" step="0.5" value="1" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                    <div id="basitune-viz-particle-count-container" style="margin-bottom: 12px;">
                                        <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">Particle Count: <span id="basitune-viz-particles-value">80</span></label>
                                        <input type="range" id="basitune-viz-particle-count" min="20" max="200" step="10" value="80" style="width: 100%; accent-color: #ff0000;" />
                                    </div>
                                </div>
                            </div>

                            <div style="display: flex; gap: 12px; margin: 20px 0 12px 0;">
                                <button id="basitune-viz-toggle" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%); border: none; color: #fff; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">Start Visualizer</button>
                                <button id="basitune-viz-fullwindow" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #444 0%, #222 100%); border: none; color: #fff; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">Full Window</button>
                            </div>
                            <button id="basitune-viz-reset" style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.8); font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Reset to Defaults</button>
                        </div>
                    </div>
                    <div id="basitune-settings-tab" class="basitune-tab-content">
                        <div id="basitune-settings-content">
                            <h3 style="margin-top: 0; color: #fff; font-size: 18px; margin-bottom: 20px;">API Configuration</h3>
                            <div style="margin-bottom: 24px;">
                                <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">
                                    OpenAI API Key
                                </label>
                                <input type="password" id="basitune-openai-key" placeholder="sk-proj-..." style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #fff; font-size: 13px; font-family: monospace; box-sizing: border-box;" />
                                <small style="color: rgba(255, 255, 255, 0.6); font-size: 11px; display: block; margin-top: 6px;">
                                    Required for artist bio information
                                </small>
                            </div>
                            <div style="margin-bottom: 24px;">
                                <label style="display: block; color: rgba(255, 255, 255, 0.9); font-weight: 500; margin-bottom: 8px; font-size: 13px;">
                                    Genius Access Token
                                </label>
                                <input type="password" id="basitune-genius-token" placeholder="Your Genius token..." style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #fff; font-size: 13px; font-family: monospace; box-sizing: border-box;" />
                                <small style="color: rgba(255, 255, 255, 0.6); font-size: 11px; display: block; margin-top: 6px;">
                                    Required for lyrics fetching
                                </small>
                            </div>
                            
                            <h3 style="margin-top: 30px; margin-bottom: 20px; color: #fff; font-size: 18px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">System Tray</h3>
                            <div style="margin-bottom: 24px;">
                                <label style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9); font-size: 13px; cursor: pointer; user-select: none;">
                                    <input type="checkbox" id="basitune-close-to-tray" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer; accent-color: #ff0000;" />
                                    <span>Close to system tray instead of exiting</span>
                                </label>
                                <small style="color: rgba(255, 255, 255, 0.6); font-size: 11px; display: block; margin-top: 6px; margin-left: 28px;">
                                    When enabled, clicking the close button will minimize Basitune to the system tray. Click the tray icon or use Quit to exit.
                                </small>
                            </div>
                            
                            <h3 style="margin-top: 30px; margin-bottom: 20px; color: #fff; font-size: 18px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">Notifications</h3>
                            <div style="margin-bottom: 24px;">
                                <label style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9); font-size: 13px; cursor: pointer; user-select: none;">
                                    <input type="checkbox" id="basitune-enable-notifications" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer; accent-color: #ff0000;" />
                                    <span>Show notifications when songs change</span>
                                </label>
                                <small style="color: rgba(255, 255, 255, 0.6); font-size: 11px; display: block; margin-top: 6px; margin-left: 28px;">
                                    Display desktop notifications with song title and artist when the track changes.
                                </small>
                            </div>
                            
                            <button id="basitune-save-settings" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%); border: none; color: #fff; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                                Save Settings
                            </button>
                            <div id="basitune-settings-status" style="margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 13px; display: none;"></div>
                        </div>
                    </div>
                    <div id="basitune-about-tab" class="basitune-tab-content">
                        <div id="basitune-about-content">
                            <h3 style="margin-top: 0; color: #fff; font-size: 18px; margin-bottom: 20px;">About Basitune</h3>
                            <div id="basitune-about-info" style="margin-bottom: 24px;">
                                <div class="basitune-about-item">
                                    <span class="basitune-about-label">Version:</span>
                                    <span id="basitune-version">Loading...</span>
                                </div>
                                <div class="basitune-about-item">
                                    <span class="basitune-about-label">App Name:</span>
                                    <span id="basitune-app-name">Loading...</span>
                                </div>
                                <div class="basitune-about-item">
                                    <span class="basitune-about-label">Identifier:</span>
                                    <span id="basitune-identifier">Loading...</span>
                                </div>
                            </div>
                            <div id="basitune-update-container" style="margin-top: 24px;">
                                <h4 style="color: #fff; font-size: 16px; margin-bottom: 12px;">Updates</h4>
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <button id="basitune-check-updates" style="padding: 12px; background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%); border: none; color: #fff; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                        <span style="font-size: 16px;">🔄</span>
                                        <span>Check for Updates</span>
                                    </button>
                                    <div id="basitune-update-status" style="display: none; padding: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.9); font-size: 13px;"></div>
                                    <div id="basitune-update-progress" style="display: none; margin-top: 8px;">
                                        <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
                                            <div id="basitune-update-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ff0000, #cc0000); transition: width 0.3s ease;"></div>
                                        </div>
                                        <div id="basitune-update-progress-text" style="margin-top: 4px; font-size: 11px; color: rgba(255, 255, 255, 0.6); text-align: center;"></div>
                                    </div>
                                </div>
                            </div>
                            <div id="basitune-links-container" style="margin-top: 24px;">
                                <h4 style="color: #fff; font-size: 16px; margin-bottom: 12px;">Links</h4>
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <a href="#" data-url="https://github.com/basiphobe/Basitune" class="basitune-external-link" style="padding: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.9); text-decoration: none; transition: all 0.2s; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <span style="font-size: 18px;">🐙</span>
                                        <span>GitHub Repository</span>
                                    </a>
                                    <a href="#" data-url="https://basitune.com/" class="basitune-external-link" style="padding: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.9); text-decoration: none; transition: all 0.2s; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <span style="font-size: 18px;">🌐</span>
                                        <span>Official Website</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        // Create full-window visualizer overlay
        const fullWindowOverlay = document.createElement('div');
        fullWindowOverlay.id = 'basitune-visualizer-overlay';
        // Don't set inline display style - let CSS handle it via the .active class
        setHTML(fullWindowOverlay, `
            <div id="basitune-overlay-content">
                <button id="basitune-overlay-close" title="Exit Full Window (ESC)">×</button>
                <div id="basitune-overlay-canvas-container"></div>
            </div>
        `);
        
        // Create reopen button
        const reopenBtn = document.createElement('button');
        reopenBtn.id = 'basitune-reopen';
        reopenBtn.textContent = '◀';
        reopenBtn.title = 'Open sidebar';
        
        // Add styles
        const style = document.createElement('style');
        style.id = 'basitune-styles';
        style.textContent = `
            @keyframes basitune-pulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            
            @keyframes basitune-shimmer {
                0% { background-position: -1000px 0; }
                100% { background-position: 1000px 0; }
            }
            
            @keyframes basitune-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(400px); opacity: 0; }
            }
            
            #basitune-sidebar {
                position: relative;
                width: var(--sidebar-width, 380px);
                min-width: 280px;
                max-width: 800px;
                height: 100vh;
                background: linear-gradient(135deg, #0a0a0a 0%, #121212 100%);
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                font-family: 'Roboto', sans-serif;
                backdrop-filter: blur(20px);
                flex-shrink: 0;
                order: 2;
            }
            
            #basitune-sidebar.hidden {
                width: 0 !important;
                min-width: 0 !important;
                overflow: hidden;
            }
            
            #basitune-resize-handle {
                position: absolute;
                left: 0;
                top: 0;
                width: 8px;
                height: 100%;
                cursor: ew-resize;
                z-index: 10001;
                background: transparent;
                transition: background 0.2s;
            }
            
            #basitune-resize-handle:hover {
                background: rgba(255, 0, 0, 0.3);
            }
            
            #basitune-resize-handle.resizing {
                background: rgba(255, 0, 0, 0.5);
            }
            
            #basitune-sidebar-header {
                padding: 16px 20px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 100%);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: flex-end;
                align-items: center;
                backdrop-filter: blur(10px);
            }
            
            #basitune-sidebar-body {
                flex: 1;
                display: flex;
                overflow: hidden;
            }
            
            #basitune-controls {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            #basitune-font-decrease,
            #basitune-font-increase {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.9);
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                padding: 6px 10px;
                border-radius: 6px;
                transition: all 0.2s;
            }
            
            #basitune-font-decrease:hover,
            #basitune-font-increase:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }
            
            #basitune-tabs {
                display: flex;
                flex-direction: column;
                gap: 4px;
                background: rgba(255, 255, 255, 0.03);
                padding: 12px 8px;
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 100px;
                width: 100px;
                order: 2;
            }
            
            .basitune-tab {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                padding: 12px 8px;
                border-radius: 8px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                text-align: center;
            }
            
            .basitune-tab-icon {
                font-size: 20px;
                line-height: 1;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .basitune-tab-label {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .basitune-tab::before {
                content: '';
                position: absolute;
                right: 0;
                top: 0;
                bottom: 0;
                width: 3px;
                background: linear-gradient(180deg, #ff0000, #ff3333);
                transform: scaleY(0);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .basitune-tab:hover {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.9);
                transform: translateX(-2px);
            }
            
            .basitune-tab:hover .basitune-tab-icon {
                transform: scale(1.1);
            }
            
            .basitune-tab:hover::before {
                transform: scaleY(1);
            }
            
            .basitune-tab.active {
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.2) 0%, rgba(204, 0, 0, 0.2) 100%);
                color: #fff;
                box-shadow: inset 2px 0 8px rgba(255, 0, 0, 0.3);
            }
            
            .basitune-tab.active::before {
                transform: scaleY(1);
                background: linear-gradient(180deg, #ff0000, #cc0000);
            }
            
            .basitune-tab.active .basitune-tab-icon {
                transform: scale(1.15);
            }
            
            #basitune-toggle {
                background: rgba(255, 255, 255, 0.05);
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 20px;
                cursor: pointer;
                padding: 8px;
                width: 32px;
                height: 32px;
                line-height: 16px;
                border-radius: 8px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            #basitune-toggle:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                transform: scale(1.1);
            }
            
            #basitune-sidebar-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                font-size: 14px;
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
            }
            
            #basitune-sidebar-content::-webkit-scrollbar {
                width: 8px;
            }
            
            #basitune-sidebar-content::-webkit-scrollbar-track {
                background: transparent;
            }
            
            #basitune-sidebar-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            
            #basitune-sidebar-content::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            .basitune-tab-content {
                display: none;
            }
            
            .basitune-tab-content.active {
                display: block;
                animation: basitune-fadeIn 0.3s ease;
            }
            
            @keyframes basitune-fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            #basitune-artist-bio {
                color: rgba(255, 255, 255, 0.85);
                line-height: 1.7;
                margin-bottom: 20px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.08) 0%, rgba(255, 0, 0, 0.03) 100%);
                border-radius: 12px;
                border-left: 3px solid #ff0000;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                animation: basitune-fadeIn 0.5s ease-out;
            }
            
            #basitune-artist-bio h4 {
                color: #fff;
                margin: 0 0 16px 0;
                font-size: 20px;
                font-weight: 600;
                background: linear-gradient(135deg, #fff 0%, rgba(255, 100, 100, 0.9) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
                letter-spacing: 0.5px;
            }
            
            #basitune-song-context {
                color: rgba(255, 255, 255, 0.85);
                line-height: 1.7;
                padding: 16px;
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.12) 0%, rgba(255, 0, 0, 0.05) 100%);
                border-radius: 12px;
                border-left: 4px solid #ff0000;
                margin-bottom: 20px;
                box-shadow: 0 2px 12px rgba(255, 0, 0, 0.15), 0 4px 20px rgba(0, 0, 0, 0.3);
                animation: basitune-fadeIn 0.5s ease-out;
                position: relative;
                overflow: hidden;
            }
            
            #basitune-song-context::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(255, 0, 0, 0.5), transparent);
            }
            
            #basitune-song-context h5 {
                color: #fff;
                margin: 0 0 12px 0;
                font-size: 15px;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            
            #basitune-lyrics-content {
                color: rgba(255, 255, 255, 0.85);
                font-family: 'Roboto', sans-serif;
                padding: 16px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 12px;
                box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2);
            }
            
            .basitune-placeholder {
                color: rgba(255, 255, 255, 0.4);
                font-style: italic;
                text-align: center;
                padding: 40px 20px;
            }
            
            .basitune-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                gap: 16px;
            }
            
            .basitune-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-top-color: #ff0000;
                border-radius: 50%;
                animation: basitune-spin 0.8s linear infinite;
            }
            
            .basitune-loading-text {
                color: rgba(255, 255, 255, 0.6);
                font-size: 13px;
                animation: basitune-pulse 1.5s ease-in-out infinite;
            }
            
            .basitune-skeleton {
                background: linear-gradient(
                    90deg,
                    rgba(255, 255, 255, 0.05) 0%,
                    rgba(255, 255, 255, 0.1) 50%,
                    rgba(255, 255, 255, 0.05) 100%
                );
                background-size: 1000px 100%;
                animation: basitune-shimmer 2s infinite linear;
                border-radius: 8px;
                margin-bottom: 12px;
            }
            
            .basitune-lyrics-error {
                padding: 20px;
                text-align: center;
                max-width: 450px;
                margin: 20px auto;
            }
            
            .basitune-error-icon {
                font-size: 48px;
                margin-bottom: 12px;
                filter: drop-shadow(0 2px 8px rgba(255, 0, 0, 0.3));
            }
            
            .basitune-error-title {
                color: #ff4444;
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 8px;
                text-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
            }
            
            .basitune-error-explanation {
                color: rgba(255, 255, 255, 0.7);
                font-size: 13px;
                line-height: 1.5;
                margin-bottom: 16px;
                text-align: left;
            }
            
            .basitune-error-message {
                color: rgba(255, 255, 255, 0.4);
                font-size: 12px;
                margin-top: 8px;
            }
            
            .basitune-manual-search {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .basitune-manual-search-label {
                color: rgba(255, 255, 255, 0.8);
                font-size: 13px;
                margin-bottom: 10px;
                font-weight: 500;
            }
            
            .basitune-field-label {
                display: block;
                color: rgba(255, 255, 255, 0.7);
                font-size: 11px;
                font-weight: 500;
                margin-bottom: 3px;
                margin-top: 6px;
            }
            
            .basitune-field-label:first-of-type {
                margin-top: 0;
            }
            
            .basitune-search-form {
                display: flex;
                flex-direction: column;
                gap: 0;
            }
            
            .basitune-search-input {
                width: 100%;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                transition: all 0.2s;
                margin-bottom: 2px;
            }
            
            .basitune-search-input:focus {
                outline: none;
                border-color: #ff0000;
                background: rgba(255, 255, 255, 0.08);
                box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.2);
            }
            
            .basitune-search-input::placeholder {
                color: rgba(255, 255, 255, 0.3);
            }
            
            .basitune-search-btn {
                width: 100%;
                padding: 9px 16px;
                background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
                border: none;
                border-radius: 6px;
                color: white;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 2px 8px rgba(255, 0, 0, 0.3);
                margin-top: 8px;
            }
            
            .basitune-search-btn:hover {
                background: linear-gradient(135deg, #cc0000 0%, #aa0000 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(255, 0, 0, 0.4);
            }
            
            .basitune-search-btn:active {
                transform: translateY(0);
            }
            
            .basitune-skeleton-title {
                height: 24px;
                width: 70%;
                margin-bottom: 16px;
            }
            
            .basitune-skeleton-line {
                height: 14px;
                width: 100%;
            }
            
            .basitune-skeleton-line:nth-child(2) {
                width: 95%;
            }
            
            .basitune-skeleton-line:nth-child(3) {
                width: 90%;
            }
            
            .basitune-skeleton-line:last-child {
                width: 85%;
            }
            
            .basitune-read-more {
                color: #ff0000;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                margin-top: 12px;
                display: inline-block;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                padding-left: 4px;
            }
            
            .basitune-read-more::before {
                content: '▸';
                position: absolute;
                left: -12px;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .basitune-read-more:hover {
                color: #ff3333;
                transform: translateX(2px);
            }
            
            .basitune-read-more:hover::before {
                transform: translateX(3px);
            }
            
            .basitune-truncated {
                display: block;
            }
            
            .basitune-truncated.basitune-expanded {
                display: block;
            }
            
            /* Reopen button */
            #basitune-reopen {
                position: fixed;
                top: 50%;
                right: 0;
                transform: translateY(-50%);
                background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
                border: none;
                color: #fff;
                font-size: 18px;
                cursor: pointer;
                padding: 16px 8px;
                border-radius: 8px 0 0 8px;
                box-shadow: -2px 2px 8px rgba(0, 0, 0, 0.3);
                z-index: 9999;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                opacity: 0;
                pointer-events: none;
            }
            
            #basitune-reopen.visible {
                opacity: 1;
                pointer-events: auto;
            }
            
            #basitune-reopen:hover {
                padding-right: 12px;
                box-shadow: -4px 4px 12px rgba(0, 0, 0, 0.5);
            }
            
            /* Create flex container for side-by-side layout */
            body {
                display: flex !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            
            /* Wrapper container constrains ytmusic-app within flexbox
             * This is necessary because YouTube Music uses fixed-position elements
             * that would otherwise overflow and overlay the sidebar */
            #basitune-ytmusic-wrapper {
                flex: 1 !important;
                min-width: 0 !important;
                order: 1 !important;
                overflow: visible !important;
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                height: 100vh !important;
            }
            
            /* ytmusic-app fills its wrapper */
            ytmusic-app {
                width: 100% !important;
                height: 100% !important;
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                flex: 1 !important;
                overflow: visible !important;
            }
            
            /* Ensure the app layout can scroll */
            ytmusic-app-layout {
                overflow-y: auto !important;
                overflow-x: hidden !important;
                height: 100% !important;
            }
            
            /* Constrain YouTube's fixed-position elements to respect the sidebar
             * These elements use position:fixed and would otherwise span the full viewport */
            ytmusic-nav-bar,
            ytmusic-player-bar {
                max-width: calc(100vw - var(--sidebar-width, 380px)) !important;
                width: calc(100vw - var(--sidebar-width, 380px)) !important;
            }
            
            /* Constrain main content areas to prevent horizontal overflow */
            ytmusic-app-layout,
            #content,
            ytmusic-browse-response,
            ytmusic-section-list-renderer,
            ytmusic-playlist-shelf-renderer,
            ytmusic-item-section-renderer,
            ytmusic-music-shelf-renderer,
            ytmusic-carousel-shelf-renderer,
            ytmusic-player-page,
            .ytmusic-player-page,
            tp-yt-paper-dialog {
                max-width: calc(100vw - var(--sidebar-width, 380px)) !important;
            }
            
            /* When sidebar is hidden, allow full width for all constrained elements */
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-nav-bar,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-player-bar,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-app-layout,
            body:has(#basitune-sidebar[data-hidden="true"]) #content,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-browse-response,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-section-list-renderer,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-playlist-shelf-renderer,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-item-section-renderer,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-music-shelf-renderer,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-carousel-shelf-renderer,
            body:has(#basitune-sidebar[data-hidden="true"]) ytmusic-player-page,
            body:has(#basitune-sidebar[data-hidden="true"]) .ytmusic-player-page,
            body:has(#basitune-sidebar[data-hidden="true"]) tp-yt-paper-dialog {
                max-width: 100vw !important;
            }
            
            /* Settings tab styles */
            #basitune-settings-content input[type="password"]:focus {
                outline: none;
                border-color: #ff0000;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.2);
            }
            
            #basitune-save-settings:hover {
                background: linear-gradient(135deg, #cc0000 0%, #aa0000 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(255, 0, 0, 0.4);
            }
            
            #basitune-save-settings:active {
                transform: translateY(0);
            }
            
            #basitune-save-settings:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }
            
            /* About tab styles */
            .basitune-about-item {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .basitune-about-item:last-child {
                border-bottom: none;
            }
            
            .basitune-about-label {
                color: rgba(255, 255, 255, 0.7);
                font-weight: 600;
                font-size: 13px;
            }
            
            .basitune-about-item span:last-child {
                color: rgba(255, 255, 255, 0.9);
                font-family: monospace;
                font-size: 12px;
            }
            
            #basitune-changelog {
                font-size: 12px;
                line-height: 1.6;
                color: rgba(255, 255, 255, 0.8);
            }
            
            #basitune-changelog h2 {
                color: #ff0000;
                font-size: 14px;
                margin: 16px 0 8px 0;
                border-bottom: 1px solid rgba(255, 0, 0, 0.3);
                padding-bottom: 4px;
            }
            
            #basitune-changelog h3 {
                color: #fff;
                font-size: 13px;
                margin: 12px 0 6px 0;
            }
            
            #basitune-changelog ul {
                margin: 8px 0;
                padding-left: 20px;
            }
            
            #basitune-changelog li {
                margin: 4px 0;
            }
            
            #basitune-changelog code {
                background: rgba(255, 255, 255, 0.1);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: monospace;
                font-size: 11px;
            }
            
            /* About tab links */
            #basitune-links-container a:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.3);
                transform: translateY(-2px);
            }
            
            #basitune-links-container a:active {
                transform: translateY(0);
            }
            
            /* Full-window visualizer overlay */
            #basitune-visualizer-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.95);
                z-index: 100000;
                justify-content: center;
                align-items: center;
            }
            
            #basitune-visualizer-overlay.active {
                display: flex;
            }
            
            #basitune-overlay-content {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            #basitune-overlay-close {
                position: absolute;
                top: 20px;
                right: 20px;
                background: rgba(255, 0, 0, 0.8);
                border: none;
                color: white;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                font-size: 32px;
                line-height: 1;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                z-index: 100001;
            }
            
            #basitune-overlay-close:hover {
                background: rgba(255, 0, 0, 1);
                transform: scale(1.1);
                box-shadow: 0 6px 16px rgba(255, 0, 0, 0.6);
            }
            
            #basitune-overlay-canvas-container {
                width: 90vw;
                height: 90vh;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            #basitune-overlay-canvas-container canvas {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            
            /* Visualizer collapsible sections */
            .basitune-viz-section {
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                overflow: hidden;
                background: rgba(255, 255, 255, 0.05);
            }
            
            .basitune-viz-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 14px;
                cursor: pointer;
                user-select: none;
                background: rgba(255, 255, 255, 0.05);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                transition: background 0.2s;
            }
            
            .basitune-viz-section-header:hover {
                background: rgba(255, 255, 255, 0.08);
            }
            
            .basitune-viz-section-header span:first-child {
                color: rgba(255, 255, 255, 0.95);
                font-weight: 600;
                font-size: 13px;
            }
            
            .basitune-viz-section-toggle {
                color: rgba(255, 255, 255, 0.6);
                font-size: 12px;
                transition: transform 0.3s;
            }
            
            .basitune-viz-section-header.collapsed .basitune-viz-section-toggle {
                transform: rotate(-90deg);
            }
            
            .basitune-viz-section-content {
                padding: 14px;
                max-height: 500px;
                overflow: hidden;
                transition: max-height 0.3s ease, padding 0.3s ease;
            }
            
            .basitune-viz-section-content.collapsed {
                max-height: 0;
                padding: 0 14px;
            }
        `;
        
        document.head.appendChild(style);
        
        // Set default width via CSS variable before adding to DOM
        document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
        
        // Force flex layout on body (in case YouTube sets inline styles)
        document.body.style.setProperty('display', 'flex', 'important');
        document.body.style.setProperty('margin', '0', 'important');
        document.body.style.setProperty('padding', '0', 'important');
        
        // Always insert sidebar and button as direct children of body
        // Wrap ytmusic-app in a container to constrain it within flexbox
        const ytmusicApp = document.querySelector('ytmusic-app');
        
        if (ytmusicApp && ytmusicApp.parentNode === document.body) {
            const wrapper = document.createElement('div');
            wrapper.id = 'basitune-ytmusic-wrapper';
            wrapper.style.cssText = 'flex: 1 !important; min-width: 0 !important; order: 1 !important; overflow: hidden !important; position: relative !important;';
            
            // Replace ytmusic-app with wrapper, then put ytmusic-app inside wrapper
            document.body.insertBefore(wrapper, ytmusicApp);
            wrapper.appendChild(ytmusicApp);
            
            // Make ytmusic-app fill the wrapper
            ytmusicApp.style.cssText = 'width: 100% !important; height: 100% !important; position: relative !important;';
        }
        
        document.body.appendChild(sidebar);
        document.body.appendChild(reopenBtn);
        document.body.appendChild(fullWindowOverlay);
        
        // Prevent scroll bleed-through to main page
        const sidebarContent = document.getElementById('basitune-sidebar-content');
        sidebarContent.addEventListener('wheel', (e) => {
            const atTop = sidebarContent.scrollTop === 0;
            const atBottom = sidebarContent.scrollTop + sidebarContent.clientHeight >= sidebarContent.scrollHeight;
            
            // Prevent scrolling main page when at boundaries
            if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
                e.preventDefault();
            }
            
            // Always stop propagation to keep scroll in sidebar
            e.stopPropagation();
        }, { passive: false });
        
        // Monitor and enforce body styles (in case YouTube resets them)
        const enforceBodyStyles = () => {
            const currentDisplay = window.getComputedStyle(document.body).display;
            if (currentDisplay !== 'flex') {
                console.log('[Basitune] Re-applying flex layout to body');
                document.body.style.setProperty('display', 'flex', 'important');
                document.body.style.setProperty('margin', '0', 'important');
                document.body.style.setProperty('padding', '0', 'important');
            }
        };
        
        // Check immediately and periodically
        enforceBodyStyles();
        setInterval(enforceBodyStyles, 1000);
        
        // Also observe style attribute changes
        const bodyObserver = new MutationObserver(enforceBodyStyles);
        bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
        
        console.log('[Basitune] Sidebar layout: position=relative, flex-based side-by-side (v2)');
        
        // Toggle button functionality
        document.getElementById('basitune-toggle').addEventListener('click', toggleSidebar);
        
        // Reopen button functionality
        reopenBtn.addEventListener('click', toggleSidebar);
        
        // Font size controls
        document.getElementById('basitune-font-decrease').addEventListener('click', decreaseFontSize);
        document.getElementById('basitune-font-increase').addEventListener('click', increaseFontSize);
        
        // Setup resize functionality
        setupResizeHandle();
        
        // Tab switching functionality
        document.querySelectorAll('.basitune-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });
        
        // Settings save button
        const saveSettingsBtn = document.getElementById('basitune-save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', saveSettings);
        }
        
        // Check for Updates button
        const checkUpdatesBtn = document.getElementById('basitune-check-updates');
        if (checkUpdatesBtn) {
            checkUpdatesBtn.addEventListener('click', checkForUpdates);
        }
        
        // External link handlers for About tab
        document.querySelectorAll('.basitune-external-link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const url = link.getAttribute('data-url');
                
                if (url && window.__TAURI__?.shell?.open) {
                    try {
                        await window.__TAURI__.shell.open(url);
                    } catch (error) {
                        console.error('[Basitune] Failed to open URL:', url, error);
                    }
                }
            });
        });
        
        console.log('[Basitune] Sidebar created');
    }
    
    // Setup resize handle drag functionality
    function setupResizeHandle() {
        const resizeHandle = document.getElementById('basitune-resize-handle');
        const sidebar = document.getElementById('basitune-sidebar');
        
        let startX = 0;
        let startWidth = 0;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebarWidth;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));
            
            setSidebarWidth(newWidth);
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                saveSidebarWidth();
            }
        });
    }
    
    // Set sidebar width
    function setSidebarWidth(width) {
        sidebarWidth = width;
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    }
    
    // Save sidebar width to backend
    async function saveSidebarWidth() {
        try {
            await window.__TAURI__.core.invoke('set_sidebar_width', { width: sidebarWidth });
            console.log('[Basitune] Saved sidebar width:', sidebarWidth);
        } catch (error) {
            console.error('[Basitune] Failed to save sidebar width:', error);
        }
    }
    
    // Font size control functions
    async function decreaseFontSize() {
        const minSize = 10;
        if (sidebarFontSize > minSize) {
            sidebarFontSize = Math.max(minSize, sidebarFontSize - 2);
            applyFontSize();
            await saveFontSize();
        }
    }
    
    async function increaseFontSize() {
        const maxSize = 24;
        if (sidebarFontSize < maxSize) {
            sidebarFontSize = Math.min(maxSize, sidebarFontSize + 2);
            applyFontSize();
            await saveFontSize();
        }
    }
    
    function applyFontSize() {
        const sidebarContent = document.getElementById('basitune-sidebar-content');
        console.log('[Basitune] applyFontSize called, fontSize:', sidebarFontSize, 'element:', sidebarContent);
        if (sidebarContent) {
            sidebarContent.style.fontSize = sidebarFontSize + 'px';
            console.log('[Basitune] Applied font size, computed style:', window.getComputedStyle(sidebarContent).fontSize);
        } else {
            console.error('[Basitune] Sidebar content element not found!');
        }
    }
    
    async function saveFontSize() {
        try {
            await window.__TAURI__.core.invoke('set_sidebar_font_size', { fontSize: sidebarFontSize });
        } catch (error) {
            console.error('[Basitune] Failed to save font size:', error);
        }
    }
    
    // About tab functions
    async function loadAboutInfo() {
        try {
            const metadata = await window.__TAURI__.core.invoke('get_app_metadata');
            
            const versionEl = document.getElementById('basitune-version');
            const nameEl = document.getElementById('basitune-app-name');
            const identifierEl = document.getElementById('basitune-identifier');
            
            if (versionEl) versionEl.textContent = metadata.version;
            if (nameEl) nameEl.textContent = metadata.name;
            if (identifierEl) identifierEl.textContent = metadata.identifier;
        } catch (error) {
            console.error('[Basitune] Failed to load app metadata:', error);
            const versionEl = document.getElementById('basitune-version');
            if (versionEl) versionEl.textContent = 'Error loading';
        }
    }
    
    // Update check functions
    async function checkForUpdates() {
        const checkBtn = document.getElementById('basitune-check-updates');
        const statusDiv = document.getElementById('basitune-update-status');
        const progressDiv = document.getElementById('basitune-update-progress');
        
        if (!checkBtn || !statusDiv) {
            console.error('[Basitune] Required update elements not found');
            return;
        }
        
        // Show checking status
        checkBtn.disabled = true;
        checkBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.style.fontSize = '16px';
        spinner.textContent = '⏳';
        const text = document.createElement('span');
        text.textContent = 'Checking...';
        checkBtn.appendChild(spinner);
        checkBtn.appendChild(text);
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 255, 255, 0.05)';
        statusDiv.style.color = 'rgba(255, 255, 255, 0.9)';
        statusDiv.textContent = 'Checking for updates...';
        if (progressDiv) progressDiv.style.display = 'none';
        
        try {
            const updateInfo = await window.__TAURI__.core.invoke('check_for_updates');
            
            if (updateInfo.available) {
                // Update available
                statusDiv.style.background = 'rgba(0, 200, 0, 0.1)';
                statusDiv.style.border = '1px solid rgba(0, 200, 0, 0.3)';
                statusDiv.style.color = '#00ff00';
                
                // Clear and rebuild content safely
                statusDiv.textContent = '';
                const title = document.createElement('div');
                title.style.marginBottom = '8px';
                const titleStrong = document.createElement('strong');
                titleStrong.textContent = 'Update Available!';
                title.appendChild(titleStrong);
                
                const currentDiv = document.createElement('div');
                currentDiv.style.fontSize = '12px';
                currentDiv.style.opacity = '0.8';
                currentDiv.textContent = `Current: ${updateInfo.current_version}`;
                
                const latestDiv = document.createElement('div');
                latestDiv.style.fontSize = '12px';
                latestDiv.style.opacity = '0.8';
                latestDiv.textContent = `Latest: ${updateInfo.latest_version}`;
                
                statusDiv.appendChild(title);
                statusDiv.appendChild(currentDiv);
                statusDiv.appendChild(latestDiv);
                
                // Replace check button with install button
                checkBtn.textContent = '';
                const downloadIcon = document.createElement('span');
                downloadIcon.style.fontSize = '16px';
                downloadIcon.textContent = '⬇️';
                const downloadText = document.createElement('span');
                downloadText.textContent = 'Install Update';
                checkBtn.appendChild(downloadIcon);
                checkBtn.appendChild(downloadText);
                checkBtn.disabled = false;
                checkBtn.onclick = installUpdate;
            } else {
                // No update available
                statusDiv.style.background = 'rgba(255, 255, 255, 0.05)';
                statusDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                statusDiv.style.color = 'rgba(255, 255, 255, 0.9)';
                statusDiv.textContent = `You're running the latest version (${updateInfo.current_version})`;
                
                checkBtn.textContent = '';
                const checkIcon = document.createElement('span');
                checkIcon.style.fontSize = '16px';
                checkIcon.textContent = '✓';
                const checkText = document.createElement('span');
                checkText.textContent = 'Up to Date';
                checkBtn.appendChild(checkIcon);
                checkBtn.appendChild(checkText);
                checkBtn.disabled = false;
            }
        } catch (error) {
            console.error('[Basitune] Failed to check for updates:', error);
            statusDiv.style.background = 'rgba(200, 0, 0, 0.1)';
            statusDiv.style.border = '1px solid rgba(200, 0, 0, 0.3)';
            statusDiv.style.color = '#ff6b6b';
            statusDiv.textContent = `Error: ${error}`;
            
            checkBtn.textContent = '';
            const errorIcon = document.createElement('span');
            errorIcon.style.fontSize = '16px';
            errorIcon.textContent = '🔄';
            const errorText = document.createElement('span');
            errorText.textContent = 'Check for Updates';
            checkBtn.appendChild(errorIcon);
            checkBtn.appendChild(errorText);
            checkBtn.disabled = false;
        }
    }
    
    async function installUpdate() {
        const checkBtn = document.getElementById('basitune-check-updates');
        const statusDiv = document.getElementById('basitune-update-status');
        const progressDiv = document.getElementById('basitune-update-progress');
        const progressBar = document.getElementById('basitune-update-progress-bar');
        const progressText = document.getElementById('basitune-update-progress-text');
        
        if (!checkBtn || !statusDiv || !progressDiv || !progressBar || !progressText) return;
        
        // Show downloading status
        checkBtn.disabled = true;
        checkBtn.textContent = '';
        const installIcon = document.createElement('span');
        installIcon.style.fontSize = '16px';
        installIcon.textContent = '⏬';
        const installText = document.createElement('span');
        installText.textContent = 'Installing...';
        checkBtn.appendChild(installIcon);
        checkBtn.appendChild(installText);
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 255, 255, 0.05)';
        statusDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        statusDiv.style.color = 'rgba(255, 255, 255, 0.9)';
        statusDiv.textContent = 'Downloading update...';
        progressDiv.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Preparing...';
        
        // Set up progress listener
        window.__basituneUpdateProgress = (percent) => {
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${percent}% downloaded`;
        };
        
        try {
            await window.__TAURI__.core.invoke('install_update');
            
            // Update installed successfully
            statusDiv.style.background = 'rgba(0, 200, 0, 0.1)';
            statusDiv.style.border = '1px solid rgba(0, 200, 0, 0.3)';
            statusDiv.style.color = '#00ff00';
            
            // Clear and rebuild content safely
            statusDiv.textContent = '';
            const title = document.createElement('div');
            const titleStrong = document.createElement('strong');
            titleStrong.textContent = 'Update Ready!';
            title.appendChild(titleStrong);
            
            const subtitle = document.createElement('div');
            subtitle.style.fontSize = '12px';
            subtitle.style.opacity = '0.8';
            subtitle.style.marginTop = '4px';
            subtitle.textContent = 'Restart Basitune to apply the update';
            
            statusDiv.appendChild(title);
            statusDiv.appendChild(subtitle);
            
            checkBtn.textContent = '';
            const readyIcon = document.createElement('span');
            readyIcon.style.fontSize = '16px';
            readyIcon.textContent = '✓';
            const readyText = document.createElement('span');
            readyText.textContent = 'Update Ready';
            checkBtn.appendChild(readyIcon);
            checkBtn.appendChild(readyText);
            checkBtn.disabled = true;
            progressBar.style.width = '100%';
            progressText.textContent = 'Download complete';
            
            // Show persistent notification
            if (window.showUpdateNotification) {
                window.showUpdateNotification('Update ready! Restart Basitune to apply.', true);
            }
            
        } catch (error) {
            console.error('[Basitune] Failed to install update:', error);
            statusDiv.style.background = 'rgba(200, 0, 0, 0.1)';
            statusDiv.style.border = '1px solid rgba(200, 0, 0, 0.3)';
            statusDiv.style.color = '#ff6b6b';
            statusDiv.textContent = `Installation failed: ${error}`;
            
            checkBtn.textContent = '';
            const failIcon = document.createElement('span');
            failIcon.style.fontSize = '16px';
            failIcon.textContent = '❌';
            const failText = document.createElement('span');
            failText.textContent = 'Install Failed';
            checkBtn.appendChild(failIcon);
            checkBtn.appendChild(failText);
            checkBtn.disabled = false;
            checkBtn.onclick = installUpdate;
            progressDiv.style.display = 'none';
        } finally {
            delete window.__basituneUpdateProgress;
        }
    }
    
    // Settings functions
    async function loadSettings() {
        try {
            const config = await window.__TAURI__.core.invoke('get_config');
            
            const openaiInput = document.getElementById('basitune-openai-key');
            const geniusInput = document.getElementById('basitune-genius-token');
            const closeToTrayCheckbox = document.getElementById('basitune-close-to-tray');
            const enableNotificationsCheckbox = document.getElementById('basitune-enable-notifications');
            
            if (openaiInput && config.openai_api_key) {
                openaiInput.value = config.openai_api_key;
            }
            if (geniusInput && config.genius_access_token) {
                geniusInput.value = config.genius_access_token;
            }
            if (closeToTrayCheckbox && config.close_to_tray !== undefined) {
                closeToTrayCheckbox.checked = config.close_to_tray;
            }
            if (enableNotificationsCheckbox && config.enable_notifications !== undefined) {
                enableNotificationsCheckbox.checked = config.enable_notifications;
            }
        } catch (error) {
            console.error('[Basitune] Failed to load settings:', error);
        }
    }
    
    async function saveSettings() {
        const openaiInput = document.getElementById('basitune-openai-key');
        const geniusInput = document.getElementById('basitune-genius-token');
        const closeToTrayCheckbox = document.getElementById('basitune-close-to-tray');
        const enableNotificationsCheckbox = document.getElementById('basitune-enable-notifications');
        const statusDiv = document.getElementById('basitune-settings-status');
        const saveBtn = document.getElementById('basitune-save-settings');
        
        if (!openaiInput || !geniusInput || !closeToTrayCheckbox || !enableNotificationsCheckbox || !statusDiv || !saveBtn) {
            console.error('[Basitune] Settings elements not found');
            return;
        }
        
        const openaiKey = openaiInput.value.trim();
        const geniusToken = geniusInput.value.trim();
        const closeToTray = closeToTrayCheckbox.checked;
        const enableNotifications = enableNotificationsCheckbox.checked;
        
        // Show saving status
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 255, 255, 0.1)';
        statusDiv.style.color = 'rgba(255, 255, 255, 0.9)';
        statusDiv.textContent = 'Saving...';
        saveBtn.disabled = true;
        
        try {
            await window.__TAURI__.core.invoke('save_config', {
                openaiApiKey: openaiKey,
                geniusAccessToken: geniusToken,
                closeToTray: closeToTray,
                enableNotifications: enableNotifications
            });
            
            // Show success
            statusDiv.style.background = 'rgba(0, 255, 0, 0.2)';
            statusDiv.style.color = '#00ff00';
            statusDiv.textContent = '✓ Settings saved successfully!';
            
            // Hide after 3 seconds
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        } catch (error) {
            console.error('[Basitune] Failed to save settings:', error);
            
            // Show error
            statusDiv.style.background = 'rgba(255, 0, 0, 0.2)';
            statusDiv.style.color = '#ff6666';
            statusDiv.textContent = '✗ Failed to save settings: ' + error;
        } finally {
            saveBtn.disabled = false;
        }
    }
    
    // Load sidebar width from backend
    
    function switchTab(tabName) {
        activeTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.basitune-tab').forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update tab content
        document.querySelectorAll('.basitune-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        if (tabName === 'artist') {
            document.getElementById('basitune-artist-tab').classList.add('active');
        } else if (tabName === 'lyrics') {
            document.getElementById('basitune-lyrics-tab').classList.add('active');
            // Fetch lyrics for current song when switching to lyrics tab
            // This ensures lyrics are loaded even if they weren't fetched on initial load
            if (currentTitle && currentArtist) {
                fetchLyrics(currentTitle, currentArtist);
            } else {
                // If no current song info, try to get it now
                const songInfo = getCurrentSongInfo();
                if (songInfo) {
                    currentTitle = songInfo.title;
                    currentArtist = songInfo.artist;
                    fetchLyrics(currentTitle, currentArtist);
                }
            }
        } else if (tabName === 'visualizer') {
            document.getElementById('basitune-visualizer-tab').classList.add('active');
            initializeVisualizer(); // Initialize visualizer when switching to the tab
        } else if (tabName === 'settings') {
            document.getElementById('basitune-settings-tab').classList.add('active');
            loadSettings(); // Load current settings when switching to settings tab
        } else if (tabName === 'about') {
            document.getElementById('basitune-about-tab').classList.add('active');
            loadAboutInfo(); // Load app metadata
        }
    }
    
    // Initialize visualizer when tab is opened
    async function initializeVisualizer() {
        if (!window.basituneVisualizer) {
            console.error('[Basitune] Visualizer API not available');
            return;
        }

        // Set canvas element
        const canvas = document.getElementById('basitune-visualizer-canvas');
        if (canvas) {
            window.basituneVisualizer.setCanvas(canvas);
        }

        // Setup collapsible sections
        document.querySelectorAll('.basitune-viz-section-header').forEach(header => {
            header.onclick = function() {
                this.classList.toggle('collapsed');
                const content = this.nextElementSibling;
                content.classList.toggle('collapsed');
            };
        });

        // Helper function to update visualizer style-dependent controls
        function updateControlVisibility(style) {
            const speedContainer = document.getElementById('basitune-viz-speed-container');
            const barSpacingContainer = document.getElementById('basitune-viz-bar-spacing-container');
            const particleCountContainer = document.getElementById('basitune-viz-particle-count-container');
            const lineThicknessContainer = document.getElementById('basitune-viz-line-thickness-container');

            // Animation speed: only for spiral, blob, particles
            const animatedVisualizers = ['spiral', 'blob', 'particles'];
            if (speedContainer) {
                speedContainer.style.display = animatedVisualizers.includes(style) ? 'block' : 'none';
            }

            // Bar spacing: only for bars, spectrum, symmetrical
            const barVisualizers = ['bars', 'spectrum', 'symmetrical'];
            if (barSpacingContainer) {
                barSpacingContainer.style.display = barVisualizers.includes(style) ? 'block' : 'none';
            }

            // Particle count: only for particles
            if (particleCountContainer) {
                particleCountContainer.style.display = style === 'particles' ? 'block' : 'none';
            }
            
            // Line thickness: for waveform, circular, radial, spiral, blob, line spectrum, dual waveform
            const lineVisualizers = ['wave', 'circular', 'radial', 'spiral', 'blob', 'line', 'dual'];
            if (lineThicknessContainer) {
                lineThicknessContainer.style.display = lineVisualizers.includes(style) ? 'block' : 'none';
            }
        }

        // Load saved settings
        try {
            const config = await window.__TAURI__.core.invoke('get_config');
            
            // Basic settings
            const styleSelect = document.getElementById('basitune-viz-style');
            const colorInput = document.getElementById('basitune-viz-color');
            const sensitivityInput = document.getElementById('basitune-viz-sensitivity');
            const sensitivityValue = document.getElementById('basitune-viz-sensitivity-value');

            // Advanced settings
            const paletteSelect = document.getElementById('basitune-viz-palette');
            const speedInput = document.getElementById('basitune-viz-speed');
            const speedValue = document.getElementById('basitune-viz-speed-value');
            const glowCheckbox = document.getElementById('basitune-viz-glow');
            const glowIntensityInput = document.getElementById('basitune-viz-glow-intensity');
            const glowValue = document.getElementById('basitune-viz-glow-value');
            const barSpacingInput = document.getElementById('basitune-viz-bar-spacing');
            const spacingValue = document.getElementById('basitune-viz-spacing-value');
            const particleCountInput = document.getElementById('basitune-viz-particle-count');
            const particlesValue = document.getElementById('basitune-viz-particles-value');

            if (config.visualizer_style && styleSelect) {
                styleSelect.value = config.visualizer_style;
                window.basituneVisualizer.updateSettings({ style: config.visualizer_style });
                updateControlVisibility(config.visualizer_style);
            }
            if (config.visualizer_color && colorInput) {
                colorInput.value = config.visualizer_color;
                window.basituneVisualizer.updateSettings({ color: config.visualizer_color });
            }
            if (config.visualizer_sensitivity !== undefined && sensitivityInput && sensitivityValue) {
                sensitivityInput.value = config.visualizer_sensitivity;
                sensitivityValue.textContent = config.visualizer_sensitivity.toFixed(1);
                window.basituneVisualizer.updateSettings({ sensitivity: config.visualizer_sensitivity });
            }
            if (config.color_palette && paletteSelect) {
                paletteSelect.value = config.color_palette;
                window.basituneVisualizer.updateSettings({ colorPalette: config.color_palette });
                // Show/hide single color picker
                const singleColorContainer = document.getElementById('basitune-viz-single-color-container');
                if (singleColorContainer) {
                    singleColorContainer.style.display = config.color_palette === 'single' ? 'block' : 'none';
                }
            }
            if (config.animation_speed !== undefined && speedInput && speedValue) {
                speedInput.value = config.animation_speed;
                speedValue.textContent = config.animation_speed.toFixed(1);
                window.basituneVisualizer.updateSettings({ animationSpeed: config.animation_speed });
            }
            if (config.glow_enabled !== undefined && glowCheckbox) {
                glowCheckbox.checked = config.glow_enabled;
                window.basituneVisualizer.updateSettings({ glowEnabled: config.glow_enabled });
                const glowIntensityContainer = document.getElementById('basitune-viz-glow-intensity-container');
                if (glowIntensityContainer) {
                    glowIntensityContainer.style.display = config.glow_enabled ? 'block' : 'none';
                }
            }
            if (config.glow_intensity !== undefined && glowIntensityInput && glowValue) {
                glowIntensityInput.value = config.glow_intensity;
                glowValue.textContent = Math.round(config.glow_intensity);
                window.basituneVisualizer.updateSettings({ glowIntensity: config.glow_intensity });
            }
            if (config.bar_spacing !== undefined && barSpacingInput && spacingValue) {
                barSpacingInput.value = config.bar_spacing;
                spacingValue.textContent = config.bar_spacing;
                window.basituneVisualizer.updateSettings({ barSpacing: config.bar_spacing });
            }
            if (config.particle_count !== undefined && particleCountInput && particlesValue) {
                particleCountInput.value = config.particle_count;
                particlesValue.textContent = config.particle_count;
                window.basituneVisualizer.updateSettings({ particleCount: config.particle_count });
            }
            if (config.line_thickness !== undefined) {
                const lineThicknessInput = document.getElementById('basitune-viz-line-thickness');
                const thicknessValue = document.getElementById('basitune-viz-thickness-value');
                if (lineThicknessInput && thicknessValue) {
                    lineThicknessInput.value = config.line_thickness;
                    thicknessValue.textContent = config.line_thickness;
                    window.basituneVisualizer.updateSettings({ lineThickness: config.line_thickness });
                }
            }
        } catch (error) {
            console.error('[Basitune] Failed to load visualizer settings:', error);
        }

        // Setup event listeners for visualizer controls
        const toggleBtn = document.getElementById('basitune-viz-toggle');
        const styleSelect = document.getElementById('basitune-viz-style');
        const colorInput = document.getElementById('basitune-viz-color');
        const sensitivityInput = document.getElementById('basitune-viz-sensitivity');
        const sensitivityValue = document.getElementById('basitune-viz-sensitivity-value');
        const paletteSelect = document.getElementById('basitune-viz-palette');
        const speedInput = document.getElementById('basitune-viz-speed');
        const speedValue = document.getElementById('basitune-viz-speed-value');
        const glowCheckbox = document.getElementById('basitune-viz-glow');
        const glowIntensityInput = document.getElementById('basitune-viz-glow-intensity');
        const glowValue = document.getElementById('basitune-viz-glow-value');
        const barSpacingInput = document.getElementById('basitune-viz-bar-spacing');
        const spacingValue = document.getElementById('basitune-viz-spacing-value');
        const particleCountInput = document.getElementById('basitune-viz-particle-count');
        const particlesValue = document.getElementById('basitune-viz-particles-value');
        const lineThicknessInput = document.getElementById('basitune-viz-line-thickness');
        const thicknessValue = document.getElementById('basitune-viz-thickness-value');
        const resetBtn = document.getElementById('basitune-viz-reset');

        if (toggleBtn) {
            toggleBtn.onclick = function() {
                if (window.basituneVisualizer.isActive()) {
                    window.basituneVisualizer.stop();
                    toggleBtn.textContent = 'Start Visualizer';
                    toggleBtn.style.background = 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)';
                } else {
                    window.basituneVisualizer.start();
                    toggleBtn.textContent = 'Stop Visualizer';
                    toggleBtn.style.background = 'linear-gradient(135deg, #666 0%, #444 100%)';
                }
            };
        }

        if (styleSelect) {
            styleSelect.onchange = async function() {
                window.basituneVisualizer.updateSettings({ style: styleSelect.value });
                updateControlVisibility(styleSelect.value);
                await saveVisualizerSettings();
            };
        }

        if (colorInput) {
            colorInput.oninput = async function() {
                window.basituneVisualizer.updateSettings({ color: colorInput.value });
                await saveVisualizerSettings();
            };
        }

        if (sensitivityInput && sensitivityValue) {
            sensitivityInput.oninput = async function() {
                const value = parseFloat(sensitivityInput.value);
                sensitivityValue.textContent = value.toFixed(1);
                window.basituneVisualizer.updateSettings({ sensitivity: value });
                await saveVisualizerSettings();
            };
        }

        if (paletteSelect) {
            paletteSelect.onchange = async function() {
                window.basituneVisualizer.updateSettings({ colorPalette: paletteSelect.value });
                // Show/hide single color picker
                const singleColorContainer = document.getElementById('basitune-viz-single-color-container');
                if (singleColorContainer) {
                    singleColorContainer.style.display = paletteSelect.value === 'single' ? 'block' : 'none';
                }
                await saveVisualizerSettings();
            };
        }

        if (speedInput && speedValue) {
            speedInput.oninput = async function() {
                const value = parseFloat(speedInput.value);
                speedValue.textContent = value.toFixed(1);
                window.basituneVisualizer.updateSettings({ animationSpeed: value });
                await saveVisualizerSettings();
            };
        }

        if (glowCheckbox) {
            glowCheckbox.onchange = async function() {
                window.basituneVisualizer.updateSettings({ glowEnabled: glowCheckbox.checked });
                const glowIntensityContainer = document.getElementById('basitune-viz-glow-intensity-container');
                if (glowIntensityContainer) {
                    glowIntensityContainer.style.display = glowCheckbox.checked ? 'block' : 'none';
                }
                await saveVisualizerSettings();
            };
        }

        if (glowIntensityInput && glowValue) {
            glowIntensityInput.oninput = async function() {
                const value = parseFloat(glowIntensityInput.value);
                glowValue.textContent = Math.round(value);
                window.basituneVisualizer.updateSettings({ glowIntensity: value });
                await saveVisualizerSettings();
            };
        }

        if (barSpacingInput && spacingValue) {
            barSpacingInput.oninput = async function() {
                const value = parseFloat(barSpacingInput.value);
                spacingValue.textContent = value;
                window.basituneVisualizer.updateSettings({ barSpacing: value });
                await saveVisualizerSettings();
            };
        }

        if (particleCountInput && particlesValue) {
            particleCountInput.oninput = async function() {
                const value = parseInt(particleCountInput.value);
                particlesValue.textContent = value;
                window.basituneVisualizer.updateSettings({ particleCount: value });
                await saveVisualizerSettings();
            };
        }

        if (lineThicknessInput && thicknessValue) {
            lineThicknessInput.oninput = async function() {
                const value = parseFloat(lineThicknessInput.value);
                thicknessValue.textContent = value;
                window.basituneVisualizer.updateSettings({ lineThickness: value });
                await saveVisualizerSettings();
            };
        }

        if (resetBtn) {
            resetBtn.onclick = async function() {
                window.basituneVisualizer.resetToDefaults();
                
                // Reset all UI controls
                if (styleSelect) styleSelect.value = 'bars';
                if (colorInput) colorInput.value = '#ff0000';
                if (sensitivityInput) { sensitivityInput.value = 1.0; sensitivityValue.textContent = '1.0'; }
                if (paletteSelect) { paletteSelect.value = 'single'; document.getElementById('basitune-viz-single-color-container').style.display = 'block'; }
                if (speedInput) { speedInput.value = 1.0; speedValue.textContent = '1.0'; }
                if (glowCheckbox) { glowCheckbox.checked = false; document.getElementById('basitune-viz-glow-intensity-container').style.display = 'none'; }
                if (glowIntensityInput) { glowIntensityInput.value = 10; glowValue.textContent = '10'; }
                if (barSpacingInput) { barSpacingInput.value = 1.0; spacingValue.textContent = '1'; }
                if (particleCountInput) { particleCountInput.value = 80; particlesValue.textContent = '80'; }
                if (lineThicknessInput) { lineThicknessInput.value = 2.0; thicknessValue.textContent = '2'; }
                
                updateControlVisibility('bars');
                await saveVisualizerSettings();
            };
        }

        // Full window button
        const fullWindowBtn = document.getElementById('basitune-viz-fullwindow');
        if (fullWindowBtn) {
            fullWindowBtn.onclick = toggleFullWindow;
        }

        // Overlay close button
        const overlayCloseBtn = document.getElementById('basitune-overlay-close');
        if (overlayCloseBtn) {
            overlayCloseBtn.onclick = toggleFullWindow;
        }

        // ESC key to exit full window mode
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('basitune-visualizer-overlay');
                if (overlay && overlay.classList.contains('active')) {
                    toggleFullWindow();
                }
            }
        });

        console.log('[Basitune] Visualizer initialized');
    }
    
    // Save visualizer settings to backend
    async function saveVisualizerSettings() {
        try {
            const styleSelect = document.getElementById('basitune-viz-style');
            const colorInput = document.getElementById('basitune-viz-color');
            const sensitivityInput = document.getElementById('basitune-viz-sensitivity');
            const paletteSelect = document.getElementById('basitune-viz-palette');
            const speedInput = document.getElementById('basitune-viz-speed');
            const glowCheckbox = document.getElementById('basitune-viz-glow');
            const glowIntensityInput = document.getElementById('basitune-viz-glow-intensity');
            const barSpacingInput = document.getElementById('basitune-viz-bar-spacing');
            const particleCountInput = document.getElementById('basitune-viz-particle-count');
            const lineThicknessInput = document.getElementById('basitune-viz-line-thickness');

            await window.__TAURI__.core.invoke('save_visualizer_settings', {
                settings: {
                    style: styleSelect?.value || 'bars',
                    color: colorInput?.value || '#ff0000',
                    sensitivity: parseFloat(sensitivityInput?.value || '1.0'),
                    color_palette: paletteSelect?.value || 'single',
                    animation_speed: parseFloat(speedInput?.value || '1.0'),
                    glow_enabled: glowCheckbox?.checked || false,
                    glow_intensity: parseFloat(glowIntensityInput?.value || '10.0'),
                    bar_spacing: parseFloat(barSpacingInput?.value || '1.0'),
                    particle_count: parseInt(particleCountInput?.value || '80'),
                    line_thickness: parseFloat(lineThicknessInput?.value || '2.0')
                }
            });
        } catch (error) {
            console.error('[Basitune] Failed to save visualizer settings:', error);
        }
    }
    
    // Toggle full-window visualizer mode
    function toggleFullWindow() {
        const overlay = document.getElementById('basitune-visualizer-overlay');
        const sidebarCanvas = document.getElementById('basitune-visualizer-canvas');
        const overlayContainer = document.getElementById('basitune-overlay-canvas-container');
        const sidebarContainer = document.getElementById('basitune-visualizer-content');
        const fullWindowBtn = document.getElementById('basitune-viz-fullwindow');
        
        if (!overlay || !sidebarCanvas || !overlayContainer || !sidebarContainer) {
            console.error('[Basitune] Required elements not found');
            return;
        }
        
        const isActive = overlay.classList.contains('active');
        
        if (isActive) {
            // Exit full window mode - move canvas back to sidebar
            overlay.classList.remove('active');
            sidebarContainer.insertBefore(sidebarCanvas, sidebarContainer.firstChild);
            if (fullWindowBtn) fullWindowBtn.textContent = 'Full Window';
            
            // Restore canvas to original sidebar dimensions (CSS handles display scaling)
            sidebarCanvas.width = 720;
            sidebarCanvas.height = 400;
        } else {
            // Enter full window mode - move canvas to overlay
            overlay.classList.add('active');
            overlayContainer.appendChild(sidebarCanvas);
            if (fullWindowBtn) fullWindowBtn.textContent = 'Exit Full Window';
            
            // Resize canvas to full window dimensions after DOM update
            setTimeout(() => {
                if (window.basituneVisualizer?.resizeCanvas) {
                    window.basituneVisualizer.resizeCanvas();
                }
            }, 50);
        }
    }
    
    async function toggleSidebar() {
        sidebarVisible = !sidebarVisible;
        const sidebar = document.getElementById('basitune-sidebar');
        const reopenBtn = document.getElementById('basitune-reopen');
        
        if (sidebarVisible) {
            sidebar.classList.remove('hidden');
            reopenBtn.classList.remove('visible');
            document.body.classList.remove('sidebar-hidden');
            sidebar.removeAttribute('data-hidden');
            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
        } else {
            sidebar.classList.add('hidden');
            reopenBtn.classList.add('visible');
            document.body.classList.add('sidebar-hidden');
            sidebar.setAttribute('data-hidden', 'true');
            document.documentElement.style.setProperty('--sidebar-width', '0px');
        }
        
        // Save preference
        try {
            await window.__TAURI__.core.invoke('set_sidebar_visible', { visible: sidebarVisible });
        } catch (error) {
            console.error('[Basitune] Failed to save sidebar state:', error);
        }
    }
    
    // Restore sidebar visibility state from saved preference
    
    // Get current song info from YouTube Music
    function getCurrentSongInfo() {
        const artistElement = document.querySelector('.byline.ytmusic-player-bar a');
        const titleElement = document.querySelector('.title.ytmusic-player-bar');
        
        if (artistElement && titleElement) {
            return {
                artist: artistElement.textContent.trim(),
                title: titleElement.textContent.trim()
            };
        }
        
        return null;
    }
    
    // Helper function to add "read more" functionality
    function makeExpandable(container, content, maxLength = 300) {
        if (content.length <= maxLength) {
            return content;
        }
        
        const contentId = 'content-' + Math.random().toString(36).substr(2, 9);
        const truncated = content.substring(0, maxLength).trim();
        
        // Find a good breaking point (end of sentence or word)
        let breakPoint = truncated.lastIndexOf('. ');
        if (breakPoint === -1 || breakPoint < maxLength * 0.7) {
            breakPoint = truncated.lastIndexOf(' ');
        }
        
        const visibleText = truncated.substring(0, breakPoint) + '...';
        
        setTimeout(() => {
            const contentEl = document.getElementById(contentId);
            const readMoreLink = contentEl?.nextElementSibling;
            
            if (contentEl && readMoreLink) {
                readMoreLink.addEventListener('click', () => {
                    contentEl.classList.toggle('basitune-expanded');
                    if (contentEl.classList.contains('basitune-expanded')) {
                        contentEl.textContent = content;
                        readMoreLink.textContent = 'Read less';
                    } else {
                        contentEl.textContent = visibleText;
                        readMoreLink.textContent = 'Read more';
                    }
                });
            }
        }, 10);
        
        return `<span id="${contentId}" class="basitune-truncated">${visibleText}</span><span class="basitune-read-more">Read more</span>`;
    }
    
    // Fetch artist info from AI via Tauri
    async function fetchArtistInfo(artist) {
        try {
            if (!window.__TAURI__?.core?.invoke) {
                console.error('[Basitune] Tauri IPC not available; cannot fetch artist info');
                return;
            }

            const bioDiv = document.getElementById('basitune-artist-bio');
            
            setHTML(bioDiv, `
                <div class="basitune-loading">
                    <div class="basitune-spinner"></div>
                    <div class="basitune-loading-text">Loading artist information...</div>
                </div>
            `);
            
            console.log('[Basitune] Fetching AI info for:', artist);
            
            // Call Tauri command - now returns plain text
            const bio = await window.__TAURI__.core.invoke('get_artist_info', { artist });
            
            console.log('[Basitune] Received AI bio');
            
            // Display artist bio with read more functionality
            const expandableBio = makeExpandable(bioDiv, bio, 400);
            // Use text nodes for content to avoid Trusted Types issues
            setHTML(bioDiv, `<h4></h4><p></p>`);
            const h4 = bioDiv.querySelector('h4');
            const p = bioDiv.querySelector('p');
            setText(h4, artist);
            // expandableBio may contain HTML for read-more; use setHTML only for that part
            setHTML(p, expandableBio);
            
            console.log('[Basitune] Artist bio rendered; length:', p?.textContent?.length || 0);
            
            console.log('[Basitune] Loaded AI info for:', artist);
        } catch (error) {
            console.error('[Basitune] Error fetching artist info:', error);
            const bioDiv = document.getElementById('basitune-artist-bio');
            setHTML(bioDiv, `<p class="basitune-placeholder">Could not load artist information<br><small>${error}</small></p>`);
        }
    }
    
    // Fetch song context from AI via Tauri
    async function fetchSongContext(title, artist) {
        try {
            if (!window.__TAURI__?.core?.invoke) {
                console.error('[Basitune] Tauri IPC not available; cannot fetch song context');
                return;
            }

            const contextDiv = document.getElementById('basitune-song-context');
            
            setHTML(contextDiv, `
                <h5></h5>
                <div class="basitune-loading">
                    <div class="basitune-spinner"></div>
                    <div class="basitune-loading-text">Loading song context...</div>
                </div>
            `);
            const h5 = contextDiv.querySelector('h5');
            setText(h5, `About "${title}"`);
            
            console.log('[Basitune] Fetching AI song context for:', title, '-', artist);
            
            // Call Tauri command
            const context = await window.__TAURI__.core.invoke('get_song_context', { title, artist });
            
            // Display song context with read more functionality
            const expandableContext = makeExpandable(contextDiv, context, 250);
            setHTML(contextDiv, `<h5></h5><p></p>`);
            const ctxH5 = contextDiv.querySelector('h5');
            const ctxP = contextDiv.querySelector('p');
            setText(ctxH5, `About "${title}"`);
            setHTML(ctxP, expandableContext);
            
            console.log('[Basitune] Loaded AI song context');
        } catch (error) {
            console.error('[Basitune] Error fetching song context:', error);
            const contextDiv = document.getElementById('basitune-song-context');
            setHTML(contextDiv, `<p class="basitune-placeholder">Could not load song context<br><small>${error}</small></p>`);
        }
    }
    
    // Fetch lyrics from Genius via Tauri
    async function fetchLyrics(title, artist) {
        try {
            if (!window.__TAURI__?.core?.invoke) {
                console.error('[Basitune] Tauri IPC not available; cannot fetch lyrics');
                return;
            }

            const lyricsDiv = document.getElementById('basitune-lyrics-content');
            
            setHTML(lyricsDiv, `
                <div class="basitune-loading">
                    <div class="basitune-spinner"></div>
                    <div class="basitune-loading-text">Loading lyrics...</div>
                </div>
            `);
            
            console.log('[Basitune] Fetching lyrics for:', title, '-', artist);
            
            // Call Tauri command - scrapes from Genius
            const lyrics = await window.__TAURI__.core.invoke('get_lyrics', { title, artist });
            
            console.log('[Basitune] Received lyrics');
            
            // Display lyrics (only show Go Back button if we have search results to go back to)
            if (lastSearchResults) {
                setHTML(lyricsDiv, `
                    <div style="margin-bottom: 12px;">
                        <button id="basitune-go-back" style="
                            padding: 6px 12px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 6px;
                            color: rgba(255, 255, 255, 0.9);
                            cursor: pointer;
                            font-size: 13px;
                            transition: background 0.2s;
                        " onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'"
                           onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                            ← Go Back
                        </button>
                    </div>
                    <div id="basitune-lyrics-text" style="white-space: pre-wrap;"></div>
                `);
                const lyricsText = document.getElementById('basitune-lyrics-text');
                setText(lyricsText, lyrics);
                console.log('[Basitune] Lyrics rendered (with back button); length:', lyricsText?.textContent?.length || 0);
                
                // Add click handler for go back button
                document.getElementById('basitune-go-back').addEventListener('click', () => {
                    showLyricsSearchResults(
                        lastSearchResults.results,
                        lastSearchResults.title,
                        lastSearchResults.artist
                    );
                });
            } else {
                // No search results to go back to - just show lyrics
                setHTML(lyricsDiv, `<div id="basitune-lyrics-text" style="white-space: pre-wrap;"></div>`);
                const lyricsText = document.getElementById('basitune-lyrics-text');
                setText(lyricsText, lyrics);
                console.log('[Basitune] Lyrics rendered; length:', lyricsText?.textContent?.length || 0);
            }
            
            console.log('[Basitune] Loaded lyrics for:', title);
        } catch (error) {
            console.error('[Basitune] Error fetching lyrics:', error);
            
            // Try to get search results
            try {
                const results = await window.__TAURI__.core.invoke('search_lyrics', { title, artist });
                
                if (results && results.length > 0) {
                    showLyricsSearchResults(results, title, artist);
                } else {
                    showLyricsError(error, title, artist);
                }
            } catch (searchError) {
                showLyricsError(error, title, artist);
            }
        }
    }
    
    function showLyricsSearchResults(results, originalTitle, originalArtist) {
        const lyricsDiv = document.getElementById('basitune-lyrics-content');
        
        // Save these results for "Go Back" functionality
        lastSearchResults = {
            results: results,
            title: originalTitle,
            artist: originalArtist
        };
        
        let html = `
            <div style="padding: 16px;">
                <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 16px;">
                    Couldn't find exact match for "<strong>${originalTitle}</strong>" by <strong>${originalArtist}</strong>
                </p>
                <p style="color: rgba(255, 255, 255, 0.6); font-size: 13px; margin-bottom: 12px;">
                    Try one of these matches:
                </p>
                <div style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        results.forEach(result => {
            html += `
                <div data-title="${result.title.replace(/"/g, '&quot;')}" 
                     data-artist="${result.primary_artist.name.replace(/"/g, '&quot;')}"
                     class="basitune-suggestion-item"
                     style="
                       display: block;
                       padding: 12px;
                       background: rgba(255, 255, 255, 0.05);
                       border-radius: 8px;
                       color: rgba(255, 255, 255, 0.85);
                       transition: background 0.2s;
                       border: 1px solid rgba(255, 255, 255, 0.1);
                       cursor: pointer;
                   "
                   onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'"
                   onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
                    <div style="font-weight: 500; margin-bottom: 4px;">${result.title}</div>
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">by ${result.primary_artist.name}</div>
                </div>
            `;
        });
        
        html += `
                </div>
                <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <p style="color: rgba(255, 255, 255, 0.6); font-size: 13px; margin-bottom: 8px;">
                        Or search manually:
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" 
                               id="basitune-lyrics-search" 
                               placeholder="Song title"
                               value="${originalTitle}"
                               style="
                                   padding: 8px 12px;
                                   background: rgba(255, 255, 255, 0.05);
                                   border: 1px solid rgba(255, 255, 255, 0.2);
                                   border-radius: 6px;
                                   color: rgba(255, 255, 255, 0.9);
                                   font-size: 13px;
                               ">
                        <input type="text" 
                               id="basitune-lyrics-artist" 
                               placeholder="Artist"
                               value="${originalArtist}"
                               style="
                                   padding: 8px 12px;
                                   background: rgba(255, 255, 255, 0.05);
                                   border: 1px solid rgba(255, 255, 255, 0.2);
                                   border-radius: 6px;
                                   color: rgba(255, 255, 255, 0.9);
                                   font-size: 13px;
                               ">
                        <button id="basitune-lyrics-search-btn"
                                style="
                                    padding: 8px 16px;
                                    background: #ff0000;
                                    border: none;
                                    border-radius: 6px;
                                    color: white;
                                    font-size: 13px;
                                    font-weight: 500;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                    width: 100%;
                                "
                                onmouseover="this.style.background='#cc0000'"
                                onmouseout="this.style.background='#ff0000'">
                            Search
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        setHTML(lyricsDiv, html);
        
        // Add click handlers for suggestion items
        document.querySelectorAll('.basitune-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const title = item.getAttribute('data-title');
                const artist = item.getAttribute('data-artist');
                fetchLyrics(title, artist);
            });
        });
        
        // Add event listener for search button
        document.getElementById('basitune-lyrics-search-btn').addEventListener('click', () => {
            const searchTitle = document.getElementById('basitune-lyrics-search').value;
            const searchArtist = document.getElementById('basitune-lyrics-artist').value;
            if (searchTitle && searchArtist) {
                fetchLyrics(searchTitle, searchArtist);
            }
        });
        
        // Add enter key support
        const searchInputs = [
            document.getElementById('basitune-lyrics-search'),
            document.getElementById('basitune-lyrics-artist')
        ];
        searchInputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('basitune-lyrics-search-btn').click();
                }
            });
        });
    }
    
    function showLyricsSearch() {
        const lyricsDiv = document.getElementById('basitune-lyrics-content');
        const songInfo = getCurrentSongInfo();
        const defaultTitle = songInfo?.title || '';
        const defaultArtist = songInfo?.artist || '';
        
        setHTML(lyricsDiv, `
            <div style="padding: 16px;">
                <h3 style="margin: 0 0 16px 0; color: rgba(255, 255, 255, 0.9);">Search for Lyrics</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <input type="text" 
                           id="basitune-lyrics-search" 
                           placeholder="Song title"
                           value="${defaultTitle}"
                           style="
                               padding: 8px 12px;
                               background: rgba(255, 255, 255, 0.05);
                               border: 1px solid rgba(255, 255, 255, 0.2);
                               border-radius: 6px;
                               color: rgba(255, 255, 255, 0.9);
                               font-size: 13px;
                           ">
                    <input type="text" 
                           id="basitune-lyrics-artist" 
                           placeholder="Artist"
                           value="${defaultArtist}"
                           style="
                               padding: 8px 12px;
                               background: rgba(255, 255, 255, 0.05);
                               border: 1px solid rgba(255, 255, 255, 0.2);
                               border-radius: 6px;
                               color: rgba(255, 255, 255, 0.9);
                               font-size: 13px;
                           ">
                    <button id="basitune-lyrics-search-btn"
                            style="
                                padding: 10px;
                                background: #ff0000;
                                border: none;
                                border-radius: 6px;
                                color: white;
                                font-size: 13px;
                                font-weight: 500;
                                cursor: pointer;
                                transition: background 0.2s;
                                width: 100%;
                            "
                            onmouseover="this.style.background='#cc0000'"
                           onmouseout="this.style.background='#ff0000'">
                        Search
                    </button>
                </div>
            </div>
        `);
        
        // Add event listener for search button
        document.getElementById('basitune-lyrics-search-btn').addEventListener('click', () => {
            const searchTitle = document.getElementById('basitune-lyrics-search').value;
            const searchArtist = document.getElementById('basitune-lyrics-artist').value;
            if (searchTitle && searchArtist) {
                fetchLyrics(searchTitle, searchArtist);
            }
        });
        
        // Add enter key support
        const searchInputs = [
            document.getElementById('basitune-lyrics-search'),
            document.getElementById('basitune-lyrics-artist')
        ];
        searchInputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('basitune-lyrics-search-btn').click();
                }
            });
        });
    }
    
    function showLyricsError(error, title, artist) {
        const lyricsDiv = document.getElementById('basitune-lyrics-content');
        
        // Parse the error to provide helpful context
        let errorTitle = 'Lyrics Not Found';
        let errorExplanation = '';
        let errorIcon = '🔍';
        
        const errorStr = String(error);
        
        if (errorStr.includes('Genius API token not configured')) {
            errorTitle = 'API Not Configured';
            errorExplanation = 'The Genius API token is not set. New lyrics cannot be fetched, but cached lyrics will still work.';
            errorIcon = '🔑';
        } else if (errorStr.includes('No results found')) {
            errorTitle = 'No Results Found';
            errorExplanation = `Genius couldn't find lyrics for "${title}" by ${artist}. This could be because:<br>
                • The song is too new or obscure<br>
                • The artist or title name doesn't match Genius's database<br>
                • The song is instrumental or has no published lyrics`;
            errorIcon = '❌';
        } else if (errorStr.includes('Could not extract lyrics')) {
            errorTitle = 'Extraction Failed';
            errorExplanation = 'Found the song on Genius, but couldn\'t extract the lyrics from the page. The page format may have changed.';
            errorIcon = '⚠️';
        } else if (errorStr.includes('timeout') || errorStr.includes('network')) {
            errorTitle = 'Connection Error';
            errorExplanation = 'Could not connect to Genius. Check your internet connection and try again.';
            errorIcon = '📡';
        } else if (errorStr.includes('rate limit')) {
            errorTitle = 'Rate Limited';
            errorExplanation = 'Too many requests to Genius API. Please wait a moment before trying again.';
            errorIcon = '⏳';
        } else {
            errorTitle = 'Error Loading Lyrics';
            errorExplanation = `An unexpected error occurred: ${errorStr}`;
            errorIcon = '⚠️';
        }
        
        setHTML(lyricsDiv, `
            <div class="basitune-lyrics-error">
                <div class="basitune-error-icon">${errorIcon}</div>
                <h3 class="basitune-error-title">${errorTitle}</h3>
                <p class="basitune-error-explanation">${errorExplanation}</p>
                <div class="basitune-manual-search">
                    <p class="basitune-manual-search-label">Try a manual search:</p>
                    <div class="basitune-search-form">
                        <label for="basitune-lyrics-search" class="basitune-field-label">Song Title</label>
                        <input type="text" 
                               id="basitune-lyrics-search" 
                               class="basitune-search-input"
                               placeholder="Enter song title"
                               value="${title}"
                               aria-label="Song title">
                        <label for="basitune-lyrics-artist" class="basitune-field-label">Artist</label>
                        <input type="text" 
                               id="basitune-lyrics-artist" 
                               class="basitune-search-input"
                               placeholder="Enter artist name"
                               value="${artist}"
                               aria-label="Artist name">
                        <button id="basitune-lyrics-search-btn"
                                class="basitune-search-btn"
                                aria-label="Search for lyrics on Genius">
                            Search Genius
                        </button>
                    </div>
                </div>
            </div>
        `);
        
        // Add event listeners
        document.getElementById('basitune-lyrics-search-btn').addEventListener('click', () => {
            const searchTitle = document.getElementById('basitune-lyrics-search').value;
            const searchArtist = document.getElementById('basitune-lyrics-artist').value;
            if (searchTitle && searchArtist) {
                fetchLyrics(searchTitle, searchArtist);
            }
        });
        
        const searchInputs = [
            document.getElementById('basitune-lyrics-search'),
            document.getElementById('basitune-lyrics-artist')
        ];
        searchInputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('basitune-lyrics-search-btn').click();
                }
            });
        });
    }
    
    // Monitor song changes
    function monitorSongChanges() {
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (!playerBar) {
            console.warn('[Basitune] ytmusic-player-bar not found yet, retrying...');
            setTimeout(monitorSongChanges, 500);
            return;
        }
        console.log('[Basitune] ytmusic-player-bar found, attaching mutation observer');
        
        const observer = new MutationObserver(() => {
            const songInfo = getCurrentSongInfo();
            if (songInfo) {
                // Update artist info if artist changed
                if (songInfo.artist !== currentArtist) {
                    currentArtist = songInfo.artist;
                    fetchArtistInfo(currentArtist);
                }
                
                // Update song context and lyrics if title changed
                if (songInfo.title !== currentTitle) {
                    currentTitle = songInfo.title;
                    fetchSongContext(currentTitle, currentArtist);
                    fetchLyrics(currentTitle, currentArtist);
                    
                    // Update Discord Rich Presence
                    updateDiscordPresence(currentTitle, currentArtist);
                }
            } else {
                console.debug('[Basitune] Song info not available yet');
            }
        });
        
        observer.observe(playerBar, {
            childList: true,
            subtree: true
        });
        
        // Check immediately in case song is already playing
        const songInfo = getCurrentSongInfo();
        if (songInfo) {
            currentArtist = songInfo.artist;
            currentTitle = songInfo.title;
            fetchArtistInfo(currentArtist);
            fetchSongContext(currentTitle, currentArtist);
            fetchLyrics(currentTitle, currentArtist);
            updateDiscordPresence(currentTitle, currentArtist);
        } else {
            console.debug('[Basitune] No initial song info found on startup');
        }
        
        console.log('[Basitune] Song monitor started');
    }
    
    // Update Discord Rich Presence
    async function updateDiscordPresence(title, artist) {
        try {
            await window.__TAURI__.core.invoke('update_discord_presence', {
                title: title,
                artist: artist
            });
        } catch (error) {
            // Silently fail - Discord might not be running
            console.debug('[Basitune] Discord update skipped:', error);
        }
    }
    
    // Initialize
    async function init() {
        console.log('[Basitune] Initializing sidebar v1.3.0');
        console.log('[Basitune] URL:', window.location.href);
        console.log('[Basitune] Ready state:', document.readyState);
        
        if (document.readyState === 'loading') {
            console.log('[Basitune] Document still loading, waiting for DOMContentLoaded');
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        // Load saved state before creating sidebar
        try {
            const savedVisible = await window.__TAURI__.core.invoke('get_sidebar_visible');
            const savedWidth = await window.__TAURI__.core.invoke('get_sidebar_width');
            const savedFontSize = await window.__TAURI__.core.invoke('get_sidebar_font_size');
            
            if (savedWidth && savedWidth >= 280 && savedWidth <= 800) {
                sidebarWidth = savedWidth;
                console.log('[Basitune] Pre-loaded sidebar width:', savedWidth);
            }
            if (savedFontSize && savedFontSize >= 10 && savedFontSize <= 24) {
                sidebarFontSize = savedFontSize;
                console.log('[Basitune] Pre-loaded sidebar font size:', savedFontSize);
            }
            sidebarVisible = savedVisible;
            console.log('[Basitune] Pre-loaded sidebar visibility:', savedVisible);
        } catch (error) {
            console.error('[Basitune] Failed to pre-load sidebar state:', error);
        }
        
        // Wait for YouTube Music to load
        console.log('[Basitune] Starting to check for ytmusic-app element');
        let attempts = 0;
        const checkYTMusic = setInterval(() => {
            attempts++;
            if (attempts % 5 === 0) {
                console.log('[Basitune] Still checking for ytmusic-app... (attempt', attempts, ')');
            }
            const ytmusicApp = document.querySelector('ytmusic-app');
            if (ytmusicApp) {
                clearInterval(checkYTMusic);
                console.log('[Basitune] ✓ ytmusic-app found after', attempts, 'attempts');
                createSidebar();
                
                // Wait a tick for DOM to settle before applying state
                setTimeout(() => {
                    const sidebarElement = document.getElementById('basitune-sidebar');
                    const reopenBtn = document.getElementById('basitune-reopen');
                    
                    if (sidebarElement && reopenBtn) {
                        console.log('[Basitune] ✓ Sidebar created successfully');
                        console.log('[Basitune] Sidebar dimensions:', sidebarElement.offsetWidth, 'x', sidebarElement.offsetHeight);
                        console.log('[Basitune] Applying pre-loaded state - visible:', sidebarVisible, 'width:', sidebarWidth, 'font size:', sidebarFontSize);
                        
                        // Apply the pre-loaded visibility state
                        if (sidebarVisible) {
                            sidebarElement.classList.remove('hidden');
                            reopenBtn.classList.remove('visible');
                            document.body.classList.remove('sidebar-hidden');
                            sidebarElement.removeAttribute('data-hidden');
                            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
                        } else {
                            sidebarElement.classList.add('hidden');
                            reopenBtn.classList.add('visible');
                            document.body.classList.add('sidebar-hidden');
                            sidebarElement.setAttribute('data-hidden', 'true');
                            document.documentElement.style.setProperty('--sidebar-width', '0px');
                        }
                        
                        // Apply the pre-loaded font size
                        applyFontSize();
                    } else {
                        console.error('[Basitune] ✗ Sidebar element not found after creation!');
                    }
                }, 100);
                
                monitorSongChanges();
            } else if (attempts > 40) { // 20 seconds
                clearInterval(checkYTMusic);
                console.error('[Basitune] ✗ ytmusic-app not found after 20 seconds; creating sidebar anyway');
                console.error('[Basitune] Available body elements:', document.body ? document.body.children.length : 'no body');
                if (document.body && document.body.children.length > 0) {
                    console.error('[Basitune] First element:', document.body.children[0].tagName);
                }

                // Fallback: create sidebar even if ytmusic-app was not detected
                createSidebar();
                setTimeout(() => {
                    const sidebarElement = document.getElementById('basitune-sidebar');
                    const reopenBtn = document.getElementById('basitune-reopen');
                    
                    if (sidebarElement && reopenBtn) {
                        console.log('[Basitune] ✓ Sidebar created via fallback');
                        if (sidebarVisible) {
                            sidebarElement.classList.remove('hidden');
                            reopenBtn.classList.remove('visible');
                            document.body.classList.remove('sidebar-hidden');
                        } else {
                            sidebarElement.classList.add('hidden');
                            reopenBtn.classList.add('visible');
                            document.body.classList.add('sidebar-hidden');
                        }
                        applyFontSize();
                    } else {
                        console.error('[Basitune] ✗ Sidebar element not found after fallback creation');
                    }
                }, 100);
            }
        }, 500);
    }
    
    init();
    console.log('[Basitune] Sidebar script loaded');
})();
