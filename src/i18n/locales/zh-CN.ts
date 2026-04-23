import type { Translations } from '../index';

const zhCN: Translations = {
  appName: 'MerMark 编辑器',

  // Toolbar - File operations
  new: '新建',
  open: '打开',
  save: '保存',
  saveAs: '另存为',
  exportPdf: 'PDF',

  // Toolbar - Edit operations
  undo: '撤销',
  redo: '重做',

  // Toolbar - Text styles
  paragraph: '段落',
  heading: '标题',
  headingLevel: (level: number) => `标题 ${level}`,

  // Toolbar - Formatting
  bold: 'B',
  boldTooltip: '加粗 **文本** (Ctrl+B)',
  italic: 'I',
  italicTooltip: '斜体 *文本* (Ctrl+I)',
  strikethrough: 'S',
  strikethroughTooltip: '删除线 ~~文本~~',
  inlineCode: '代码',
  inlineCodeTooltip: '行内代码 `代码`',

  // Toolbar - Lists
  bulletList: '无序列表 - 项目',
  orderedList: '有序列表 1. 项目',
  taskList: '任务列表 - [x] 任务',

  // Toolbar - Blocks
  blockquote: '引用 > 文本',
  codeBlock: '代码块 ```代码```',
  horizontalRule: '水平线 ---',

  // Toolbar - Links & Media
  link: '链接 [文本](网址)',
  linkPrompt: '链接地址：',
  image: '图片 ![替代文本](网址)',
  imagePrompt: '图片地址：',
  imageFromUrl: '从网址',
  imageFromFile: '从文件',

  // Toolbar - Table
  table: 'Markdown 表格',
  insertTable: '插入表格',
  addRowAbove: '在上方添加行',
  addRowBelow: '在下方添加行',
  addColumnBefore: '在前方添加列',
  addColumnAfter: '在后方添加列',
  deleteRow: '删除行',
  deleteColumn: '删除列',
  deleteTable: '删除表格',

  // Toolbar - Mermaid
  mermaid: 'Mermaid',
  insertMermaid: '插入 Mermaid 图表',

  // Toolbar - Footnotes
  footnote: '脚注',
  insertFootnote: '插入脚注',
  footnotes: '脚注',
  addFootnote: '添加脚注',
  deleteFootnotes: '删除所有脚注',
  noFootnotes: '没有脚注。点击 + 添加一个。',
  footnoteContentPlaceholder: '脚注文本...',
  footnoteBacklink: '跳转到引用',

  // Toolbar - Code View
  codeView: '代码',
  visualView: '可视化',

  // Toolbar - Split View
  splitView: '分屏',
  singleView: '单屏',

  // Toolbar - Diff Preview
  changes: '更改',
  noChanges: '无更改',
  closeDiff: '关闭',
  compareTabs: '对比',
  compareTabsTooltip: '对比左右标签页 (Ctrl+Shift+C)',

  // Keyboard Shortcuts
  keyboardShortcuts: '键盘快捷键',
  shortcutAction: '操作',
  shortcutKey: '快捷键',
  nextTab: '下一个标签页',
  previousTab: '上一个标签页',
  jumpToTab: '跳转到标签页 1–9',
  toggleCodeView: '切换代码 / 可视视图',
  zoomInOut: '放大 / 缩小',
  resetZoom: '重置缩放',

  // Stats
  stats: '统计',
  characters: '字符',
  words: '字数',
  tokens: 'Token',
  tokensTooltip: 'AI 模型的预估 Token 数（点击切换模型）',

  // Editor
  placeholder: '开始输入或粘贴文本...',

  // Dialogs
  unsavedChanges: '未保存的更改',
  unsavedChangesMessage: '此文档有未保存的更改。是否在关闭前保存？',
  dontSave: '不保存',
  cancel: '取消',
  saveAndClose: '保存并关闭',

  // Tabs
  newDocument: '新建文档',
  closeTab: '关闭标签页',
  closeTabTooltip: '关闭标签页 (Ctrl+W)',

  // Mermaid Node
  editDiagram: '编辑',
  saveDiagram: '保存',
  cancelEdit: '取消',
  diagramError: '图表渲染错误',
  printScale: 'PDF',
  diagramSize: '尺寸',
  templates: '模板',
  basic: '基础',
  deleteDiagram: '删除',
  moreTemplates: '更多模板...',
  mermaidDiagramTemplates: 'Mermaid 图表模板',
  enterMermaidCode: '输入 Mermaid 代码...',
  zoomIn: '放大',
  zoomOut: '缩小',
  reset: '重置',
  fit: '适应',
  fullscreen: '全屏',
  close: '关闭',

  // Template categories
  categoryBasic: '基础',
  categoryStatesProcesses: '状态与流程',
  categoryDataRelations: '数据与关系',
  categoryGitRequirements: 'Git 与需求',
  categoryC4Model: 'C4 模型',
  categoryAdvanced: '高级',

  // File dialogs
  openFile: '打开 Markdown 文件',
  saveFile: '保存 Markdown 文件',
  markdownFiles: 'Markdown 文件',
  allFiles: '所有文件',

  // Settings
  settings: '设置',
  autoSave: '自动保存',
  autoSaveOn: '开',
  autoSaveOff: '关',
  wordWrap: '自动换行',
  dropFilesHere: '将 .md 文件拖放至此',
  editorFont: '编辑器字体',
  codeFont: '代码字体',
  lineHeight: '行高',
  spellcheck: '拼写检查',
  expandTabs: '展开标签页以显示完整名称',
  appearance: '外观',
  editor: '编辑器',
  code: '代码',
  general: '通用',
  on: '开',
  off: '关',
  language: '语言',

  // Update dialog
  updateAvailable: '有可用更新',
  newVersionAvailable: '有新版本可用：',
  downloadingUpdate: '正在下载更新...',
  later: '稍后',
  updating: '正在更新...',
  updateNow: '立即更新',
  whatsNew: '新功能',
  whatsNewIn: '新功能 -',
  loadingChangelog: '正在加载更新日志...',
  changelogError: '无法加载更新日志。',

  // Split view / Panes
  dragTabHere: '将标签页拖放至此',
  orOpenFileInPane: '或在此面板中打开文件',
  dropTabHere: '将标签页放置于此',

  // Save confirm dialog
  fileHasUnsavedChanges: (fileName: string) => `文件"${fileName}"有未保存的更改。`,
  saveBeforeClosing: '是否在关闭前保存？',
  discard: '丢弃',

  // External link dialog
  openExternalLink: '打开外部链接',
  confirmNavigateTo: '确定要导航至：',
  openLink: '打开',

  // Editor Zoom
  zoom: '缩放',

  // Theme
  darkMode: '深色',
  lightMode: '浅色',

  // File watching & conflict
  fileReloadedExternally: (fileName: string) => `"${fileName}" 已被外部更新并重新加载。`,
  fileReloaded: '文件已从磁盘重新加载。',
  fileReloadError: '无法从磁盘重新加载文件。',
  fileChangedExternally: '文件已被外部修改',
  fileConflictMessage: '文件在编辑器外部被修改，且您有未保存的更改。',
  keepMyChanges: '保留我的更改',
  loadExternalVersion: '加载外部版本',
  externalChanges: '外部更改',
  reloadFile: '重新加载文件',
  preSaveConflict: '文件已修改',
  preSaveConflictMessage: '自上次加载或保存以来，文件已被外部修改。',
  saveAnyway: '仍然保存',
  fileDeletedExternally: (fileName: string) => `"${fileName}" 已被外部删除。`,

  // Table of Contents
  tableOfContents: '目录',
  tocTooltip: '目录 (Ctrl+Shift+T)',
  tocEmpty: '未找到标题。添加标题（H1-H6）以查看目录。',

  // Merge editor
  diffView: '差异',
  mergeView: '合并',
  acceptAllExternal: '接受所有外部更改',
  rejectAllExternal: '拒绝所有外部更改',
  mergeHint: '选择要保留的外部更改',
  unchangedLines: '未更改的行',
  collapseLines: '折叠',
  changeHunk: '更改',
  keepOriginal: '保留我的',
  acceptExternal: '接受外部',
  changesAccepted: '个更改已接受',
  applyMerge: '应用合并',

  // Layout customization
  layout: '布局',
  topToolbar: '顶部工具栏',
  bottomStatusBar: '底部状态栏',
  leftSidebar: '左侧边栏',
  hiddenItems: '隐藏项目',
  resetLayout: '恢复默认',
  layoutDescription: '拖动项目到不同区域以自定义布局',
  moveTo: '移动到',

  // Fonts
  systemFonts: '系统字体',
  otherFonts: '其他字体',

  // Session
  recentFiles: '最近文件',
  clearRecentFiles: '清除最近文件',
  noRecentFiles: '暂无最近文件',
  restoreSession: '恢复上次会话',
};

export default zhCN;
