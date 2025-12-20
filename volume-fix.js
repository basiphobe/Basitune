// Basitune volume bridge
// Ensures the YouTube Music UI volume slider actually changes media volume

(function() {
    'use strict';

    if (window.__basituneVolumeFixInitialized) return;
    window.__basituneVolumeFixInitialized = true;

    const clamp01 = (value) => Math.min(1, Math.max(0, value));

    function findSlider() {
        return document.querySelector('ytmusic-player-bar [role="slider"][aria-label="Volume"]')
            || document.querySelector('[role="slider"][aria-label="Volume"]');
    }

    function readSliderVolume(slider) {
        if (!slider) return null;

        const raw = slider.getAttribute('aria-valuenow') ?? slider.getAttribute('value') ?? slider.value;
        const parsed = Number(raw);

        if (!Number.isFinite(parsed)) return null;
        return clamp01(parsed / 100);
    }

    function syncVolume() {
        const video = document.querySelector('video');
        const slider = findSlider();
        if (!video || !slider) return;

        const sliderVolume = readSliderVolume(slider);
        if (sliderVolume !== null && Math.abs(video.volume - sliderVolume) > 0.01) {
            video.volume = sliderVolume;
        }

        const ariaText = (slider.getAttribute('aria-valuetext') || '').toLowerCase();
        const shouldMute = sliderVolume === 0 || ariaText.includes('muted');
        if (video.muted !== shouldMute) {
            video.muted = shouldMute;
        }
    }

    setInterval(syncVolume, 500);  // Reduced from 200ms - less CPU usage
    console.log('[Basitune] Volume bridge initialized');
})();
