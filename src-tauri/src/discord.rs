use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;

// Discord Application ID (public identifier, not a secret)
const DISCORD_APP_ID: &str = "1438326240997281943";

pub struct DiscordState {
    pub client: Mutex<Option<DiscordIpcClient>>,
}

impl Default for DiscordState {
    fn default() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn update_discord_presence(
    title: String,
    artist: String,
    state: tauri::State<DiscordState>
) -> Result<(), String> {
    let mut client_opt = state.client.lock().unwrap();
    
    let details_text = title.to_string();
    let state_text = format!("by {}", artist);
    
    if let Some(client) = client_opt.as_mut() {
        let payload = activity::Activity::new()
            .details(&details_text)
            .state(&state_text)
            .assets(activity::Assets::new().large_image("logo").large_text("Basitune"));
            
        match client.set_activity(payload) {
            Ok(_) => {
                Ok(())
            }
            Err(e) => {
                eprintln!("[Basitune] Failed to update Discord presence: {}", e);
                
                // Try to reconnect on connection errors
                drop(client_opt.take()); // Drop the old client
                
                if let Ok(mut new_client) = DiscordIpcClient::new(DISCORD_APP_ID) {
                    match new_client.connect() {
                        Ok(_) => {
                            let retry_payload = activity::Activity::new()
                                .details(&details_text)
                                .state(&state_text)
                                .assets(activity::Assets::new().large_image("logo").large_text("Basitune"));
                            
                            match new_client.set_activity(retry_payload) {
                                Ok(_) => {
                                    *client_opt = Some(new_client);
                                    return Ok(());
                                }
                                Err(e2) => {
                                    eprintln!("[Basitune] Failed to set presence after reconnect: {}", e2);
                                }
                            }
                        }
                        Err(e2) => {
                            eprintln!("[Basitune] Failed to reconnect: {}", e2);
                        }
                    }
                }
                Ok(())
            }
        }
    } else {
        if let Ok(mut new_client) = DiscordIpcClient::new(DISCORD_APP_ID) {
            match new_client.connect() {
                Ok(_) => {
                    let payload = activity::Activity::new()
                        .details(&details_text)
                        .state(&state_text)
                        .assets(activity::Assets::new().large_image("logo").large_text("Basitune"));
                    
                    match new_client.set_activity(payload) {
                        Ok(_) => {
                            *client_opt = Some(new_client);
                        }
                        Err(e) => {
                            eprintln!("[Basitune] Failed to set Discord presence: {}", e);
                            eprintln!("[Basitune] This usually means the Discord App ID is not registered.");
                            eprintln!("[Basitune] Register your app at: https://discord.com/developers/applications");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[Basitune] Failed to connect to Discord: {}", e);
                    eprintln!("[Basitune] Make sure Discord is running.");
                }
            }
        }
        Ok(())
    }
}

#[tauri::command]
pub fn clear_discord_presence(state: tauri::State<DiscordState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().unwrap();
    
    if let Some(client) = client_opt.as_mut() {
        match client.clear_activity() {
            Ok(_) => {
                Ok(())
            }
            Err(_e) => {
                // Silently ignore errors
                Ok(())
            }
        }
    } else {
        Ok(()) // Silently ignore if not connected
    }
}
