#[cfg(target_os = "macos")]
mod archive_keychain;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

fn state_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("window-state.json"))
}

fn restore_window_state(window: &tauri::WebviewWindow, path: &PathBuf) {
    let Ok(raw) = fs::read_to_string(path) else { return };
    let Ok(state) = serde_json::from_str::<WindowState>(&raw) else { return };
    if state.width < 360 || state.height < 600 {
        return;
    }
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    // Only restore position when the top-left corner lies inside an available monitor.
    if let Ok(monitors) = window.available_monitors() {
        let on_screen = monitors.iter().any(|monitor| {
            let pos = monitor.position();
            let size = monitor.size();
            state.x >= pos.x - 100
                && state.x < pos.x + size.width as i32 - 80
                && state.y >= pos.y - 40
                && state.y < pos.y + size.height as i32 - 80
        });
        if on_screen {
            let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
        }
    }
    if state.maximized {
        let _ = window.maximize();
    }
}

fn save_window_state(window: &tauri::WebviewWindow, path: &PathBuf) {
    let maximized = window.is_maximized().unwrap_or(false);
    let Ok(size) = window.outer_size() else { return };
    let Ok(pos) = window.outer_position() else { return };
    if size.width < 360 || size.height < 600 {
        return;
    }
    let state = WindowState {
        width: size.width,
        height: size.height,
        x: pos.x,
        y: pos.y,
        maximized,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&state) {
        let _ = fs::write(path, json);
    }
}

#[cfg(target_os = "macos")]
fn build_app_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

    let settings = MenuItemBuilder::with_id("open-profile", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let app_submenu = SubmenuBuilder::new(app, "Ducat")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let new_tx = MenuItemBuilder::with_id("new-transaction", "New Transaction")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let search = MenuItemBuilder::with_id("focus-search", "Search")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let file_submenu = SubmenuBuilder::with_id(app, "menu-file", "File")
        .item(&new_tx)
        .item(&search)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let edit_submenu = SubmenuBuilder::with_id(app, "menu-edit", "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let privacy = MenuItemBuilder::with_id("toggle-privacy", "Hide / Show Amounts")
        .accelerator("CmdOrCtrl+Shift+P")
        .build(app)?;
    let nav_overview = MenuItemBuilder::with_id("nav-dashboard", "Overview")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let nav_tx = MenuItemBuilder::with_id("nav-transactions", "Transactions")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let nav_analytics = MenuItemBuilder::with_id("nav-analytics", "Insights")
        .accelerator("CmdOrCtrl+3")
        .build(app)?;
    let nav_recurring = MenuItemBuilder::with_id("nav-recurring", "Recurring")
        .accelerator("CmdOrCtrl+4")
        .build(app)?;
    let nav_budgets = MenuItemBuilder::with_id("nav-budgets", "Budgets")
        .accelerator("CmdOrCtrl+5")
        .build(app)?;
    let view_submenu = SubmenuBuilder::with_id(app, "menu-view", "View")
        .item(&privacy)
        .separator()
        .item(&nav_overview)
        .item(&nav_tx)
        .item(&nav_analytics)
        .item(&nav_recurring)
        .item(&nav_budgets)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window_submenu = SubmenuBuilder::with_id(app, "menu-window", "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .build()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    use tauri::menu::MenuItemKind;
    let italian = language.starts_with("it");
    let labels = [
        ("menu-file", "File", "File"), ("menu-edit", "Modifica", "Edit"),
        ("menu-view", "Vista", "View"), ("menu-window", "Finestra", "Window"),
        ("open-profile", "Impostazioni…", "Settings…"),
        ("new-transaction", "Nuovo movimento", "New Transaction"),
        ("focus-search", "Cerca", "Search"),
        ("toggle-privacy", "Nascondi / Mostra importi", "Hide / Show Amounts"),
        ("nav-dashboard", "Panoramica", "Overview"),
        ("nav-transactions", "Movimenti", "Transactions"),
        ("nav-analytics", "Analisi", "Insights"),
        ("nav-recurring", "Ricorrenti", "Recurring"),
        ("nav-budgets", "Budget mensili", "Budgets"),
    ];
    let menu = app.menu().ok_or("Menu unavailable")?;
    for item in menu.items().map_err(|error| error.to_string())? {
        if let MenuItemKind::Submenu(submenu) = item {
            for (id, it, en) in labels {
                let label = if italian { it } else { en };
                if submenu.id().as_ref() == id {
                    submenu.set_text(label).map_err(|error| error.to_string())?;
                }
                if let Some(MenuItemKind::MenuItem(entry)) = submenu.get(id) {
                    entry.set_text(label).map_err(|error| error.to_string())?;
                }
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // The updater is a desktop-only feature: Cargo.toml does not even build the
    // plugin for iOS or Android, so the registration has to match.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        archive_keychain::archive_key_status,
        archive_keychain::unlock_archive_key,
        archive_keychain::save_archive_key,
        archive_keychain::remove_archive_key,
        set_menu_language
    ]);

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "macos")]
            {
                if let Ok(menu) = build_app_menu(app) {
                    let _ = app.set_menu(menu);
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Some(path) = state_path(app.handle()) {
                    restore_window_state(&window, &path);
                    let win_for_save = window.clone();
                    let path_for_save = path.clone();
                    window.on_window_event(move |event| {
                        if matches!(
                            event,
                            WindowEvent::CloseRequested { .. }
                                | WindowEvent::Resized(_)
                                | WindowEvent::Moved(_)
                        ) {
                            save_window_state(&win_for_save, &path_for_save);
                        }
                    });
                }
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("ducat:menu-action", event.id().as_ref());
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
