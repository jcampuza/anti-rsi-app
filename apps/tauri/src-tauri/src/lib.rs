use std::{fs, sync::Mutex};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const API_PORT: &str = "56321";
const OVERLAY_LABEL_PREFIX: &str = "overlay-";
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "antirsi-tray";

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn api_base_url() -> String {
    format!("http://127.0.0.1:{API_PORT}/")
}

#[tauri::command]
fn quit_sidecar(state: State<'_, SidecarState>) {
    if let Ok(mut child) = state.child.lock() {
        if let Some(child) = child.take() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
fn show_break_overlay(app: AppHandle, kind: String) -> Result<(), String> {
    let overlay_kind = match kind.as_str() {
        "mini" | "work" => kind,
        _ => return Err(format!("unsupported break overlay kind: {kind}")),
    };

    hide_break_overlay(app.clone())?;

    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| error.to_string())?;

    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    for (index, monitor) in monitors.iter().enumerate() {
        let label = format!("{OVERLAY_LABEL_PREFIX}{index}");
        let position = monitor.position();
        let size = monitor.size();
        let scale_factor = monitor.scale_factor();
        let url = WebviewUrl::App(format!("index.html?overlay={overlay_kind}").into());

        let overlay = WebviewWindowBuilder::new(&app, label, url)
            .title("Anti RSI Break")
            .position(
                position.x as f64 / scale_factor,
                position.y as f64 / scale_factor,
            )
            .inner_size(
                size.width as f64 / scale_factor,
                size.height as f64 / scale_factor,
            )
            .decorations(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(true)
            .fullscreen(false)
            .focused(true)
            .focusable(true)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .visible(true)
            .build()
            .map_err(|error| error.to_string())?;

        let _ = overlay.set_visible_on_all_workspaces(true);
        let _ = overlay.set_always_on_top(true);
        let _ = overlay.set_simple_fullscreen(true);
        let _ = overlay.set_focus();
        set_break_overlay_native_level(&overlay)?;
    }

    Ok(())
}

#[tauri::command]
fn hide_break_overlay(app: AppHandle) -> Result<(), String> {
    for window in app.webview_windows().into_values() {
        if window.label().starts_with(OVERLAY_LABEL_PREFIX) {
            window.close().map_err(|error| error.to_string())?;
        }
    }

    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn set_break_overlay_native_level<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    use objc2_app_kit::{NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior};

    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    if ns_window.is_null() {
        return Err("overlay NSWindow handle was null".to_string());
    }

    unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window.setLevel(NSScreenSaverWindowLevel);
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
    }

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn create_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Anti RSI", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Anti RSI", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon =
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon-menubarTemplate.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Anti RSI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            else {
                return;
            };

            show_main_window(&tray.app_handle());
        })
        .build(app)?;

    Ok(())
}

fn spawn_sidecar(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let user_data_dir = app_data_dir.to_string_lossy().to_string();
    let command = app.shell().sidecar("antirsi-sidecar")?.args([
        "--port",
        API_PORT,
        "--user-data-dir",
        user_data_dir.as_str(),
    ]);
    let (mut rx, child) = command.spawn()?;

    app.manage(SidecarState {
        child: Mutex::new(Some(child)),
    });

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("{}", String::from_utf8_lossy(&line).trim_end());
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("{}", String::from_utf8_lossy(&line).trim_end());
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            api_base_url,
            quit_sidecar,
            show_break_overlay,
            hide_break_overlay,
        ])
        .setup(|app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            create_tray(app)?;
            spawn_sidecar(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Ok(mut child) = state.child.lock() {
                        if let Some(child) = child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
