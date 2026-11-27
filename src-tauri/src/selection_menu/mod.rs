use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[cfg(windows)]
mod webview2;
#[cfg(windows)]
pub(crate) use webview2::install;
#[cfg(windows)]
use webview2::receive;
#[cfg(target_os = "linux")]
mod webkitgtk;
#[cfg(target_os = "linux")]
pub(crate) use webkitgtk::install;
#[cfg(target_os = "linux")]
use webkitgtk::receive;

const MAX_AGE: Duration = Duration::from_secs(2);

#[derive(Deserialize)]
pub(crate) struct MenuGroup {
    label: String,
    items: Vec<SelectionItem>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SelectionItem {
    Group(MenuGroup),
    Command { label: String, id: String, enabled: bool, checked: Option<bool> },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandEvent {
    request_id: u32,
    id: String,
}

struct Prepared {
    request_id: u32,
    groups: Vec<MenuGroup>,
    received: Instant,
}

enum State<W> {
    Idle,
    Answered(Prepared),
    Waiting(u64, W),
}

/// Pairs the frontend's answer to a `contextmenu` event with the native menu
/// request, which the engine raises independently of that IPC call. An answer
/// with no groups declines the request.
struct Pending<W> {
    state: State<W>,
    generation: u64,
}

impl<W> Default for Pending<W> {
    fn default() -> Self {
        Self { state: State::Idle, generation: 0 }
    }
}

impl<W> Pending<W> {
    fn take(&mut self, now: Instant) -> (Option<Prepared>, Option<W>) {
        match std::mem::replace(&mut self.state, State::Idle) {
            State::Idle => (None, None),
            State::Answered(menu) => (
                (now.saturating_duration_since(menu.received) < MAX_AGE).then_some(menu),
                None,
            ),
            State::Waiting(_, waiter) => (None, Some(waiter)),
        }
    }

    fn wait(&mut self, waiter: W) -> u64 {
        self.generation += 1;
        self.state = State::Waiting(self.generation, waiter);
        self.generation
    }

    fn receive(&mut self, menu: Prepared) -> Option<(W, Prepared)> {
        match std::mem::replace(&mut self.state, State::Idle) {
            State::Waiting(_, waiter) => Some((waiter, menu)),
            _ => {
                self.state = State::Answered(menu);
                None
            }
        }
    }

    fn expire(&mut self, generation: u64) -> Option<W> {
        match std::mem::replace(&mut self.state, State::Idle) {
            State::Waiting(current, waiter) if current == generation => Some(waiter),
            state => {
                self.state = state;
                None
            }
        }
    }
}

#[tauri::command]
pub(crate) fn prepare_selection_menu(
    window: WebviewWindow,
    request_id: u32,
    groups: Vec<MenuGroup>,
) -> Result<(), String> {
    let menu = Prepared { request_id, groups, received: Instant::now() };
    receive(&window, menu).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu(groups: usize, received: Instant) -> Prepared {
        let groups = (0..groups).map(|_| MenuGroup { label: "Format".into(), items: Vec::new() }).collect();
        Prepared { request_id: 7, groups, received }
    }

    #[test]
    fn a_native_request_takes_only_a_recent_menu() {
        let now = Instant::now();
        let mut pending = Pending::<()>::default();
        pending.receive(menu(1, now));
        assert_eq!(pending.take(now + Duration::from_millis(50)).0.map(|menu| menu.request_id), Some(7));
        assert!(pending.take(now).0.is_none());

        pending.receive(menu(1, now));
        assert!(pending.take(now + MAX_AGE).0.is_none());
    }

    #[test]
    fn a_menu_arriving_after_the_native_request_is_handed_to_the_waiter() {
        let now = Instant::now();
        let mut pending = Pending::default();
        pending.wait("deferral");
        let (waiter, menu) = pending.receive(menu(1, now)).expect("waiting request");
        assert_eq!((waiter, menu.request_id), ("deferral", 7));
        assert!(matches!(pending.take(now), (None, None)));
    }

    #[test]
    fn a_decline_answers_the_native_request_and_replaces_an_unused_menu() {
        let now = Instant::now();
        let mut pending = Pending::<()>::default();
        pending.receive(menu(1, now));
        pending.receive(menu(0, now));
        assert_eq!(pending.take(now).0.map(|menu| menu.groups.len()), Some(0));
    }

    #[test]
    fn a_timeout_releases_only_its_own_request() {
        let mut pending = Pending::default();
        let first = pending.wait("first");
        let (_, stale) = pending.take(Instant::now());
        assert_eq!(stale, Some("first"));
        let second = pending.wait("second");
        assert_eq!(pending.expire(first), None);
        assert_eq!(pending.expire(second), Some("second"));
        assert_eq!(pending.expire(second), None);
    }
}
