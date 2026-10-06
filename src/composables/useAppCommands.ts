import { computed, inject, onScopeDispose, ref, watch, type InjectionKey, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { EditorView } from '@codemirror/view';
import { undo, redo, undoDepth, redoDepth, selectAll, toggleBlockComment } from '@codemirror/commands';
import { useToolbarActions } from './useToolbarActions';
import { useLayoutConfig } from './useLayoutConfig';
import { useRecentFiles } from './useRecentFiles';
import { useWorkspace } from './useWorkspace';
import { useSettings } from './useSettings';
import { useMenuLabels } from '../i18n/menus';
import { formatSource, selectNextOccurrence } from '../utils/source-commands';
import { t } from '../i18n';

export interface AppCommand {
  id: string;
  label: string;
  accelerator?: string;
  aliases?: string[];
  enabled: boolean;
  checked?: boolean;
  run: () => unknown;
}
export interface CommandMenu { label: string; items: (AppCommand | CommandMenu)[] }
export interface CommandContext {
  codeView: boolean; splitEditor: boolean; splitView: boolean; hasDocument: boolean;
  canDiff: boolean; canCompare: boolean; diff: boolean; toc: boolean; ai: boolean;
  marp: boolean; marpPreview: boolean; modal: boolean;
}
export interface AppCommands {
  menus: Ref<CommandMenu[]>;
  execute: (id: string) => Promise<void>;
  enabled: (id: string) => boolean;
}
export const appCommandsKey: InjectionKey<AppCommands> = Symbol('appCommands');
export const useAppCommandDispatcher = () => inject(appCommandsKey, null);

/** A menu item and its toolbar counterpart always use the same applicability check. */
export function createDispatcher(find: (id: string) => AppCommand | undefined) {
  const pending = new Set<string>();
  return async (id: string) => {
    const command = find(id);
    if (!command?.enabled || pending.has(id)) return;
    pending.add(id);
    try { await command.run(); } finally { pending.delete(id); }
  };
}

export function useAppCommands(options: {
  editor: Ref<Editor | null>;
  context: () => CommandContext;
  actions: Record<string, (...args: any[]) => unknown>;
}) {
  const a = useToolbarActions(options.editor);
  const labels = useMenuLabels();
  const layout = useLayoutConfig();
  const recent = useRecentFiles();
  const workspace = useWorkspace();
  const { settings, toggleShowTokenCount } = useSettings();
  const revision = ref(0);
  const refresh = () => { revision.value++; };
  // Transactions include selection-only changes, without serializing the document.
  watch(options.editor, (editor, _, cleanup) => {
    editor?.on('transaction', refresh);
    cleanup(() => editor?.off('transaction', refresh));
    refresh();
  }, { immediate: true });
  document.addEventListener('focusin', refresh);
  document.addEventListener('selectionchange', refresh);
  document.addEventListener('input', refresh);
  onScopeDispose(() => {
    document.removeEventListener('focusin', refresh);
    document.removeEventListener('selectionchange', refresh);
    document.removeEventListener('input', refresh);
  });
  function focusedCodeEditor() {
    const node = document.activeElement?.closest('.cm-editor');
    return node ? EditorView.findFromDOM(node as HTMLElement) : null;
  }
  function textHistory(direction: 'undo' | 'redo') {
    const code = focusedCodeEditor();
    if (code) { (direction === 'undo' ? undo : redo)(code); return; }
    const el = document.activeElement;
    if (el?.matches('input, textarea') || (el?.closest('[contenteditable="true"]') && !el.closest('.tiptap'))) {
      document.execCommand(direction); return;
    }
    if (!options.context().codeView && !options.context().splitEditor && !options.context().modal) {
      options.editor.value?.chain().focus()[direction]().run();
    }
  }
  function canHistory(direction: 'undo' | 'redo') {
    const code = focusedCodeEditor();
    if (code) return (direction === 'undo' ? undoDepth : redoDepth)(code.state) > 0;
    if (document.activeElement?.matches('input, textarea')) return document.queryCommandEnabled?.(direction) ?? true;
    return !options.context().modal && !options.context().codeView && !options.context().splitEditor &&
      !!options.editor.value?.can()[direction]();
  }
  const menus = computed<CommandMenu[]>(() => {
    void revision.value;
    const c = options.context(), l = labels.value, tr = t.value;
    const inputFocused = !!document.activeElement?.matches('input, textarea') || !!document.activeElement?.closest('.cm-editor');
    const visual = c.hasDocument && !!options.editor.value && !c.codeView && !c.splitEditor && !c.modal && !inputFocused;
    const doc = c.hasDocument && !c.modal;
    const code = focusedCodeEditor();
    const source = doc && !!code;
    const formatting = visual || source;
    const sourceHeading = code?.state.doc.lineAt(code.state.selection.main.head).text.match(/^ {0,3}(#{1,6})(?:\s|$)/)?.[1].length ?? 0;
    const command = (id: string, label: string, run?: () => unknown, enabled = !c.modal, accelerator?: string, checked?: boolean): AppCommand =>
      ({ id, label, run: run ?? (() => options.actions[id]?.()), enabled, accelerator, checked });
    const edit = (id: string, label: string, run: () => unknown, active?: string): AppCommand =>
      command(id, label, () => {
        if (source && code && (id === 'bold' || id === 'italic' || id === 'link')) {
          const url = id === 'link' ? window.prompt(tr.linkPrompt) : '';
          if (url !== null) formatSource(code, id, url);
        } else run();
      }, ['bold', 'italic', 'link'].includes(id) ? formatting : visual,
      id === 'bold' ? 'CmdOrCtrl+B' : id === 'italic' ? 'CmdOrCtrl+I' : id === 'link' ? 'CmdOrCtrl+K' : undefined,
      active ? visual && a.isActive(active) : undefined);
    const invoke = (id: string, ...args: unknown[]) => () => options.actions[id]?.(...args);
    const chain = (fn: (editor: Editor) => void) => () => a.runCommand(fn);
    const menu = (label: string, items: (AppCommand | CommandMenu)[]): CommandMenu => ({ label, items });
    return [
      menu(l.file, [
        command('new-file', tr.new, undefined, !c.modal, 'CmdOrCtrl+N'),
        command('new-window', l.newWindow, undefined, !c.modal, 'CmdOrCtrl+Shift+N'),
        command('open-file', tr.openFile, undefined, !c.modal, 'CmdOrCtrl+O'),
        command('open-workspace', tr.openFolder),
        menu(tr.recentFiles, [
          ...recent.recentFiles.value.map(f => command(`recent-file:${f.filePath}`, f.fileName, invoke('open-recent', f.filePath))),
          command('clear-recent-files', tr.clearRecentFiles, recent.clearRecentFiles, !c.modal && recent.recentFiles.value.length > 0),
        ]),
        menu(tr.recentWorkspaces, [
          ...workspace.recentWorkspaces.value.map(w => command(`recent-workspace:${w}`, w, invoke('open-recent-workspace', w))),
          command('clear-recent-workspaces', tr.clearRecentFiles, workspace.clearRecents, !c.modal && workspace.recentWorkspaces.value.length > 0),
        ]),
        command('save-file', tr.save, undefined, doc, 'CmdOrCtrl+S'),
        command('save-file-as', tr.saveAs, undefined, doc, 'CmdOrCtrl+Shift+S'),
        command('reload-file', l.reload, undefined, doc, 'CmdOrCtrl+R'),
        command('export-pdf', `${tr.exportPdf}…`, undefined, doc),
        command('export-docx', `${tr.exportDocx}…`, undefined, doc),
        command('close-tab', tr.closeTab, undefined, doc, 'CmdOrCtrl+W'),
        command('close-window', l.closeWindow, undefined, !c.modal, 'CmdOrCtrl+Shift+W'),
      ]),
      menu(l.edit, [
        command('undo', tr.undo, () => textHistory('undo'), canHistory('undo'), 'CmdOrCtrl+Z'),
        command('redo', tr.redo, () => textHistory('redo'), canHistory('redo'), /Mac/.test(navigator.platform) ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y'),
        command('cut', l.cut, () => document.execCommand('cut'), true),
        command('copy', l.copy, () => document.execCommand('copy'), true),
        command('paste', l.paste, () => document.execCommand('paste'), true),
        command('select-all', l.selectAll, () => {
          const code = focusedCodeEditor();
          if (code) selectAll(code); else document.execCommand('selectAll');
        }, true),
        command('find', tr.documentSearch, undefined, doc, 'CmdOrCtrl+F'),
        command('find-next', tr.documentSearchNext, undefined, doc, 'CmdOrCtrl+G'),
        command('find-previous', tr.documentSearchPrevious, undefined, doc, 'CmdOrCtrl+Shift+G'),
        command('replace', tr.replace, undefined, doc, /Mac/.test(navigator.platform) ? 'CmdOrCtrl+Alt+F' : 'CmdOrCtrl+H'),
        command('toggle-comment', tr.toggleComment, () => { if (code) toggleBlockComment(code); }, source, 'CmdOrCtrl+/'),
        command('select-next-occurrence', tr.selectNextOccurrence, () => { if (code) selectNextOccurrence(code); }, source, 'CmdOrCtrl+D'),
        command('show-settings', `${tr.settings}…`, undefined, true, 'CmdOrCtrl+Comma'),
      ]),
      menu(l.format, [
        menu(tr.heading, Array.from({ length: 7 }, (_, level) => command(`heading:${level}`, level ? tr.headingLevel(level) : tr.paragraph,
          () => { if (source && code) formatSource(code, level); else a.setHeading(level); }, formatting, level ? `CmdOrCtrl+${level}` : undefined, source ? sourceHeading === level : level ? a.isActive('heading', { level }) : a.isActive('paragraph')))),
        edit('bold', l.bold, chain(e => { e.chain().focus().toggleBold().run(); }), 'bold'),
        edit('italic', l.italic, chain(e => { e.chain().focus().toggleItalic().run(); }), 'italic'),
        edit('strikethrough', l.strike, chain(e => { e.chain().focus().toggleStrike().run(); }), 'strike'),
        edit('inline-code', l.inlineCode, chain(e => { e.chain().focus().toggleCode().run(); }), 'code'),
        edit('bullet-list', l.bulletList, chain(e => { e.chain().focus().toggleBulletList().run(); }), 'bulletList'),
        edit('ordered-list', l.orderedList, chain(e => { e.chain().focus().toggleOrderedList().run(); }), 'orderedList'),
        edit('task-list', l.taskList, chain(e => { e.chain().focus().toggleTaskList().run(); }), 'taskList'),
        edit('blockquote', l.blockquote, chain(e => { e.chain().focus().toggleBlockquote().run(); }), 'blockquote'),
      ]),
      menu(l.insert, [
        edit('link', l.link, a.setLink),
        menu(l.image, [edit('image-url', tr.imageFromUrl, a.insertImageFromUrl), edit('image-file', tr.imageFromFile, a.insertImageFromFile)]),
        menu(tr.table, [
          edit('insert-table', tr.insertTable, a.insertTable),
          ...([
            ['row-before', tr.addRowAbove, a.addRowBefore], ['row-after', tr.addRowBelow, a.addRowAfter],
            ['column-before', tr.addColumnBefore, a.addColumnBefore], ['column-after', tr.addColumnAfter, a.addColumnAfter],
            ['delete-row', tr.deleteRow, a.deleteRow], ['delete-column', tr.deleteColumn, a.deleteColumn], ['delete-table', tr.deleteTable, a.deleteTable],
          ] as const).map(([id, label, run]) => command(id, label, run, visual && a.isActive('table'))),
        ]),
        edit('code-block', l.codeBlock, chain(e => { e.chain().focus().toggleCodeBlock().run(); })),
        edit('mermaid', tr.insertMermaid, a.insertMermaid), edit('footnote', tr.insertFootnote, a.insertFootnote),
        edit('math-inline', tr.mathInline, () => a.insertMath(false)), edit('math-block', tr.mathBlock, () => a.insertMath(true)),
        edit('horizontal-rule', l.horizontalRule, chain(e => { e.chain().focus().setHorizontalRule().run(); })),
        edit('page-break', l.pageBreak, chain(e => { e.chain().focus().insertContent({ type: 'pageBreak' }).run(); })),
      ]),
      menu(l.view, [
        command('toggle-workspace-sidebar', tr.workspace, workspace.toggleSidebarVisible, !c.modal, 'CmdOrCtrl+Shift+B', workspace.sidebarVisible.value),
        { ...command('command-palette', tr.commandPalette, undefined, !c.modal, 'CmdOrCtrl+Shift+P'), aliases: ['F1'] },
        command('quick-open', tr.quickOpen, undefined, !c.modal, 'CmdOrCtrl+P'),
        command('workspace-search', tr.searchWorkspace, undefined, !c.modal, 'CmdOrCtrl+Shift+F'),
        command('go-to-heading', tr.goToHeading, undefined, doc, 'CmdOrCtrl+Shift+O'),
        command('next-tab', tr.nextTab, undefined, doc, 'Control+Tab'),
        command('previous-tab', tr.previousTab, undefined, doc, 'Control+Shift+Tab'),
        menu(tr.jumpToTab, Array.from({ length: 9 }, (_, i) => command(`tab:${i}`, `${tr.jumpToTab}: ${i + 1}`, invoke('select-tab', i), doc, `CmdOrCtrl+Alt+${i + 1}`))),
        command('workspace-switcher', tr.searchWorkspace, undefined, !c.modal, 'CmdOrCtrl+Shift+E'),
        command('toggle-toc', tr.tableOfContents, undefined, visual, 'CmdOrCtrl+Shift+T', c.toc),
        command('toggle-code-view', tr.codeView, undefined, doc && !c.splitEditor, 'CmdOrCtrl+Shift+V', c.codeView),
        command('toggle-split-view', tr.splitView, undefined, visual, undefined, c.splitView),
        command('toggle-split-editor', tr.splitEditor, undefined, doc && !c.splitView, undefined, c.splitEditor),
        command('toggle-diff', tr.changes, undefined, visual && c.canDiff, 'CmdOrCtrl+Shift+D', c.diff),
        command('compare-tabs', tr.compareTabs, undefined, visual && c.canCompare, 'CmdOrCtrl+Shift+C'),
        command('ai-toggle', tr.aiToggleTooltip, undefined, !c.modal, undefined, c.ai),
        menu(tr.zoom, [command('zoom-in', tr.zoomIn, a.zoomIn, !c.modal, 'CmdOrCtrl+Plus'), command('zoom-out', tr.zoomOut, a.zoomOut, !c.modal, 'CmdOrCtrl+-'), command('zoom-reset', l.zoomReset, a.resetZoom, !c.modal, 'CmdOrCtrl+0')]),
        menu(tr.stats, [
          command('toggle-stats', tr.stats, () => layout.toggleVisibility('stats'), !c.modal, undefined, !layout.itemsForZone('hidden').value.some(p => p.id === 'stats')),
          command('toggle-tokens', l.tokens, toggleShowTokenCount, !c.modal, undefined, settings.value.showTokenCount),
          ...a.availableModels.map(model => command(`token-model:${model.id}`, model.name, () => a.changeModel(model.id), !c.modal, undefined, a.currentModel.value === model.id)),
        ]),
        command('customize-layout', l.customize, undefined, true), command('restore-layout', l.restore, undefined, true),
      ]),
      menu(l.presentation, [
        command('present-marp', tr.presentMarp, undefined, doc),
        command('marp-new-slide', tr.marpBarNewSlide, undefined, visual && c.marp),
        menu(tr.marpBarTheme, ['gaia', 'default', 'uncover'].map(v => command(`marp-theme:${v}`, v, invoke('marp-theme', v), visual && c.marp))),
        menu(tr.marpBarLayout, ['lead', 'invert', ''].map(v => command(`marp-layout:${v}`, v || tr.marpBarLayoutDefault, invoke('marp-layout', v), visual && c.marp))),
        menu(tr.marpBarBackground, [
          ...(['', 'left', 'right'] as const).map((pos, i) => command(`marp-bg:${pos}`, [tr.marpBgLocalFull, tr.marpBgLocalLeft, tr.marpBgLocalRight][i], invoke('marp-bg', { source: 'local', pos }), visual && c.marp)),
          command('marp-bg:url', tr.marpBgUrl, invoke('marp-bg', { source: 'url', pos: '' }), visual && c.marp),
        ]),
        command('marp-paginate', tr.marpBarPaginate, undefined, visual && c.marp),
        menu(tr.marpBarSize, ['16:9', '4:3'].map(v => command(`marp-size:${v}`, v, invoke('marp-size', v), visual && c.marp))),
        menu(tr.marpBarFont, [0, 18, 22, 26, 32].map(v => command(`marp-font:${v}`, v ? `${v}px` : tr.marpFontDefault, invoke('marp-font', v), visual && c.marp))),
        command('marp-preview', tr.marpBarPreview, undefined, visual && c.marp, undefined, c.marpPreview),
      ]),
      menu(l.help, [command('show-shortcuts', tr.keyboardShortcuts, undefined, true), command('whats-new', tr.whatsNew, undefined, !c.modal)]),
    ];
  });
  const all = computed(() => {
    const result = new Map<string, AppCommand>();
    function visit(items: (AppCommand | CommandMenu)[]) {
      for (const item of items) { if ('items' in item) visit(item.items); else result.set(item.id, item); }
    }
    for (const menu of menus.value) visit(menu.items);
    return result;
  });
  const execute = createDispatcher(id => all.value.get(id));
  return { menus, all, execute, enabled: (id: string) => all.value.get(id)?.enabled ?? false, refresh };
}
