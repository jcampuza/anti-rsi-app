mod native_event_subscriber;

use std::{
    fs,
    sync::{mpsc, Mutex},
    time::Duration,
};

use rand::RngCore;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

use native_event_subscriber::{start_native_event_subscriber, BreakOverlayKind};

const SIDECAR_READY_PREFIX: &str = "ANTIRSI_API_BASE_URL=";
const SIDECAR_READY_TIMEOUT: Duration = Duration::from_secs(10);
const SIDECAR_SPAWN_MAX_ATTEMPTS: u32 = 3;
const SIDECAR_SPAWN_RETRY_BACKOFF: Duration = Duration::from_millis(500);
const OVERLAY_LABEL_PREFIX: &str = "overlay-";
const WARNING_LABEL_PREFIX: &str = "warning-";
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "antirsi-tray";
const WARNING_WIDTH: f64 = 340.0;
const WARNING_HEIGHT: f64 = 84.0;
const WARNING_MARGIN: f64 = 16.0;

/// Whether sidecar stdout lines are re-emitted verbatim to this process's
/// stdout. Off by default to avoid leaking sidecar internals in release
/// builds; enable by running with `ANTIRSI_VERBOSE_SIDECAR_LOGS=1`.
fn verbose_sidecar_logs_enabled() -> bool {
    std::env::var("ANTIRSI_VERBOSE_SIDECAR_LOGS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn generate_api_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    api_base_url: String,
    api_token: String,
}

#[derive(Default)]
struct BreakFocusState {
    previous_frontmost_pid: Mutex<Option<i32>>,
}

#[tauri::command]
fn api_base_url(state: State<'_, SidecarState>) -> String {
    state.api_base_url.clone()
}

#[tauri::command]
fn api_token(state: State<'_, SidecarState>) -> String {
    state.api_token.clone()
}

/// Gracefully shut down the sidecar: send SIGTERM so its finalizers run
/// (server close, final logs), wait briefly for exit, then fall back to a
/// hard kill so the sidecar can never be orphaned.
fn shutdown_sidecar_child(child: CommandChild) {
    #[cfg(unix)]
    {
        let pid = child.pid() as i32;
        if unsafe { libc::kill(pid, libc::SIGTERM) } == 0 {
            // Poll for exit for up to ~2s (signal 0 checks liveness).
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if unsafe { libc::kill(pid, 0) } != 0 {
                    return;
                }
            }
        }
    }

    let _ = child.kill();
}

#[tauri::command]
fn quit_sidecar(state: State<'_, SidecarState>) {
    if let Ok(mut child) = state.child.lock() {
        if let Some(child) = child.take() {
            shutdown_sidecar_child(child);
        }
    }
}

fn runtime_bridge_initialization_script(
    api_base_url: &str,
    api_token: &str,
) -> Result<String, String> {
    let api_base_url_json =
        serde_json::to_string(api_base_url).map_err(|error| error.to_string())?;
    let api_token_json = serde_json::to_string(api_token).map_err(|error| error.to_string())?;
    Ok(format!(
        "window.api = {{ meta: {{ versions: {{}}, apiBaseUrl: {api_base_url_json}, apiToken: {api_token_json} }} }};"
    ))
}

fn api_base_url_for_app(app: &AppHandle) -> String {
    app.state::<SidecarState>().api_base_url.clone()
}

fn api_token_for_app(app: &AppHandle) -> String {
    app.state::<SidecarState>().api_token.clone()
}

