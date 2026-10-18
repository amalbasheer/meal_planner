use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Explicitly set the window icon for desktop windows on startup
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let icon_path = app.path().resolve("icons/32x32.png", tauri::path::BaseDirectory::Resource).ok();
                if let Some(path) = icon_path {
                    if let Ok(image) = tauri::image::Image::from_path(path) {
                        let _ = window.set_icon(image);
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}