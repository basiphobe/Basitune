// Test idle detection via /dev/input event timestamps
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Testing /dev/input idle detection...\n");
    
    // Read /proc/uptime to get system uptime
    let uptime_str = fs::read_to_string("/proc/uptime")?;
    let uptime_seconds: f64 = uptime_str.split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);
    
    println!("System uptime: {:.2} seconds", uptime_seconds);
    
    // Check last access time of input devices
    let mut most_recent_activity = 0u64;
    
    if let Ok(entries) = fs::read_dir("/dev/input/by-path") {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(accessed) = metadata.accessed() {
                    let timestamp = accessed.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                    if timestamp > most_recent_activity {
                        most_recent_activity = timestamp;
                        println!("Latest activity from: {}", entry.path().display());
                    }
                }
            }
        }
    }
    
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let idle_seconds = now.saturating_sub(most_recent_activity);
    let idle_minutes = idle_seconds / 60;
    
    println!("\nResult:");
    println!("  Idle for: {} seconds ({} minutes)", idle_seconds, idle_minutes);
    println!("  Last activity: {} seconds ago", idle_seconds);
    
    if idle_seconds > 1800 {
        println!("  Status: WOULD BLOCK PLAYBACK (>30min idle)");
    } else {
        println!("  Status: WOULD ALLOW PLAYBACK (<30min idle)");
    }
    
    Ok(())
}
