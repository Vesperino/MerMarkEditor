import { computed } from 'vue';
import { useI18n, type Locale } from './index';

const en = {
  file: 'File', edit: 'Edit', format: 'Format', insert: 'Insert', view: 'View',
  presentation: 'Presentation', help: 'Help', window: 'Window',
  bold: 'Bold', italic: 'Italic', strike: 'Strikethrough',
  inlineCode: 'Inline Code', bulletList: 'Bullet List', orderedList: 'Numbered List',
  taskList: 'Task List', blockquote: 'Quote', codeBlock: 'Code Block',
  horizontalRule: 'Horizontal Line', pageBreak: 'Page Break', link: 'Link', image: 'Image',
  customize: 'Customize Layout…', restore: 'Restore Default Layout…',
  presets: 'Layout preset', full: 'Full', minimal: 'Minimal', custom: 'Custom',
  fullDescription: 'All editing controls in the toolbar.',
  minimalDescription: 'Workspace, statistics, zoom, AI, and editor mode in the bottom bar. Everything else stays in the menus.',
  menuHint: 'Hidden controls remain available in the application menus.',
  replaceTitle: 'Replace custom layout?',
  replaceMessage: 'Applying this preset replaces your current control placements. Your other settings will stay the same.',
  apply: 'Apply preset', zoomReset: 'Actual Size', reload: 'Reload from Disk',
  cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
  newWindow: 'New Window', closeWindow: 'Close Window', tokens: 'Show Token Count',
};
type MenuLabels = typeof en;
const labels: Record<Locale, MenuLabels> = {
  en,
  pl: {
    file: 'Plik', edit: 'Edycja', format: 'Format', insert: 'Wstaw', view: 'Widok',
    presentation: 'Prezentacja', help: 'Pomoc', window: 'Okno',
    bold: 'Pogrubienie', italic: 'Kursywa', strike: 'Przekreślenie',
    inlineCode: 'Kod w tekście', bulletList: 'Lista punktowana', orderedList: 'Lista numerowana',
    taskList: 'Lista zadań', blockquote: 'Cytat', codeBlock: 'Blok kodu',
    horizontalRule: 'Linia pozioma', pageBreak: 'Podział strony', link: 'Link', image: 'Obrazek',
    customize: 'Dostosuj układ…', restore: 'Przywróć domyślny układ…',
    presets: 'Układ interfejsu', full: 'Pełny', minimal: 'Minimalny', custom: 'Własny',
    fullDescription: 'Wszystkie narzędzia edycji na pasku.',
    minimalDescription: 'Obszar roboczy, statystyki, powiększenie, AI i tryb edytora na dolnym pasku. Pozostałe funkcje są dostępne w menu.',
    menuHint: 'Ukryte narzędzia pozostają dostępne w menu aplikacji.',
    replaceTitle: 'Zastąpić własny układ?',
    replaceMessage: 'Wybrany układ zastąpi obecne rozmieszczenie narzędzi. Pozostałe ustawienia nie zmienią się.',
    apply: 'Zastosuj układ', zoomReset: 'Rzeczywisty rozmiar', reload: 'Wczytaj ponownie z dysku',
    cut: 'Wytnij', copy: 'Kopiuj', paste: 'Wklej', selectAll: 'Zaznacz wszystko',
    newWindow: 'Nowe okno', closeWindow: 'Zamknij okno', tokens: 'Pokaż liczbę tokenów',
  },
  'zh-CN': {
    file: '文件', edit: '编辑', format: '格式', insert: '插入', view: '视图',
    presentation: '演示文稿', help: '帮助', window: '窗口',
    bold: '粗体', italic: '斜体', strike: '删除线',
    inlineCode: '行内代码', bulletList: '无序列表', orderedList: '有序列表',
    taskList: '任务列表', blockquote: '引用', codeBlock: '代码块',
    horizontalRule: '水平线', pageBreak: '分页符', link: '链接', image: '图片',
    customize: '自定义布局…', restore: '恢复默认布局…',
    presets: '布局预设', full: '完整', minimal: '精简', custom: '自定义',
    fullDescription: '在工具栏显示所有编辑工具。',
    minimalDescription: '在底部栏显示工作区、统计、缩放、AI 和编辑模式控件。其他功能仍可通过菜单访问。',
    menuHint: '隐藏的工具仍可通过应用菜单访问。',
    replaceTitle: '替换自定义布局？',
    replaceMessage: '应用此预设将替换当前控件的位置。其他设置将保持不变。',
    apply: '应用预设', zoomReset: '实际大小', reload: '从磁盘重新加载',
    cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
    newWindow: '新建窗口', closeWindow: '关闭窗口', tokens: '显示 Token 数量',
  },
};
export function useMenuLabels() {
  const { locale } = useI18n();
  return computed(() => labels[locale.value]);
}
