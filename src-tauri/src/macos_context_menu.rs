use std::sync::OnceLock;

use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{ffi, msg_send, sel};
use objc2_app_kit::{NSEvent, NSMenu};

static WEBVIEW_SUPERCLASS: OnceLock<&'static AnyClass> = OnceLock::new();

type WillOpenMenu = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut NSMenu, *mut NSEvent);

// WebCore ContextMenuAction tags forwarded by WKMenuTarget. The native panels
// require editing to be enabled for the entire web view.
// https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ContextMenuItem.h
const SHOW_FONTS: isize = 41;
const SHOW_STYLES: isize = 46;
const SHOW_COLORS: isize = 47;

fn remove_unsupported_items(menu: &NSMenu) {
    let mut removed_item = false;
    for index in (0..menu.numberOfItems()).rev() {
        let Some(item) = menu.itemAtIndex(index) else {
            continue;
        };
        if item.action() == Some(sel!(forwardContextMenuAction:))
            && matches!(item.tag(), SHOW_FONTS | SHOW_STYLES | SHOW_COLORS)
        {
            menu.removeItemAtIndex(index);
            removed_item = true;
        } else if let Some(submenu) = item.submenu() {
            remove_unsupported_items(&submenu);
        }
    }
    // Show Fonts is followed by a separator at the top of the Font submenu.
    if removed_item
        && menu.numberOfItems() > 0
        && menu.itemAtIndex(0).is_some_and(|item| item.isSeparatorItem())
    {
        menu.removeItemAtIndex(0);
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
        remove_unsupported_items(menu);
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
