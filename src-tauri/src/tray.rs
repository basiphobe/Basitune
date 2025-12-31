use crate::playback::PlaybackState;
use tauri::Manager;

pub fn rebuild_tray_menu(app: &tauri::AppHandle, state: &str) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    
    let playback_state: tauri::State<PlaybackState> = app.state();
    let current_song = playback_state.get_current_song();
    
    // Build base menu items
    let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let separator1 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    let separator2 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let previous_track = MenuItem::with_id(app, "previous_track", "Previous Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let next_track = MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    // Build menu based on state
    let menu = if let Some((title, artist)) = current_song {
        // Song is playing/loaded - show song info
        let song_text = format!("♪ {} - {}", title, artist);
        let now_playing = MenuItem::with_id(app, "now_playing", &song_text, false, None::<&str>)
            .map_err(|e| e.to_string())?;
        let separator_song = PredefinedMenuItem::separator(app)
            .map_err(|e| e.to_string())?;
        
        match state {
            "playing" => {
                let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &pause,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            "paused" => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            _ => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            }
        }
    } else {
        // No song - standard menu
        match state {
            "playing" => {
                let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &pause,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            "paused" => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            _ => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            }
        }
    };
    
    // Get the tray and update its menu
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))
            .map_err(|e| e.to_string())?;
    } else {
        return Err("Tray not found".to_string());
    }
    
    Ok(())
}
