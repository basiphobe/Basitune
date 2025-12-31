use notify_rust::Notification;
use tauri::Manager;
use crate::config::load_config;

#[tauri::command]
pub fn show_notification(
    title: String, 
    artist: String, 
    duration: Option<String>,
    album: Option<String>,
    app: tauri::AppHandle
) -> Result<(), String> {
    // Check if notifications are enabled
    let config = load_config(&app);
    let enabled = config.enable_notifications.unwrap_or(false);
    
    if !enabled {
        return Ok(());
    }
    
    // Build the notification body - single line for better compatibility with action buttons
    let mut body_parts = vec![format!("by {}", artist)];
    
    if let Some(album_name) = album {
        if !album_name.is_empty() {
            body_parts.push(format!("from {}", album_name));
        }
    }
    
    if let Some(dur) = duration {
        if !dur.is_empty() {
            body_parts.push(dur);
        }
    }
    
    let body = body_parts.join(" • ");
    
    // Interactive action buttons only work on Linux (D-Bus based)
    #[cfg(target_os = "linux")]
    {
        // Clone app handle for the action handler thread
        let app_clone = app.clone();
        
        // Show notification with action buttons
        std::thread::spawn(move || {
            let notification_result = Notification::new()
                .summary(&format!("🎵 {}", title))
                .body(&body)
                .appname("Basitune")
                .timeout(5000) // 5 seconds
                .action("default", "Open") // Clicking notification body triggers this
                .action("previous", "⏮️ Previous")
                .action("next", "⏭️ Next")
                .show();
            
            match notification_result {
                Ok(handle) => {
                    // Wait for user interaction (blocks until notification closes or action clicked)
                    handle.wait_for_action(|action| {
                        match action {
                            "default" => {
                                // Clicking notification body opens/focuses the main window
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            },
                            "previous" => {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval(r#"
                                        (function() {
                                            const prevBtn = document.querySelector('ytmusic-player-bar .previous-button')
                                                || document.querySelector('[aria-label="Previous"]')
                                                || document.querySelector('[aria-label="Previous track"]');
                                            if (prevBtn) prevBtn.click();
                                        })();
                                    "#);
                                }
                            },
                            "next" => {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval(r#"
                                        (function() {
                                            const nextBtn = document.querySelector('ytmusic-player-bar .next-button')
                                                || document.querySelector('[aria-label="Next"]')
                                                || document.querySelector('[aria-label="Next track"]');
                                            if (nextBtn) nextBtn.click();
                                        })();
                                    "#);
                                }
                            },
                            _ => {}
                        }
                    });
                },
                Err(e) => {
                    eprintln!("[Basitune] Failed to show notification: {}", e);
                }
            }
        });
    }
    
    // macOS and Windows get simple notifications without action buttons
    #[cfg(not(target_os = "linux"))]
    {
        Notification::new()
            .summary(&format!("🎵 {}", title))
            .body(&body)
            .appname("Basitune")
            .timeout(5000)
            .show()
            .map_err(|e| {
                let err_msg = format!("Failed to show notification: {}", e);
                eprintln!("[Basitune] {}", err_msg);
                err_msg
            })?;
    }
    
    Ok(())
}