fn create_main_window(app: &mut tauri::App, api_base_url: &str, api_token: &str) -> Result<(), String> {
    WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("Anti RSI")
        .inner_size(480.0, 360.0)
        .min_inner_size(360.0, 360.0)
        .resizable(true)
        .fullscreen(false)
        .visible(true)
        .initialization_script(runtime_bridge_initialization_script(api_base_url, api_token)?)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn show_break_overlay(app: AppHandle, kind: String) -> Result<(), String> {
    let overlay_kind = match kind.as_str() {
        "mini" => BreakOverlayKind::Mini,
        "work" => BreakOverlayKind::Work,
        _ => return Err(format!("unsupported break overlay kind: {kind}")),
    };

    show_break_overlay_for_kind(app, overlay_kind)
}

fn show_break_overlay_for_kind(
    app: AppHandle,
    overlay_kind: BreakOverlayKind,
) -> Result<(), String> {
    let api_base_url = api_base_url_for_app(&app);
    let api_token = api_token_for_app(&app);
    let initialization_script = runtime_bridge_initialization_script(&api_base_url, &api_token)?;
    let overlay_kind_query_value = match overlay_kind {
        BreakOverlayKind::Mini => "mini",
        BreakOverlayKind::Work => "work",
    };

    if !has_break_overlay(&app) {
        remember_frontmost_application(&app);
    }

    close_break_warnings(&app)?;
    close_break_overlays(&app)?;

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
        let url = WebviewUrl::App(format!("index.html?overlay={overlay_kind_query_value}").into());

        let overlay = WebviewWindowBuilder::new(&app, label, url)
            .title("Anti RSI Break")
            .initialization_script(initialization_script.clone())
            .position(
                position.x as f64 / scale_factor,
                position.y as f64 / scale_factor,
            )
            .inner_size(
                size.width as f64 / scale_factor,
                size.height as f64 / scale_factor,
            )
            .decorations(false)
            .transparent(true)
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
fn show_break_warning(app: AppHandle, kind: String) -> Result<(), String> {
    let warning_kind = match kind.as_str() {
        "mini" => BreakOverlayKind::Mini,
        "work" => BreakOverlayKind::Work,
        _ => return Err(format!("unsupported break warning kind: {kind}")),
    };

    show_break_warning_for_kind(app, warning_kind)
}

fn show_break_warning_for_kind(
    app: AppHandle,
    warning_kind: BreakOverlayKind,
) -> Result<(), String> {
    let api_base_url = api_base_url_for_app(&app);
    let api_token = api_token_for_app(&app);
    let initialization_script = runtime_bridge_initialization_script(&api_base_url, &api_token)?;
    let warning_kind_query_value = match warning_kind {
        BreakOverlayKind::Mini => "mini",
        BreakOverlayKind::Work => "work",
    };

    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Err("no display available for break warning".to_string());
    }

    for (index, monitor) in monitors.iter().enumerate() {
        let label = format!("{WARNING_LABEL_PREFIX}{index}");
        let position = monitor.position();
        let size = monitor.size();
        let scale_factor = monitor.scale_factor();
        let x = position.x as f64 / scale_factor + size.width as f64 / scale_factor
            - WARNING_WIDTH
            - WARNING_MARGIN;
        let y = position.y as f64 / scale_factor + size.height as f64 / scale_factor
            - WARNING_HEIGHT
            - WARNING_MARGIN;

        let warning = if let Some(window) = app.get_webview_window(&label) {
            window
        } else {
            WebviewWindowBuilder::new(
                &app,
                label,
                WebviewUrl::App(format!("index.html?warning={warning_kind_query_value}").into()),
            )
            .title("Anti RSI Break Warning")
            .initialization_script(initialization_script.clone())
            .position(x, y)
            .inner_size(WARNING_WIDTH, WARNING_HEIGHT)
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(true)
            .focused(false)
            .focusable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .visible(false)
            .build()
            .map_err(|error| error.to_string())?
        };

        let _ = warning.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        let _ = warning.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: WARNING_WIDTH,
            height: WARNING_HEIGHT,
        }));
        let _ = warning.set_visible_on_all_workspaces(true);
        let _ = warning.set_always_on_top(true);
        let _ = warning.show();
    }

    for window in app.webview_windows().into_values() {
        if let Some(index) = window
            .label()
            .strip_prefix(WARNING_LABEL_PREFIX)
            .and_then(|value| value.parse::<usize>().ok())
        {
            if index >= monitors.len() {
                window.close().map_err(|error| error.to_string())?;
            }
        }
    }

    Ok(())
}

fn hide_break_overlay_for_native(app: AppHandle) -> Result<(), String> {
    close_break_overlays(&app)?;

    app.set_activation_policy(tauri::ActivationPolicy::Accessory)
        .map_err(|error| error.to_string())?;

    restore_previous_frontmost_application(&app);

    Ok(())
}

fn hide_break_warnings_for_native(app: AppHandle) -> Result<(), String> {
    close_break_warnings(&app)
}

