use std::cell::RefCell;
use std::collections::HashMap;
use std::time::{Duration, Instant};

use tauri::{Emitter, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Controller, ICoreWebView2ContextMenuItem, ICoreWebView2ContextMenuItemCollection,
    ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2Deferral, ICoreWebView2Environment,
    ICoreWebView2Environment9, ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_CHECK_BOX, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU,
};
use webview2_com::{ContextMenuRequestedEventHandler, CustomItemSelectedEventHandler};
use windows::core::{Interface, Result, BOOL, HSTRING};
use windows::Win32::System::Com::IStream;

use super::{CommandEvent, MenuGroup, Pending, Prepared, SelectionItem};

// The frontend answers every right-click, so this only bounds a lost reply.
const WAIT: Duration = Duration::from_millis(200);

struct Deferred {
    args: ICoreWebView2ContextMenuRequestedEventArgs,
    deferral: ICoreWebView2Deferral,
}

struct Webview {
    environment: ICoreWebView2Environment9,
    pending: Pending<Deferred>,
}

thread_local! {
    static WEBVIEWS: RefCell<HashMap<String, Webview>> = RefCell::new(HashMap::new());
}

fn release(waiter: Option<Deferred>) {
    if let Some(Deferred { deferral, .. }) = waiter {
        // SAFETY: The deferral belongs to the menu request of this UI thread.
        let _ = unsafe { deferral.Complete() };
    }
}

unsafe fn item(
    environment: &ICoreWebView2Environment9,
    label: &str,
    kind: COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND,
) -> Result<ICoreWebView2ContextMenuItem> {
    // An ampersand marks the access key of a WebView2 menu label.
    let label = HSTRING::from(label.replace('&', "&&"));
    environment.CreateContextMenuItem(&label, None::<&IStream>, kind)
}

unsafe fn submenu(
    environment: &ICoreWebView2Environment9,
    window: &WebviewWindow,
    request_id: u32,
    group: MenuGroup,
) -> Result<ICoreWebView2ContextMenuItem> {
    let menu = item(environment, &group.label, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU)?;
    let children = menu.Children()?;
    for (index, entry) in (0u32..).zip(group.items) {
        let child = match entry {
            SelectionItem::Group(nested) => submenu(environment, window, request_id, nested)?,
            SelectionItem::Command { label, id, enabled, checked } => {
                let kind = if checked.is_some() {
                    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_CHECK_BOX
                } else {
                    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND
                };
                let child = item(environment, &label, kind)?;
                child.SetIsEnabled(enabled)?;
                child.SetIsChecked(checked == Some(true))?;
                let window = window.clone();
                let event = CommandEvent { request_id, id };
                let handler = CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                    let _ = window.emit_to(window.label(), "mermark:selection-command", event.clone());
                    Ok(())
                }));
                let mut token = 0;
                child.add_CustomItemSelected(&handler, &mut token)?;
                child
            }
        };
        children.InsertValueAtIndex(index, &child)?;
    }
    Ok(menu)
}

unsafe fn is_separator(items: &ICoreWebView2ContextMenuItemCollection, index: u32) -> Result<bool> {
    let mut count = 0;
    items.Count(&mut count)?;
    if index >= count {
        return Ok(false);
    }
    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
    items.GetValueAtIndex(index)?.Kind(&mut kind)?;
    Ok(kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR)
}

unsafe fn add_selection_menu(
    environment: &ICoreWebView2Environment9,
    window: &WebviewWindow,
    args: &ICoreWebView2ContextMenuRequestedEventArgs,
    menu: Prepared,
) -> Result<()> {
    let mut groups = menu.groups.into_iter();
    let Some(format) = groups.next() else { return Ok(()) };
    let format = submenu(environment, window, menu.request_id, format)?;
    let rest = groups
        .map(|group| submenu(environment, window, menu.request_id, group))
        .collect::<Result<Vec<_>>>()?;

    let items = args.MenuItems()?;
    items.InsertValueAtIndex(0, &format)?;
    if !is_separator(&items, 1)? {
        items.InsertValueAtIndex(1, &item(environment, "", COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR)?)?;
    }
    if !rest.is_empty() {
        let mut count = 0;
        items.Count(&mut count)?;
        items.InsertValueAtIndex(count, &item(environment, "", COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR)?)?;
        for (index, group) in (count + 1..).zip(rest) {
            items.InsertValueAtIndex(index, &group)?;
        }
    }
    Ok(())
}

