use std::collections::BTreeMap;
use std::sync::mpsc::{channel, Sender, TryRecvError};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use gtk::gio;
use gtk::glib::{self, ToVariant};
use tauri::{Emitter, WebviewWindow};
use webkit2gtk::{ContextMenu, ContextMenuExt, ContextMenuItem, ContextMenuItemExt, HitTestResultExt, WebViewExt};

use super::{CommandEvent, MenuGroup, Pending, Prepared, SelectionItem};

// The frontend answers every right-click, so this only bounds a lost reply.
const WAIT: Duration = Duration::from_millis(200);

static PENDING: Mutex<BTreeMap<String, Pending<Sender<Prepared>>>> = Mutex::new(BTreeMap::new());

fn with_pending<T>(label: &str, f: impl FnOnce(&mut Pending<Sender<Prepared>>) -> T) -> T {
    let mut webviews = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
    f(webviews.entry(label.to_owned()).or_default())
}

fn submenu(window: &WebviewWindow, request_id: u32, group: MenuGroup, actions: &mut u32) -> ContextMenuItem {
    let menu = ContextMenu::new();
    for entry in group.items {
        let item = match entry {
            SelectionItem::Group(nested) => submenu(window, request_id, nested, actions),
            SelectionItem::Command { label, id, enabled, checked } => {
                // WebKit registers the actions of one context menu by name.
                let name = format!("selection-command-{actions}");
                *actions += 1;
                let action = match checked {
                    Some(checked) => gio::SimpleAction::new_stateful(&name, None, &checked.to_variant()),
                    None => gio::SimpleAction::new(&name, None),
                };
                action.set_enabled(enabled);
                let window = window.clone();
                let event = CommandEvent { request_id, id };
                action.connect_activate(move |_, _| {
                    let _ = window.emit_to(window.label(), "mermark:selection-command", event.clone());
                });
                ContextMenuItem::from_gaction(&action, &label, None)
            }
        };
        menu.append(&item);
    }
    ContextMenuItem::with_submenu(&group.label, &menu)
}

fn add_selection_menu(window: &WebviewWindow, menu: &ContextMenu, prepared: Prepared) {
    let mut groups = prepared.groups.into_iter();
    let Some(format) = groups.next() else { return };
    let mut actions = 0;
    menu.prepend(&submenu(window, prepared.request_id, format, &mut actions));
    if !menu.item_at_position(1).is_some_and(|item| item.is_separator()) {
        menu.insert(&ContextMenuItem::new_separator(), 1);
    }
    if groups.len() > 0 {
        menu.append(&ContextMenuItem::new_separator());
        for group in groups {
            menu.append(&submenu(window, prepared.request_id, group, &mut actions));
        }
    }
}

// The signal must decide synchronously, so the IPC reply is awaited in a nested main loop.
fn wait(label: &str) -> Option<Prepared> {
    let (sender, receiver) = channel();
    let generation = with_pending(label, |pending| pending.wait(sender));
    let context = glib::MainContext::default();
    let deadline = Instant::now() + WAIT;
    loop {
        match receiver.try_recv() {
            Ok(menu) => return Some(menu),
            Err(TryRecvError::Disconnected) => return None,
            Err(TryRecvError::Empty) if Instant::now() >= deadline => {
                with_pending(label, |pending| pending.expire(generation));
                return None;
            }
            Err(TryRecvError::Empty) => {
                if !context.iteration(false) {
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
        }
    }
}

pub(super) fn receive(window: &WebviewWindow, menu: Prepared) -> tauri::Result<()> {
    if let Some((sender, menu)) = with_pending(window.label(), |pending| pending.receive(menu)) {
        let _ = sender.send(menu);
        glib::MainContext::default().wakeup();
    }
    Ok(())
}

pub(crate) fn install(window: &WebviewWindow) {
    let owner = window.clone();
    let result = window.with_webview(move |platform| {
        platform.inner().connect_context_menu(move |_, menu, _, hit| {
            let label = owner.label();
            let (fresh, _) = with_pending(label, |pending| pending.take(Instant::now()));
            if hit.context_is_editable() && hit.context_is_selection() {
                if let Some(prepared) = fresh.or_else(|| wait(label)) {
                    add_selection_menu(&owner, menu, prepared);
                }
            }
            false
        });
    });
    if let Err(error) = result {
        eprintln!("Could not install the selection context menu: {error}");
    }
}
