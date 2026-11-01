use tauri::Manager;

#[derive(serde::Serialize)]
struct UpdaterRuntimeInfo {
    app_image: bool,
    install_path: Option<String>,
    install_dir_writable: bool,
}

/// Reports how this copy of the app was started, so the UI never offers an
/// update that cannot be installed (AppImage only, in a writable directory).
#[tauri::command]
fn updater_runtime_info(app: tauri::AppHandle) -> UpdaterRuntimeInfo {
    #[cfg(target_os = "linux")]
    let app_image = app.env().appimage.is_some();
    #[cfg(not(target_os = "linux"))]
    let app_image = false;

    #[cfg(target_os = "linux")]
    let install_path = if app_image {
        app.env().appimage.map(std::path::PathBuf::from)
    } else {
        tauri::process::current_binary(&app.env()).ok()
    };
    #[cfg(not(target_os = "linux"))]
    let install_path = tauri::process::current_binary(&app.env()).ok();

    let install_dir_writable = install_path
        .as_deref()
        .and_then(std::path::Path::parent)
        .map(|dir| {
            tempfile::Builder::new()
                .prefix(".soldi-sotto-write-probe")
                .tempfile_in(dir)
                .is_ok()
        })
        .unwrap_or(false);

    UpdaterRuntimeInfo {
        app_image,
        install_path: install_path.map(|path| path.display().to_string()),
        install_dir_writable,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![updater_runtime_info])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
