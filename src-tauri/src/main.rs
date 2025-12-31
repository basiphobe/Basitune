// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use basitune_lib::*;
use tauri::{Manager, PhysicalPosition, PhysicalSize};
use std::time::Duration;

fn main() {
    // Initialize state
    let discord_state = discord::DiscordState::default();
    let playback_state = playback::PlaybackState::default();
    
    tauri::Builder::default()
        .manage(discord_state)
        .manage(playback_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Inject sidebar + volume helpers on every page load so they survive navigations
        .on_page_load(|window, _payload| {
            let sidebar_script = include_str!("../../src/scripts/sidebar.js");
            let diagnostics_script = include_str!("../../src/scripts/audio-diagnostics.js");
            let playback_script = include_str!("../../src/scripts/playback-controls.js");
            let visualizer_script = include_str!("../../src/scripts/visualizer.js");

            if let Err(e) = window.eval(sidebar_script) {
                eprintln!("[Basitune] Failed to inject sidebar: {}", e);
            } else {
                println!("[Basitune] Sidebar injected via on_page_load");
            }

            if let Err(e) = window.eval(diagnostics_script) {
                eprintln!("[Basitune] Failed to inject audio diagnostics: {}", e);
            } else {
                println!("[Basitune] Audio diagnostics injected via on_page_load");
            }

            if let Err(e) = window.eval(playback_script) {
                eprintln!("[Basitune] Failed to inject playback controls: {}", e);
            } else {
                println!("[Basitune] Playback controls injected via on_page_load");
            }

            if let Err(e) = window.eval(visualizer_script) {
                eprintln!("[Basitune] Failed to inject visualizer: {}", e);
            } else {
                println!("[Basitune] Visualizer injected via on_page_load");
            }

            // Attempt to restore playback position
            {
                let app_handle = window.app_handle().clone();
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait a bit for YouTube Music to load
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    
                    // Get saved playback position
                    if let Ok(Some(saved)) = config::get_playback_position(app_handle.clone()) {
                        println!("[Basitune] Restoring playback: {} - {} at {:.1}s", 
                                 saved.artist, saved.title, saved.position_seconds);
                        
                        let restore_script = format!(
                            r#"
                            (function() {{
                                const RESTORATION_KEY = '__basitunePlaybackRestoredTime';
                                const MIN_MINUTES_BETWEEN_RESTORES = 5;
                                
                                try {{
                                    const lastRestoreTime = localStorage.getItem(RESTORATION_KEY);
                                    const now = Date.now();
                                    
                                    if (lastRestoreTime) {{
                                        const minutesSinceLastRestore = (now - parseInt(lastRestoreTime, 10)) / 1000 / 60;
                                        
                                        if (minutesSinceLastRestore < MIN_MINUTES_BETWEEN_RESTORES) {{
                                            console.log('[Basitune] Skipping restoration - only ' + minutesSinceLastRestore.toFixed(1) + ' minutes since last restore');
                                            return;
                                        }}
                                    }}
                                    
                                    localStorage.setItem(RESTORATION_KEY, now.toString());
                                    console.log('[Basitune] Attempting playback restoration');
                                    
                                    if (window.basitunePlayback && window.basitunePlayback.restorePlaybackPosition) {{
                                        window.basitunePlayback.restorePlaybackPosition(
                                            "{}",
                                            "{}",
                                            {},
                                            {}
                                        );
                                    }}
                                }} catch (e) {{
                                    console.error('[Basitune] Restoration error:', e);
                                }}
                            }})();
                            "#,
                            saved.artist.replace('\\', "\\\\").replace('"', "\\\""),
                            saved.title.replace('\\', "\\\\").replace('"', "\\\""),
                            saved.position_seconds,
                            if saved.was_playing { "true" } else { "false" }
                        );
                        
                        if let Err(e) = window_clone.eval(&restore_script) {
                            eprintln!("[Basitune] Failed to restore playback position: {}", e);
                        }
                    }
                });
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is attempted, focus the existing window
            let windows = app.webview_windows();
            if let Some(window) = windows.values().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            ai::openai::get_artist_info, 
            ai::openai::get_song_context, 
            ai::genius::get_lyrics,
            ai::genius::search_lyrics,
            sidebar::get_sidebar_visible,
            sidebar::set_sidebar_visible,
            sidebar::get_sidebar_width,
            sidebar::set_sidebar_width,
            sidebar::get_sidebar_font_size,
            sidebar::set_sidebar_font_size,
            sidebar::save_sidebar_font_size,
            sidebar::toggle_sidebar,
            sidebar::resize_sidebar,
            discord::update_discord_presence,
            discord::clear_discord_presence,
            config::get_config,
            config::save_config,
            config::save_visualizer_settings,
            updater::get_app_metadata,
            updater::get_changelog,
            updater::check_for_updates,
            updater::install_update,
            playback::playback_play,
            playback::playback_pause,
            playback::playback_toggle,
            playback::playback_stop,
            playback::playback_next,
            playback::playback_previous,
            playback::playback_is_playing,
            playback::update_playback_state,
            playback::update_tray_tooltip,
            notifications::show_notification,
            config::save_playback_position,
            config::get_playback_position,
            playback::audio_context_ready
        ])
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::{TrayIconBuilder, TrayIconEvent};
            
            // Build initial tray menu (nothing playing at startup)
            let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide", true, None::<&str>)?;
            let previous_track = MenuItem::with_id(app, "previous_track", "Previous Track", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)?;
            let next_track = MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)?;
            
            let separator1 = PredefinedMenuItem::separator(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            
            let menu = Menu::with_items(app, &[
                &show_hide,
                &separator1,
                &previous_track,
                &play,
                &next_track,
                &separator2,
                &quit
            ])?;
            
            // Load and decode tray icon
            let icon_bytes = include_bytes!("../icons/32x32.png");
            let img = image::load_from_memory(icon_bytes)
                .map_err(|e| format!("Failed to load tray icon: {}", e))?
                .into_rgba8();
            let (width, height) = img.dimensions();
            let icon = tauri::image::Image::new_owned(img.into_raw(), width, height);
            
            // Build tray icon
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Basitune")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.unminimize();
                                }
                            }
                        }
                        "play" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.play()");
                                }
                            });
                        }
                        "previous_track" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.previous()");
                                }
                            });
                        }
                        "pause" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.togglePlayPause()");
                                }
                            });
                        }
                        "stop" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.stop()");
                                }
                            });
                        }
                        "next_track" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.next()");
                                }
                            });
                        }
                        "quit" => {
                            // Save playback position before quitting
                            if let Some(window) = app.get_webview_window("main") {
                                tauri::async_runtime::block_on(async move {
                                    let _ = window.eval(
                                        r#"
                                        (function() {
                                            if (window.basitunePlayback && window.basitunePlayback.getCurrentPlaybackState) {
                                                const state = window.basitunePlayback.getCurrentPlaybackState();
                                                if (state && window.__TAURI_INTERNALS__) {
                                                    window.__TAURI_INTERNALS__.invoke('save_playback_position', {
                                                        artist: state.artist,
                                                        title: state.title,
                                                        positionSeconds: state.position,
                                                        wasPlaying: state.isPlaying
                                                    });
                                                }
                                            }
                                        })();
                                        "#
                                    );
                                    
                                    // Wait for save to complete
                                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                                });
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(app) = tray.app_handle().get_webview_window("main") {
                            if app.is_visible().unwrap_or(false) {
                                let _ = app.hide();
                            } else {
                                let _ = app.show();
                                let _ = app.set_focus();
                                let _ = app.unminimize();
                            }
                        }
                    }
                })
                .build(app)?;
            
            // Initialize window state manager
            let state_manager = sidebar::WindowStateManager::new(app.handle().clone());
            let state = state_manager.get();
            app.manage(state_manager);
            
            // Check for updates on startup (skip in debug/dev to avoid noisy failures)
            let is_dev = cfg!(debug_assertions);
            if !is_dev {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    
                    // Wait a few seconds before checking for updates
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    
                    match app_handle.updater() {
                        Ok(updater) => {
                            match updater.check().await {
                                Ok(Some(update)) => {
                                    println!("[Basitune] Update available: {} -> {}", 
                                        update.current_version, update.version);
                                    
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.eval(format!(
                                            r#"window.showUpdateNotification('Downloading update {}...', false)"#,
                                            update.version
                                        ));
                                    }
                                    
                                    let window = app_handle.get_webview_window("main");
                                    let download_result = update.download_and_install(
                                        |chunk_length, content_length| {
                                            if let (Some(total), Some(w)) = (content_length, &window) {
                                                let percent = (chunk_length as f64 / total as f64 * 100.0) as u32;
                                                let _ = w.eval(format!(
                                                    r#"window.updateDownloadProgress({})"#, percent
                                                ));
                                            }
                                        },
                                        || {
                                            println!("[Basitune] Update installed, restart to apply");
                                        }
                                    ).await;
                                    
                                    match download_result {
                                        Ok(_) => {
                                            println!("[Basitune] Update downloaded and ready to install");
                                            if let Some(w) = app_handle.get_webview_window("main") {
                                                let _ = w.eval(
                                                    r#"window.showUpdateNotification('Update ready! Restart Basitune to apply.', true)"#
                                                );
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("[Basitune] Failed to install update: {}", e);
                                            if let Some(w) = app_handle.get_webview_window("main") {
                                                let _ = w.eval(
                                                    r#"window.showUpdateNotification('Update failed. Please try again later.', true)"#
                                                );
                                            }
                                        }
                                    }
                                }
                                Ok(None) => {
                                    println!("[Basitune] No updates available");
                                }
                                Err(e) => {
                                    eprintln!("[Basitune] Failed to check for updates: {}", e);
                                }
                            }
                        }
                        Err(e) => eprintln!("[Basitune] Failed to get updater: {}", e),
                    }
                });
            } else {
                println!("[Basitune] Skipping updater in debug/dev builds");
            }
            
            // Get the main window
            let main_window = app.get_webview_window("main").expect("Failed to get main window");
            
            // Apply saved window state
            println!("[Basitune] Applying window state: {}x{} at ({}, {}), maximized={}", 
                     state.width, state.height, state.x, state.y, state.maximized);
            
            if state.maximized {
                let _ = main_window.unmaximize();
                std::thread::sleep(Duration::from_millis(50));
                
                let _ = main_window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = main_window.set_position(PhysicalPosition::new(state.x, state.y));
                }
                
                std::thread::sleep(Duration::from_millis(50));
                let _ = main_window.maximize();
            } else {
                let _ = main_window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = main_window.set_position(PhysicalPosition::new(state.x, state.y));
                }
            }
            
            // Show the window
            let _ = main_window.show();

            // Handle window close event - either minimize to tray or save window state
            let app_handle = app.handle().clone();
            let window_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Check if close-to-tray is enabled
                    let config = config::load_config(&app_handle);
                    let close_to_tray = config.close_to_tray.unwrap_or(false);
                    
                    if close_to_tray {
                        // Hide window instead of closing
                        println!("[Basitune] Closing to tray");
                        let _ = window_clone.hide();
                        api.prevent_close();
                    } else {
                        // Save window state before exiting
                        if let Ok(size) = window_clone.inner_size() {
                            if let Ok(position) = window_clone.outer_position() {
                                let is_maximized = window_clone.is_maximized().unwrap_or(false);
                                
                                println!("[Basitune] Saving window state on close");
                                
                                let state_manager: tauri::State<sidebar::WindowStateManager> = app_handle.state();
                                state_manager.update_no_save(|state| {
                                    state.width = size.width;
                                    state.height = size.height;
                                    state.x = position.x;
                                    state.y = position.y;
                                    state.maximized = is_maximized;
                                });
                                state_manager.save_silent();
                            }
                        }
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
