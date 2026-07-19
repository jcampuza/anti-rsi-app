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
    /// Fallback for any variant not recognized by this build. Without this,
    /// serde would hard-fail deserialization of the whole snapshot event on
    /// an unrecognized state, silently dropping overlay/warning updates.
    /// Treated the same as `Normal` (no overlay).
    #[serde(other)]
    Unknown,
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
            Self::Normal | Self::Unknown => DesiredOverlayState::Hidden,
        }
    }
}

const RECONNECT_INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const RECONNECT_MAX_BACKOFF: Duration = Duration::from_secs(15);

pub fn start_native_event_subscriber(
    app: AppHandle,
    events_url: String,
    api_token: String,
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
        let mut reconnect_backoff = RECONNECT_INITIAL_BACKOFF;
        let mut logged_unknown_state = false;

        loop {
            let subscribe_result = subscribe_once(
                &client,
                &app,
                &events_url,
                &api_token,
                &mut current_native_window_state,
                &mut logged_unknown_state,
                show_overlay,
                hide_overlay,
                show_warning,
                hide_warning,
            )
            .await;

            let connected = match &subscribe_result {
                Ok(connected) => *connected,
                Err((connected, error)) => {
                    eprintln!("Anti RSI native event subscriber disconnected: {error}");
                    *connected
                }
            };
            if connected {
                // We successfully connected at least once this attempt (even
                // if the stream later dropped); reset backoff.
                reconnect_backoff = RECONNECT_INITIAL_BACKOFF;
            }

            tokio::time::sleep(reconnect_backoff).await;
            reconnect_backoff = std::cmp::min(reconnect_backoff * 2, RECONNECT_MAX_BACKOFF);
        }
    });
}

async fn subscribe_once(
    client: &reqwest::Client,
    app: &AppHandle,
    events_url: &str,
    api_token: &str,
    current_native_window_state: &mut DesiredNativeWindowState,
    logged_unknown_state: &mut bool,
    show_overlay: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_overlay: fn(AppHandle) -> Result<(), String>,
    show_warning: fn(AppHandle, BreakOverlayKind) -> Result<(), String>,
    hide_warning: fn(AppHandle) -> Result<(), String>,
) -> Result<bool, (bool, String)> {
    let mut request = client.get(events_url);
    if !api_token.is_empty() {
        request = request.header("Authorization", format!("Bearer {api_token}"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| (false, error.to_string()))?;

    if !response.status().is_success() {
        return Err((false, format!("SSE request failed ({})", response.status())));
    }

    let mut stream = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    let mut data_lines: Vec<Vec<u8>> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| (true, error.to_string()))?;
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
                    logged_unknown_state,
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

    Err((true, "SSE stream ended".to_string()))
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
    logged_unknown_state: &mut bool,
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

    if matches!(snapshot.state, AntiRsiState::Unknown) && !*logged_unknown_state {
        eprintln!(
            "Anti RSI native event subscriber received an unrecognized core state; treating it as no overlay. This message logs once per run."
        );
        *logged_unknown_state = true;
    }

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

/// A single native window action to take while reconciling `current` toward
/// `desired`. Kept separate from `AppHandle` and the show/hide callbacks so
/// the planning logic (`plan_native_window_actions`) is pure and cheaply
/// unit-testable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativeWindowAction {
    ShowOverlay(BreakOverlayKind),
    HideOverlay,
    ShowWarning(BreakOverlayKind),
    HideWarning,
}

/// Pure planning step: given the currently-applied window state and the
/// newly desired state, decide which window actions to perform and in what
/// order. Overlay windows always take priority over warning windows, and a
/// warning is torn down before an overlay is shown.
fn plan_native_window_actions(
    current: DesiredNativeWindowState,
    desired: DesiredNativeWindowState,
) -> Vec<NativeWindowAction> {
    let mut actions = Vec::new();

    if desired.overlay != DesiredOverlayState::Hidden {
        if current.warning.is_some() {
            actions.push(NativeWindowAction::HideWarning);
        }
        if desired.overlay != current.overlay {
            if let DesiredOverlayState::Visible(kind) = desired.overlay {
                actions.push(NativeWindowAction::ShowOverlay(kind));
            }
        }
        return actions;
    }

    if current.overlay != DesiredOverlayState::Hidden {
        actions.push(NativeWindowAction::HideOverlay);
    }

    if desired.warning != current.warning {
        match desired.warning {
            Some(kind) => actions.push(NativeWindowAction::ShowWarning(kind)),
            None => actions.push(NativeWindowAction::HideWarning),
        }
    }

    actions
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
    for action in plan_native_window_actions(current, desired) {
        match action {
            NativeWindowAction::ShowOverlay(kind) => show_overlay(app.clone(), kind)?,
            NativeWindowAction::HideOverlay => hide_overlay(app.clone())?,
            NativeWindowAction::ShowWarning(kind) => show_warning(app.clone(), kind)?,
            NativeWindowAction::HideWarning => hide_warning(app.clone())?,
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hidden() -> DesiredNativeWindowState {
        DesiredNativeWindowState {
            overlay: DesiredOverlayState::Hidden,
            warning: None,
        }
    }

    #[test]
    fn shows_overlay_from_hidden() {
        let current = hidden();
        let desired = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Visible(BreakOverlayKind::Mini),
            warning: None,
        };

        assert_eq!(
            plan_native_window_actions(current, desired),
            vec![NativeWindowAction::ShowOverlay(BreakOverlayKind::Mini)]
        );
    }

    #[test]
    fn overlay_hides_existing_warning_first() {
        let current = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Hidden,
            warning: Some(BreakOverlayKind::Mini),
        };
        let desired = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Visible(BreakOverlayKind::Work),
            warning: None,
        };

        assert_eq!(
            plan_native_window_actions(current, desired),
            vec![
                NativeWindowAction::HideWarning,
                NativeWindowAction::ShowOverlay(BreakOverlayKind::Work)
            ]
        );
    }

    #[test]
    fn teardown_from_overlay_to_normal_hides_overlay() {
        let current = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Visible(BreakOverlayKind::Work),
            warning: None,
        };
        let desired = hidden();

        assert_eq!(
            plan_native_window_actions(current, desired),
            vec![NativeWindowAction::HideOverlay]
        );
    }

    #[test]
    fn warning_appears_when_overlay_clears_to_normal() {
        let current = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Visible(BreakOverlayKind::Mini),
            warning: None,
        };
        let desired = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Hidden,
            warning: Some(BreakOverlayKind::Mini),
        };

        assert_eq!(
            plan_native_window_actions(current, desired),
            vec![
                NativeWindowAction::HideOverlay,
                NativeWindowAction::ShowWarning(BreakOverlayKind::Mini)
            ]
        );
    }

    #[test]
    fn warning_is_torn_down_when_it_clears() {
        let current = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Hidden,
            warning: Some(BreakOverlayKind::Work),
        };
        let desired = hidden();

        assert_eq!(
            plan_native_window_actions(current, desired),
            vec![NativeWindowAction::HideWarning]
        );
    }

    #[test]
    fn no_actions_when_state_is_unchanged() {
        let current = DesiredNativeWindowState {
            overlay: DesiredOverlayState::Visible(BreakOverlayKind::Mini),
            warning: None,
        };

        assert_eq!(plan_native_window_actions(current, current), Vec::new());
    }
}
