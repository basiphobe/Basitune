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
    let activeTab = 'artist'; // 'artist', 'lyrics', 'settings', or 'about'
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
    
    // Settings functions
    async function loadSettings() {
        try {
            const config = await window.__TAURI__.core.invoke('get_config');
            
            const openaiInput = document.getElementById('basitune-openai-key');
            const geniusInput = document.getElementById('basitune-genius-token');
            const closeToTrayCheckbox = document.getElementById('basitune-close-to-tray');
            
            if (openaiInput && config.openai_api_key) {
                openaiInput.value = config.openai_api_key;
            }
            if (geniusInput && config.genius_access_token) {
                geniusInput.value = config.genius_access_token;
            }
            if (closeToTrayCheckbox && config.close_to_tray !== undefined) {
                closeToTrayCheckbox.checked = config.close_to_tray;
            }
        } catch (error) {
            console.error('[Basitune] Failed to load settings:', error);
        }
    }
    
    async function saveSettings() {
        const openaiInput = document.getElementById('basitune-openai-key');
        const geniusInput = document.getElementById('basitune-genius-token');
        const closeToTrayCheckbox = document.getElementById('basitune-close-to-tray');
        const statusDiv = document.getElementById('basitune-settings-status');
        const saveBtn = document.getElementById('basitune-save-settings');
        
        if (!openaiInput || !geniusInput || !closeToTrayCheckbox || !statusDiv || !saveBtn) {
            console.error('[Basitune] Settings elements not found');
            return;
        }
        
        const openaiKey = openaiInput.value.trim();
        const geniusToken = geniusInput.value.trim();
        const closeToTray = closeToTrayCheckbox.checked;
        
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
                closeToTray: closeToTray
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
        } else if (tabName === 'settings') {
            document.getElementById('basitune-settings-tab').classList.add('active');
            loadSettings(); // Load current settings when switching to settings tab
        } else if (tabName === 'about') {
            document.getElementById('basitune-about-tab').classList.add('active');
            loadAboutInfo(); // Load app metadata
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
            
            console.log('[Basitune] Received AI song context');
            
            // Display song context with read more functionality
            const expandableContext = makeExpandable(contextDiv, context, 250);
            setHTML(contextDiv, `<h5></h5><p></p>`);
            const ctxH5 = contextDiv.querySelector('h5');
            const ctxP = contextDiv.querySelector('p');
            setText(ctxH5, `About "${title}"`);
            setHTML(ctxP, expandableContext);
            console.log('[Basitune] Song context rendered; length:', ctxP?.textContent?.length || 0);
            
            console.log('[Basitune] Loaded AI song context');
        } catch (error) {
            console.error('[Basitune] Error fetching song context:', error);
            const contextDiv = document.getElementById('basitune-song-context');
            setHTML(contextDiv, '');
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
