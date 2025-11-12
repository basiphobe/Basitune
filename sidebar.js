// Artist Info Sidebar for YouTube Music
// Monitors current song and displays artist bio from Wikipedia

(function() {
    'use strict';
    
    let currentArtist = '';
    let currentTitle = '';
    let sidebarVisible = true;
    let activeTab = 'artist'; // 'artist' or 'lyrics'
    
    // Create sidebar HTML
    function createSidebar() {
        const sidebar = document.createElement('div');
        sidebar.id = 'basitune-sidebar';
        sidebar.innerHTML = `
            <div id="basitune-sidebar-header">
                <div id="basitune-tabs">
                    <button class="basitune-tab active" data-tab="artist">Artist</button>
                    <button class="basitune-tab" data-tab="lyrics">Lyrics</button>
                </div>
                <button id="basitune-toggle">×</button>
            </div>
            <div id="basitune-sidebar-content">
                <div id="basitune-artist-tab" class="basitune-tab-content active">
                    <div id="basitune-artist-image"></div>
                    <div id="basitune-artist-bio">
                        <p class="basitune-placeholder">Play a song to see artist information</p>
                    </div>
                </div>
                <div id="basitune-lyrics-tab" class="basitune-tab-content">
                    <div id="basitune-lyrics-content">
                        <p class="basitune-placeholder">Play a song to see lyrics</p>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #basitune-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                width: 350px;
                height: 100vh;
                background: #030303;
                border-left: 1px solid #333;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                transition: transform 0.3s ease;
                font-family: 'Roboto', sans-serif;
            }
            
            #basitune-sidebar.hidden {
                transform: translateX(100%);
            }
            
            #basitune-sidebar-header {
                padding: 16px;
                background: #0a0a0a;
                border-bottom: 1px solid #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            #basitune-tabs {
                display: flex;
                gap: 8px;
            }
            
            .basitune-tab {
                background: none;
                border: none;
                color: #aaa;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                padding: 8px 12px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .basitune-tab:hover {
                background: #1a1a1a;
                color: #fff;
            }
            
            .basitune-tab.active {
                background: #333;
                color: #fff;
            }
            
            #basitune-toggle {
                background: none;
                border: none;
                color: #aaa;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                line-height: 20px;
            }
            
            #basitune-toggle:hover {
                color: #fff;
            }
            
            #basitune-sidebar-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            
            .basitune-tab-content {
                display: none;
            }
            
            .basitune-tab-content.active {
                display: block;
            }
            
            #basitune-artist-image {
                margin-bottom: 16px;
            }
            
            #basitune-artist-image img {
                width: 100%;
                border-radius: 8px;
            }
            
            #basitune-artist-bio {
                color: #e8e8e8;
                font-size: 14px;
                line-height: 1.6;
            }
            
            #basitune-artist-bio h4 {
                color: #fff;
                margin: 0 0 8px 0;
                font-size: 16px;
            }
            
            #basitune-lyrics-content {
                color: #e8e8e8;
                font-size: 14px;
                line-height: 1.8;
                white-space: pre-wrap;
                font-family: 'Roboto', sans-serif;
            }
            
            .basitune-placeholder {
                color: #666;
                font-style: italic;
            }
            
            .basitune-loading {
                color: #666;
            }
            
            /* Adjust YouTube Music main content */
            ytmusic-app {
                margin-right: 350px;
                transition: margin-right 0.3s ease;
            }
            
            ytmusic-app.sidebar-hidden {
                margin-right: 0;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(sidebar);
        
        // Toggle button functionality
        document.getElementById('basitune-toggle').addEventListener('click', toggleSidebar);
        
        // Tab switching functionality
        document.querySelectorAll('.basitune-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });
        
        console.log('[Basitune] Sidebar created');
    }
    
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
        }
    }
    
    function toggleSidebar() {
        sidebarVisible = !sidebarVisible;
        const sidebar = document.getElementById('basitune-sidebar');
        const ytmusicApp = document.querySelector('ytmusic-app');
        
        if (sidebarVisible) {
            sidebar.classList.remove('hidden');
            ytmusicApp.classList.remove('sidebar-hidden');
        } else {
            sidebar.classList.add('hidden');
            ytmusicApp.classList.add('sidebar-hidden');
        }
    }
    
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
    
    // Fetch artist info from Wikipedia via Tauri
    async function fetchArtistInfo(artist) {
        try {
            const bioDiv = document.getElementById('basitune-artist-bio');
            const imageDiv = document.getElementById('basitune-artist-image');
            
            bioDiv.innerHTML = '<p class="basitune-loading">Loading artist information...</p>';
            imageDiv.innerHTML = '';
            
            console.log('[Basitune] Fetching info for:', artist);
            
            // Call Tauri command
            const result = await window.__TAURI__.core.invoke('get_artist_info', { artist });
            
            console.log('[Basitune] Received result:', result);
            
            // Display artist bio
            bioDiv.innerHTML = `
                <h4>${artist}</h4>
                <p>${result.extract}</p>
            `;
            
            // Display thumbnail if available
            if (result.thumbnail) {
                imageDiv.innerHTML = `<img src="${result.thumbnail.source}" alt="${artist}">`;
            }
            
            console.log('[Basitune] Loaded info for:', artist);
        } catch (error) {
            console.error('[Basitune] Error fetching artist info:', error);
            console.error('[Basitune] Error details:', JSON.stringify(error));
            const bioDiv = document.getElementById('basitune-artist-bio');
            bioDiv.innerHTML = `<p class="basitune-placeholder">Could not load artist information<br><small>${error}</small></p>`;
        }
    }
    
    // Fetch lyrics from Genius via Tauri
    async function fetchLyrics(title, artist) {
        try {
            const lyricsDiv = document.getElementById('basitune-lyrics-content');
            
            lyricsDiv.innerHTML = '<p class="basitune-loading">Loading lyrics...</p>';
            
            console.log('[Basitune] Fetching lyrics for:', title, '-', artist);
            
            // Call Tauri command
            const lyrics = await window.__TAURI__.core.invoke('get_lyrics', { title, artist });
            
            console.log('[Basitune] Received lyrics');
            
            // Display lyrics
            lyricsDiv.textContent = lyrics;
            
            console.log('[Basitune] Loaded lyrics for:', title);
        } catch (error) {
            console.error('[Basitune] Error fetching lyrics:', error);
            const lyricsDiv = document.getElementById('basitune-lyrics-content');
            lyricsDiv.innerHTML = `<p class="basitune-placeholder">Could not load lyrics<br><small>${error}</small></p>`;
        }
    }
    
    // Monitor song changes
    function monitorSongChanges() {
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (!playerBar) {
            setTimeout(monitorSongChanges, 500);
            return;
        }
        
        const observer = new MutationObserver(() => {
            const songInfo = getCurrentSongInfo();
            if (songInfo) {
                // Update artist info if artist changed
                if (songInfo.artist !== currentArtist) {
                    currentArtist = songInfo.artist;
                    fetchArtistInfo(currentArtist);
                }
                
                // Update lyrics if title changed
                if (songInfo.title !== currentTitle) {
                    currentTitle = songInfo.title;
                    fetchLyrics(currentTitle, currentArtist);
                }
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
            fetchArtistInfo(currentArtist);
        }
        
        console.log('[Basitune] Song monitor started');
    }
    
    // Initialize
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        // Wait for YouTube Music to load
        const checkYTMusic = setInterval(() => {
            if (document.querySelector('ytmusic-app')) {
                clearInterval(checkYTMusic);
                createSidebar();
                monitorSongChanges();
            }
        }, 500);
    }
    
    init();
    console.log('[Basitune] Sidebar script loaded');
})();
