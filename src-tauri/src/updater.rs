use serde::Serialize;
use std::fs;

#[derive(Debug, Serialize)]
pub struct AppMetadata {
    pub name: String,
    pub version: String,
    pub identifier: String,
}

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
}

#[tauri::command]
pub fn get_app_metadata(app: tauri::AppHandle) -> Result<AppMetadata, String> {
    Ok(AppMetadata {
        name: app.config().product_name.clone().unwrap_or_else(|| "Basitune".to_string()),
        version: app.config().version.clone().unwrap_or_else(|| "Unknown".to_string()),
        identifier: app.config().identifier.clone(),
    })
}

#[tauri::command]
pub fn get_changelog() -> Result<String, String> {
    // Read CHANGELOG.md from the project root
    fs::read_to_string("../CHANGELOG.md")
        .or_else(|_| fs::read_to_string("CHANGELOG.md"))
        .or_else(|_| fs::read_to_string("../../CHANGELOG.md"))
        .map_err(|e| format!("Failed to read CHANGELOG.md: {}", e))
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    use tauri_plugin_updater::UpdaterExt;
    
    let current_version = app.config().version.clone()
        .unwrap_or_else(|| "Unknown".to_string());
    
    // In dev builds, return "no update"
    if cfg!(debug_assertions) {
        return Ok(UpdateInfo {
            available: false,
            current_version: current_version.clone(),
            latest_version: current_version,
        });
    }
    
    let updater = app.updater()
        .map_err(|e| format!("Failed to get updater: {}", e))?;
    
    match updater.check().await {
        Ok(Some(update)) => {
            Ok(UpdateInfo {
                available: true,
                current_version: update.current_version,
                latest_version: update.version,
            })
        }
        Ok(None) => {
            Ok(UpdateInfo {
                available: false,
                current_version: current_version.clone(),
                latest_version: current_version,
            })
        }
        Err(e) => Err(format!("Failed to check for updates: {}", e))
    }
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    use tauri::Manager;
    
    // In dev builds, return error
    if cfg!(debug_assertions) {
        return Err("Updates not available in development builds".to_string());
    }
    
    let updater = app.updater()
        .map_err(|e| format!("Failed to get updater: {}", e))?;
    
    let update = updater.check().await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;
    
    println!("[Basitune] Downloading update {} -> {}", update.current_version, update.version);
    
    // Get window for progress updates
    let window = app.get_webview_window("main");
    
    // Download and install
    update.download_and_install(
        |chunk_length, content_length| {
            if let (Some(total), Some(w)) = (content_length, &window) {
                let percent = (chunk_length as f64 / total as f64 * 100.0) as u32;
                let _ = w.eval(format!(
                    r#"if (window.__basituneUpdateProgress) window.__basituneUpdateProgress({})"#,
                    percent
                ));
            }
        },
        || {
            println!("[Basitune] Update downloaded and ready to install");
        }
    ).await
    .map_err(|e| format!("Failed to install update: {}", e))?;
    
    println!("[Basitune] Update installed successfully");
    Ok(())
}