fn has_break_overlay(app: &AppHandle) -> bool {
    app.webview_windows()
        .into_values()
        .any(|window| window.label().starts_with(OVERLAY_LABEL_PREFIX))
}

fn close_break_overlays(app: &AppHandle) -> Result<(), String> {
    for window in app.webview_windows().into_values() {
        if window.label().starts_with(OVERLAY_LABEL_PREFIX) {
            window.close().map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

/// Close (not merely hide) all break-warning windows so the warning window
/// lifecycle matches the overlay window lifecycle: both are fully torn down
/// when the underlying state clears and recreated fresh on demand.
fn close_break_warnings(app: &AppHandle) -> Result<(), String> {
    for window in app.webview_windows().into_values() {
        if window.label().starts_with(WARNING_LABEL_PREFIX) {
            window.close().map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn remember_frontmost_application(app: &AppHandle) {
    use objc2_app_kit::{NSRunningApplication, NSWorkspace};

    let previous_pid = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|frontmost_application| frontmost_application.processIdentifier())
        .filter(|pid| {
            *pid > 0 && *pid != NSRunningApplication::currentApplication().processIdentifier()
        });

    if let Some(state) = app.try_state::<BreakFocusState>() {
        if let Ok(mut stored_pid) = state.previous_frontmost_pid.lock() {
            *stored_pid = previous_pid;
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn remember_frontmost_application(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
fn restore_previous_frontmost_application(app: &AppHandle) {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};

    let previous_pid = app.try_state::<BreakFocusState>().and_then(|state| {
        state
            .previous_frontmost_pid
            .lock()
            .ok()
            .and_then(|mut pid| pid.take())
    });

    let Some(previous_pid) = previous_pid else {
        return;
    };

    let current_pid = NSRunningApplication::currentApplication().processIdentifier();
    if previous_pid <= 0 || previous_pid == current_pid {
        return;
    }

    let Some(previous_application) =
        NSRunningApplication::runningApplicationWithProcessIdentifier(previous_pid)
    else {
        return;
    };

    if previous_application.isTerminated() {
        return;
    }

    let _ = previous_application.unhide();
    let _ = previous_application.activateWithOptions(NSApplicationActivationOptions::empty());
}

#[cfg(not(target_os = "macos"))]
fn restore_previous_frontmost_application(_app: &AppHandle) {}

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

fn parse_sidecar_api_base_url(line: &str) -> Option<String> {
    let value = line.trim().strip_prefix(SIDECAR_READY_PREFIX)?;
    if !value.starts_with("http://127.0.0.1:") {
        return None;
    }
    Some(value.to_string())
}

/// Spawn the sidecar once and wait (blocking the calling thread, which must
/// NOT be the main/UI thread) for it to report readiness on stdout.
fn spawn_sidecar_once(
    app: &AppHandle,
    api_token: &str,
) -> Result<(String, CommandChild), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let user_data_dir = app_data_dir.to_string_lossy().to_string();
    let parent_pid = std::process::id().to_string();
    let command = app
        .shell()
        .sidecar("antirsi-sidecar")?
        .args([
            "--port",
            "0",
            "--user-data-dir",
            user_data_dir.as_str(),
            "--parent-pid",
            parent_pid.as_str(),
        ])
        .env("ANTIRSI_API_TOKEN", api_token);
    let (mut rx, child) = command.spawn()?;
    let (ready_tx, ready_rx) = mpsc::channel::<String>();

    let verbose_logs = verbose_sidecar_logs_enabled();
    let mut ready_tx = Some(ready_tx);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line = String::from_utf8_lossy(&line);
                    let line = line.trim_end();
                    if verbose_logs {
                        println!("{line}");
                    }
                    if let Some(api_base_url) = parse_sidecar_api_base_url(line) {
                        if let Some(ready_tx) = ready_tx.take() {
                            let _ = ready_tx.send(api_base_url);
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("{}", String::from_utf8_lossy(&line).trim_end());
                }
                _ => {}
            }
        }
    });

    match ready_rx.recv_timeout(SIDECAR_READY_TIMEOUT) {
        Ok(api_base_url) => Ok((api_base_url, child)),
        Err(error) => {
            let _ = child.kill();
            Err(format!("Sidecar did not report readiness: {error}").into())
        }
    }
}

/// Spawn the sidecar, retrying a few times with a short backoff before
/// giving up. Intended to run on a background thread so it never blocks the
/// main/UI thread.
fn spawn_sidecar_with_retry(
    app: &AppHandle,
    api_token: &str,
) -> Result<(String, CommandChild), String> {
    let mut last_error: Option<String> = None;

    for attempt in 1..=SIDECAR_SPAWN_MAX_ATTEMPTS {
        match spawn_sidecar_once(app, api_token) {
            Ok(result) => return Ok(result),
            Err(error) => {
                eprintln!(
                    "Sidecar spawn attempt {attempt}/{SIDECAR_SPAWN_MAX_ATTEMPTS} failed: {error}"
                );
                last_error = Some(error.to_string());
                if attempt < SIDECAR_SPAWN_MAX_ATTEMPTS {
                    std::thread::sleep(SIDECAR_SPAWN_RETRY_BACKOFF * attempt);
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "sidecar spawn failed".to_string()))
}

/// Push freshly resolved runtime bridge values into an already-loaded
/// webview window. `initialization_script` only runs on (re)load, so once
/// the sidecar becomes ready after the window was already shown we update
/// `window.api.meta` in place via `eval`.
fn push_runtime_bridge_update(
    window: &tauri::WebviewWindow,
    api_base_url: &str,
    api_token: &str,
) -> Result<(), String> {
    let script = runtime_bridge_initialization_script(api_base_url, api_token)?;
    window.eval(&script).map_err(|error| error.to_string())
}

/// Surface a user-visible failure when the sidecar could not be started
/// after retries. No dialog plugin is currently a dependency, so this logs
/// loudly and leaves the (otherwise inert) main window open rather than
/// panicking and tearing down the whole app.
fn show_sidecar_startup_failure_dialog(app: &AppHandle, message: &str) {
    eprintln!("Anti RSI sidecar startup failed: {message}");
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let message_json = serde_json::to_string(message).unwrap_or_else(|_| "\"\"".to_string());
        let _ = window.eval(format!("window.alert({message_json});"));
    }
}

/// Spawn the sidecar off the main thread and wire up the main window, native
/// event subscriber, and API bridge once it becomes ready. Returning quickly
/// from `setup` keeps the UI responsive even if the sidecar is slow to start
/// or needs to retry.
fn start_sidecar_and_wire_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let api_token = generate_api_token();
    create_main_window(app, "", "")?;

    let app_handle = app.handle().clone();
    std::thread::spawn(move || {
        let result = spawn_sidecar_with_retry(&app_handle, &api_token);

        match result {
            Ok((api_base_url, child)) => {
                app_handle.manage(SidecarState {
                    child: Mutex::new(Some(child)),
                    api_base_url: api_base_url.clone(),
                    api_token: api_token.clone(),
                });

                let events_url = format!("{api_base_url}events");
                let bridge_app_handle = app_handle.clone();
                let bridge_api_base_url = api_base_url.clone();
                let bridge_api_token = api_token.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    if let Some(window) = bridge_app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                        if let Err(error) = push_runtime_bridge_update(
                            &window,
                            &bridge_api_base_url,
                            &bridge_api_token,
                        ) {
                            eprintln!("Failed to update runtime bridge in main window: {error}");
                        }
                    }
                });

                start_native_event_subscriber(
                    app_handle.clone(),
                    events_url,
                    api_token,
                    show_break_overlay_for_kind,
                    hide_break_overlay_for_native,
                    show_break_warning_for_kind,
                    hide_break_warnings_for_native,
                );
            }
            Err(error) => {
                show_sidecar_startup_failure_dialog(
                    &app_handle,
                    &format!(
                        "Anti RSI could not start its background service after {SIDECAR_SPAWN_MAX_ATTEMPTS} attempts: {error}"
                    ),
                );
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
            api_token,
            quit_sidecar,
            show_break_overlay,
            show_break_warning,
        ])
        .setup(|app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.manage(BreakFocusState::default());
            create_tray(app)?;
            start_sidecar_and_wire_app(app)?;
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
                            shutdown_sidecar_child(child);
                        }
                    }
                }
            }
        });
}