unsafe fn editable_selection(args: &ICoreWebView2ContextMenuRequestedEventArgs) -> Result<bool> {
    let target = args.ContextMenuTarget()?;
    let (mut editable, mut selection) = (BOOL::default(), BOOL::default());
    target.IsEditable(&mut editable)?;
    target.HasSelection(&mut selection)?;
    Ok(editable.as_bool() && selection.as_bool())
}

fn open(window: &WebviewWindow, args: ICoreWebView2ContextMenuRequestedEventArgs) {
    // SAFETY: WebView2 provides live event arguments for the duration of this callback.
    let selection = unsafe { editable_selection(&args) }.unwrap_or(false);
    let Some((environment, fresh, stale)) = WEBVIEWS.with_borrow_mut(|webviews| {
        let webview = webviews.get_mut(window.label())?;
        let (fresh, stale) = webview.pending.take(Instant::now());
        Some((webview.environment.clone(), fresh, stale))
    }) else {
        return;
    };
    release(stale);
    if !selection {
        return;
    }
    if let Some(menu) = fresh {
        // SAFETY: The arguments stay valid while this callback runs.
        if let Err(error) = unsafe { add_selection_menu(&environment, window, &args, menu) } {
            eprintln!("Could not extend the context menu: {error}");
        }
        return;
    }
    // SAFETY: A deferral keeps the arguments usable until it is completed.
    let Ok(deferral) = (unsafe { args.GetDeferral() }) else { return };
    let waiter = Deferred { args, deferral };
    let generation = WEBVIEWS.with_borrow_mut(|webviews| match webviews.get_mut(window.label()) {
        Some(webview) => Ok(webview.pending.wait(waiter)),
        None => Err(waiter),
    });
    let generation = match generation {
        Ok(generation) => generation,
        Err(waiter) => return release(Some(waiter)),
    };
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(WAIT).await;
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            release(WEBVIEWS.with_borrow_mut(|webviews| {
                webviews.get_mut(target.label())?.pending.expire(generation)
            }));
        });
    });
}

pub(super) fn receive(window: &WebviewWindow, menu: Prepared) -> tauri::Result<()> {
    let target = window.clone();
    window.run_on_main_thread(move || answer(&target, menu))
}

fn answer(window: &WebviewWindow, menu: Prepared) {
    let Some((environment, waiting)) = WEBVIEWS.with_borrow_mut(|webviews| {
        let webview = webviews.get_mut(window.label())?;
        Some((webview.environment.clone(), webview.pending.receive(menu)))
    }) else {
        return;
    };
    if let Some((waiter, menu)) = waiting {
        // SAFETY: The pending deferral keeps the menu request alive until release.
        if let Err(error) = unsafe { add_selection_menu(&environment, window, &waiter.args, menu) } {
            eprintln!("Could not extend the context menu: {error}");
        }
        release(Some(waiter));
    }
}

unsafe fn register(
    window: WebviewWindow,
    controller: ICoreWebView2Controller,
    environment: ICoreWebView2Environment,
) -> Result<()> {
    let webview = controller.CoreWebView2()?.cast::<ICoreWebView2_11>()?;
    let environment = environment.cast::<ICoreWebView2Environment9>()?;
    let label = window.label().to_owned();
    let handler = ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
        if let Some(args) = args {
            open(&window, args);
        }
        Ok(())
    }));
    let mut token = 0;
    webview.add_ContextMenuRequested(&handler, &mut token)?;
    WEBVIEWS.with_borrow_mut(|webviews| {
        webviews.insert(label, Webview { environment, pending: Pending::default() })
    });
    Ok(())
}

pub(crate) fn install(window: &WebviewWindow) {
    let owner = window.clone();
    let result = window.with_webview(move |platform| {
        // SAFETY: Tauri provides the live WebView2 controller on its UI thread.
        if let Err(error) = unsafe { register(owner, platform.controller(), platform.environment()) } {
            eprintln!("Could not install the selection context menu: {error}");
        }
    });
    if let Err(error) = result {
        eprintln!("Could not install the selection context menu: {error}");
    }
}
