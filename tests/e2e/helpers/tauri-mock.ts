import type { Page } from '@playwright/test';

/**
 * Virtual file system state passed from the test via exposeFunction.
 * We use page.exposeFunction so the browser-side script can call back into
 * Node.js to read/write the shared mock state.
 */
export interface MockFs {
  [path: string]: string;
}

/**
 * Sets up Tauri IPC mocks and a virtual file system before the page loads.
 *
 * The virtual FS is backed by a plain object in Node land so tests can
 * inspect what was written without going through the UI.
 */
export async function setupTauriMocks(
  page: Page,
  opts: {
    /** Initial file system contents */
    initialFs?: MockFs;
    /** Initial file path to report from get_open_file_path (or null) */
    openFilePath?: string | null;
    /** App version string */
    version?: string;
  } = {},
): Promise<{
  /** Inspect current virtual FS state from a test */
  getFs: () => MockFs;
  /** Inspect IPC calls log from a test */
  getCalls: () => Array<{ cmd: string; args: unknown }>;
}> {
  const fs: MockFs = { ...(opts.initialFs ?? {}) };
  const calls: Array<{ cmd: string; args: unknown }> = [];

  // Expose Node-side functions so the browser script can call them
  await page.exposeFunction('__mockFsRead', (path: string): string => {
    calls.push({ cmd: 'read', args: path });
    if (!(path in fs)) throw new Error(`ENOENT: ${path}`);
    return fs[path];
  });

  await page.exposeFunction('__mockFsWrite', (path: string, content: string): void => {
    calls.push({ cmd: 'write', args: { path, content } });
    fs[path] = content;
  });

  await page.exposeFunction('__mockFsRename', (from: string, to: string): void => {
    calls.push({ cmd: 'rename', args: { from, to } });
    if (!(from in fs)) throw new Error(`ENOENT rename: ${from}`);
    fs[to] = fs[from];
    delete fs[from];
  });

  await page.exposeFunction('__mockFsRemove', (path: string): void => {
    calls.push({ cmd: 'remove', args: path });
    delete fs[path];
  });

  await page.exposeFunction('__mockFsExists', (path: string): boolean => {
    return path in fs;
  });

  await page.exposeFunction('__mockFsWatch', (): void => {
    // no-op watcher
  });

  // NOTE: dialogSavePath is intentionally NOT exposed via page.exposeFunction
  // because exposeFunction creates immutable bindings that can't be overridden
  // from tests. Instead, we use a plain window variable set in addInitScript,
  // which tests can override via page.evaluate.

  const openFilePath = opts.openFilePath ?? null;
  const version = opts.version ?? '0.0.0-test';

  // Inject mock __TAURI_INTERNALS__ before the app JS runs
  await page.addInitScript(
    ({ openFilePath, version }: { openFilePath: string | null; version: string }) => {
      // Helper to resolve a promise from a window-exposed async Node function
      const call = (fn: string, ...args: unknown[]): Promise<unknown> =>
        (window as Record<string, unknown>)[fn]?.(...args) as Promise<unknown>;

      // Mutable dialog save path — tests override this via page.evaluate
      // Using a plain window variable (NOT page.exposeFunction) so it can be reassigned
      (window as Record<string, unknown>).__mockDialogSavePath = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: 'main' },
          windows: [{ label: 'main' }],
        },

        transformCallback(callback: (data: unknown) => unknown, once: boolean) {
          const id = Math.random();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any)[`_cb_${id}`] = once
            ? (data: unknown) => { callback(data); delete (window as any)[`_cb_${id}`]; }
            : callback;
          return id;
        },

        async invoke(cmd: string, args: Record<string, unknown> | Uint8Array = {}, options: Record<string, unknown> = {}) {
          // ── fs plugin ──────────────────────────────────────────────
          if (cmd === 'plugin:fs|read_text_file') {
            const path = (args as Record<string, unknown>).path as string;
            const content = await call('__mockFsRead', path) as string;
            // Return as array of bytes (Uint8Array.from works on iterable of numbers)
            return Array.from(new TextEncoder().encode(content));
          }
          if (cmd === 'plugin:fs|write_text_file') {
            // plugin-fs v2: body = Uint8Array, path in options.headers.path (URL-encoded)
            const headers = (options as Record<string, unknown>)?.headers as Record<string, string> | undefined;
            const path = decodeURIComponent(headers?.path ?? '');
            const content = new TextDecoder().decode(args as Uint8Array);
            return call('__mockFsWrite', path, content);
          }
          if (cmd === 'plugin:fs|rename') {
            const a = args as Record<string, unknown>;
            return call('__mockFsRename', a.oldPath ?? a.from, a.newPath ?? a.to);
          }
          if (cmd === 'plugin:fs|remove') {
            return call('__mockFsRemove', (args as Record<string, unknown>).path);
          }
          if (cmd === 'plugin:fs|exists') {
            return call('__mockFsExists', (args as Record<string, unknown>).path);
          }
          if (cmd === 'plugin:fs|watch' || cmd === 'plugin:fs|unwatch') {
            return call('__mockFsWatch');
          }

          // ── dialog plugin ──────────────────────────────────────────
          if (cmd === 'plugin:dialog|open') {
            return null; // no file selected
          }
          if (cmd === 'plugin:dialog|save') {
            // Read the mutable path variable (overridable from tests via page.evaluate)
            return (window as Record<string, unknown>).__mockDialogSavePath ?? null;
          }

          // ── shell plugin ───────────────────────────────────────────
          if (cmd === 'plugin:shell|open') {
            return undefined;
          }

          // ── updater ────────────────────────────────────────────────
          if (cmd.startsWith('plugin:updater')) return null;

          // ── core app ───────────────────────────────────────────────
          if (cmd === 'plugin:app|version' || cmd === 'app_get_version') return version;

          // ── event system ──────────────────────────────────────────
          if (cmd === 'plugin:event|listen') return 1; // return numeric event ID
          if (cmd === 'plugin:event|unlisten') return undefined;
          if (cmd === 'plugin:event|emit' || cmd === 'plugin:event|emit_to') return undefined;

          // ── window commands ────────────────────────────────────────
          if (cmd === 'plugin:window|set_title' || cmd === 'plugin:core|set_title') return undefined;
          if (cmd === 'plugin:window|is_maximized') return false;
          if (cmd === 'plugin:window|maximize' || cmd === 'plugin:window|unmaximize') return undefined;
          if (cmd === 'plugin:window|close' || cmd === 'plugin:window|destroy') return undefined;
          if (cmd.startsWith('plugin:window|')) return undefined;

          // ── deep-link / process ────────────────────────────────────
          if (cmd.startsWith('plugin:deep-link') || cmd.startsWith('plugin:process')) return null;

          // ── custom Rust commands ───────────────────────────────────
          if (cmd === 'get_open_file_path') return openFilePath;
          if (cmd === 'register_open_file' || cmd === 'unregister_open_file' || cmd === 'check_file_open' || cmd === 'get_window_for_file' || cmd === 'focus_window_with_file' || cmd === 'get_current_window_label' || cmd === 'unregister_window_files') {
            return null;
          }

          // Fallback
          console.warn(`[TauriMock] Unhandled IPC: ${cmd}`, args);
          return null;
        },

        // Minimal event system
        event: {
          listen: async () => () => {},
          emit: async () => {},
          once: async () => () => {},
        },
      };
    },
    { openFilePath, version },
  );

  return {
    getFs: () => ({ ...fs }),
    getCalls: () => [...calls],
  };
}
