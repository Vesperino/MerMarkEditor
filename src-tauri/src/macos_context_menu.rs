use std::cell::RefCell;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{define_class, ffi, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSControlStateValueOn, NSEvent, NSMenu, NSMenuItem};
use objc2_foundation::NSString;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, WebviewWindow};

static WEBVIEW_SUPERCLASS: OnceLock<&'static AnyClass> = OnceLock::new();

type WillOpenMenu = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut NSMenu, *mut NSEvent);

// WebCore ContextMenuAction tags forwarded by WKMenuTarget.
// https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ContextMenuItem.h
const CUT: isize = 13;
const UNDERLINE: isize = 44;

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

struct SelectionMenu {
    view: usize,
    window: WebviewWindow,
    request_id: u32,
    groups: Vec<MenuGroup>,
    opened_at: Instant,
}

thread_local! {
    static SELECTION_MENU: RefCell<Option<SelectionMenu>> = const { RefCell::new(None) };
}

#[tauri::command]
pub(crate) fn prepare_macos_selection_menu(
    window: WebviewWindow,
    request_id: u32,
    groups: Vec<MenuGroup>,
) -> Result<(), String> {
    let sender = window.clone();
    let opened_at = Instant::now();
    window.with_webview(move |view| {
        SELECTION_MENU.replace(Some(SelectionMenu {
            view: view.inner() as usize,
            window: sender,
            request_id,
            groups,
            opened_at,
        }));
    }).map_err(|error| error.to_string())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandEvent {
    request_id: u32,
    id: String,
}

struct CommandTarget {
    window: WebviewWindow,
    event: CommandEvent,
}

define_class!(
    #[unsafe(super(NSMenuItem))]
    #[name = "MerMarkSelectionMenuItem"]
    #[thread_kind = MainThreadOnly]
    #[ivars = CommandTarget]
    struct SelectionMenuItem;

    impl SelectionMenuItem {
        #[unsafe(method(runSelectionCommand:))]
        fn run(&self, _sender: &NSMenuItem) {
            let CommandTarget { window, event } = self.ivars();
            let _ = window.emit_to(window.label(), "mermark:selection-command", event.clone());
        }
    }
);

fn submenu(mtm: MainThreadMarker, source: &SelectionMenu, group: MenuGroup) -> Retained<NSMenuItem> {
    let title = NSString::from_str(&group.label);
    let empty = NSString::from_str("");
    // SAFETY: A submenu item delegates selection to its children.
    let item = unsafe { NSMenuItem::initWithTitle_action_keyEquivalent(mtm.alloc(), &title, None, &empty) };
    let menu = NSMenu::initWithTitle(mtm.alloc(), &title);
    menu.setAutoenablesItems(false);

    for entry in group.items {
        let child = match entry {
            SelectionItem::Group(nested) => submenu(mtm, source, nested),
            SelectionItem::Command { label, id, enabled, checked } => {
                let this = mtm.alloc::<SelectionMenuItem>().set_ivars(CommandTarget {
                    window: source.window.clone(),
                    event: CommandEvent { request_id: source.request_id, id },
                });
                let label = NSString::from_str(&label);
                // SAFETY: The menu retains the item, which serves as its own action target.
                let child: Retained<SelectionMenuItem> = unsafe {
                    let child: Retained<SelectionMenuItem> = msg_send![super(this), initWithTitle: &*label, action: sel!(runSelectionCommand:), keyEquivalent: &*empty];
                    child.setTarget(Some(&child));
                    child
                };
                child.setEnabled(enabled);
                if checked == Some(true) {
                    child.setState(NSControlStateValueOn);
                }
                Retained::into_super(child)
            }
        };
        menu.addItem(&child);
    }
    item.setSubmenu(Some(&menu));
    item
}

fn webkit_action(menu: &NSMenu, tag: isize) -> Option<Retained<NSMenuItem>> {
    (0..menu.numberOfItems())
        .filter_map(|index| menu.itemAtIndex(index))
        .find(|item| item.action() == Some(sel!(forwardContextMenuAction:)) && item.tag() == tag)
}

fn remove_font_menu(menu: &NSMenu) {
    // The submenu itself has no WebKit tag. Its Underline action identifies it
    // independently of the system language.
    if let Some(index) = (0..menu.numberOfItems()).find(|&index| {
        menu.itemAtIndex(index)
            .and_then(|item| item.submenu())
            .is_some_and(|submenu| webkit_action(&submenu, UNDERLINE).is_some())
    }) {
        menu.removeItemAtIndex(index);
    }
}

fn add_selection_menu(view: *mut AnyObject, menu: &NSMenu) {
    let Some(mut source) = SELECTION_MENU.take().filter(|source| {
        source.view == view as usize && source.opened_at.elapsed() < Duration::from_secs(2)
    }) else {
        return;
    };
    // A context event in an editable selection normally supplies WebKit's Cut command.
    if !webkit_action(menu, CUT).is_some_and(|item| item.isEnabled()) {
        return;
    }
    let mtm = MainThreadMarker::from(menu);
    let mut groups = std::mem::take(&mut source.groups).into_iter();
    let Some(format) = groups.next() else { return };
    menu.insertItem_atIndex(&submenu(mtm, &source, format), 0);
    if !menu.itemAtIndex(1).is_some_and(|item| item.isSeparatorItem()) {
        menu.insertItem_atIndex(&NSMenuItem::separatorItem(mtm), 1);
    }
    // A selection in a table may also offer table actions below the native items.
    if groups.len() > 0 {
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        for group in groups {
            menu.addItem(&submenu(mtm, &source, group));
        }
    }
}

unsafe extern "C-unwind" fn will_open_menu(
    view: *mut AnyObject,
    _: Sel,
    menu: *mut NSMenu,
    event: *mut NSEvent,
) {
    if let Some(&superclass) = WEBVIEW_SUPERCLASS.get() {
        // SAFETY: The superclass inherits NSView's willOpenMenu:withEvent:.
        let _: () = unsafe { msg_send![super(view, superclass), willOpenMenu: menu, withEvent: event] };
    }
    // SAFETY: AppKit provides the live menu for the duration of this callback.
    if let Some(menu) = unsafe { menu.as_ref() } {
        remove_font_menu(menu);
        add_selection_menu(view, menu);
    }
}

pub fn install(window: &tauri::WebviewWindow) {
    let result = window.with_webview(|platform| {
        // SAFETY: Tauri provides a live WKWebView on the main thread for this callback.
        let view = unsafe { &*platform.inner().cast::<AnyObject>() };
        let class = view.class();
        let selector = sel!(willOpenMenu:withEvent:);
        let Some(superclass) = class.superclass() else {
            return;
        };
        let Some(inherited_method) = superclass.instance_method(selector) else {
            return;
        };
        if WEBVIEW_SUPERCLASS.set(superclass).is_err() {
            return;
        }
        // SAFETY: Wry's web-view class inherits this NSView callback. The replacement
        // has the inherited ABI. class_addMethod leaves any class-defined method in place.
        let installed = unsafe {
            let implementation = std::mem::transmute::<WillOpenMenu, Imp>(will_open_menu);
            ffi::class_addMethod(
                (class as *const AnyClass).cast_mut(),
                selector,
                implementation,
                ffi::method_getTypeEncoding(inherited_method),
            )
        };
        if !installed.as_bool() {
            eprintln!("Could not add the macOS context menu filter to the web-view class");
        }
    });
    if let Err(error) = result {
        eprintln!("Could not install macOS context menu filter: {error}");
    }
}
