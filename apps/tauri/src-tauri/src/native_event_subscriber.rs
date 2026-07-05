use std::time::Duration;

use futures_util::StreamExt;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BreakOverlayKind {
    Mini,
    Work,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesiredOverlayState {
    Hidden,
    Visible(BreakOverlayKind),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DesiredNativeWindowState {
    overlay: DesiredOverlayState,
    warning: Option<BreakOverlayKind>,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum AntiRsiState {
    Normal,
    PendingMini,
    PendingWork,
    InMini,
    InWork,
}

#[derive(Deserialize)]
struct AntiRsiSnapshot {
    state: AntiRsiState,
    #[serde(rename = "breakWarning")]
    break_warning: Option<AntiRsiBreakWarning>,
}

#[derive(Deserialize)]
struct AntiRsiBreakWarning {
    #[serde(rename = "breakType")]
    break_type: BreakOverlayKind,
}

#[derive(Deserialize)]
struct SnapshotEvent {
    snapshot: Option<AntiRsiSnapshot>,
}

impl AntiRsiState {
    fn desired_overlay_state(&self) -> DesiredOverlayState {
        match self {
            Self::PendingMini | Self::InMini => {
                DesiredOverlayState::Visible(BreakOverlayKind::Mini)
            }
            Self::PendingWork | Self::InWork => {
                DesiredOverlayState::Visible(BreakOverlayKind::Work)
            }
            Self::Normal => DesiredOverlayState::Hidden,
        }
    }
}

pub fn start_native_event_subscriber(
    app: AppHandle,
    events_url: String,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) {
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let mut current_native_window_state = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Hidden,
            warning: None,
        };

        loop {
            if let Err(error) = subscribe_once(
                &client,
                &app,
                &events_url,
                &mut current_native_window_state,
                show_overlay,
                hide_overlay,
                show_warning,
                hide_warning,
            )
            .await
            {
                eprintln!("Anti RSI native event subscriber disconnected: {error}");
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

async fn subscribe_once(
    client: &reqwest::Client,
    app: &AppHandle,
    events_url: &str,
    current_native_window_state: &mut DesiredNativeWindowState,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) -> Result<(), String> {
    let response = client
        .get(events_url)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("SSE request failed ({})", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    let mut data_lines: Vec<Vec<u8>> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        pending.extend_from_slice(&chunk);

        while let Some(line_end) = pending.iter().position(|byte| *byte == b'\n') {
            let mut line = pending.drain(..=line_end).collect::<Vec<u8>>();
            if line.ends_with(b"\n") {
                line.pop();
            }
            if line.ends_with(b"\r") {
                line.pop();
            }

            if line.is_empty() {
                handle_sse_event(
                    app,
                    &data_lines,
                    current_native_window_state,
                    show_overlay,
                    hide_overlay,
                    show_warning,
                    hide_warning,
                );
                data_lines.clear();
            } else if let Some(data) = line.strip_prefix(b"data:") {
                data_lines.push(trim_start_ascii(data).to_vec());
            }
        }
    }

    Err("SSE stream ended".to_string())
}

fn trim_start_ascii(value: &[u8]) -> &[u8] {
    let trimmed_start = value
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(value.len());
    &value[trimmed_start..]
}

fn handle_sse_event(
    app: &AppHandle,
    data_lines: &[Vec<u8>],
    current_native_window_state: &mut DesiredNativeWindowState,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) {
    if data_lines.is_empty() {
        return;
    }

    let payload = data_lines.join(&b'\n');
    let Ok(event) = serde_json::from_slice::<SnapshotEvent>(&payload) else {
        return;
    };
    let Some(snapshot) = event.snapshot else {
        return;
    };

    let desired_native_window_state = DesiredNativeWindowState {
        overlay: snapshot.state.desired_overlay_state(),
        warning: snapshot
            .break_warning
            .map(|warning| warning.break_type)
            .filter(|_| {
                matches!(
                    snapshot.state.desired_overlay_state(),
                    DesiredOverlayState::Hidden
                )
            }),
    };
    if desired_native_window_state == *current_native_window_state {
        return;
    }

    let result = reconcile_native_windows(
        app,
        *current_native_window_state,
        desired_native_window_state,
        show_overlay,
        hide_overlay,
        show_warning,
        hide_warning,
    );

    match result {
        Ok(()) => {
            *current_native_window_state = desired_native_window_state;
        }
        Err(error) => {
            eprintln!(
                "Failed to reconcile Anti RSI native windows from native subscriber: {error}"
            );
        }
    }
}

fn reconcile_native_windows(
    app: &AppHandle,
    current: DesiredNativeWindowState,
    desired: DesiredNativeWindowState,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) -> Result<(), String> {
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            let result = reconcile_native_windows_on_main_thread(
                &app,
                current,
                desired,
                show_overlay,
                hide_overlay,
                show_warning,
                hide_warning,
            );

            if let Err(error) = result {
                eprintln!("Failed to reconcile Anti RSI native windows on main thread: {error}");
            }
        })
        .map_err(|error| error.to_string())
}

fn reconcile_native_windows_on_main_thread(
    app: &AppHandle,
    current: DesiredNativeWindowState,
    desired: DesiredNativeWindowState,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) -> Result<(), String> {
    if desired.overlay != DesiredOverlayState::Hidden {
        if current.warning.is_some() {
            hide_warning(app.clone())?;
        }
        if desired.overlay != current.overlay {
            match desired.overlay {
                DesiredOverlayState::Hidden => {}
                DesiredOverlayState::Visible(kind) => show_overlay(app.clone(), kind)?,
            }
        }
        return Ok(());
    }

    if current.overlay != DesiredOverlayState::Hidden {
        hide_overlay(app.clone())?;
    }

    if desired.warning != current.warning {
        match desired.warning {
            Some(kind) => show_warning(app.clone(), kind)?,
            None => hide_warning(app.clone())?,
        }
    }

    Ok(())
}
