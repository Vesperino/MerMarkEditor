<p align="center">
  <img src="assets/mermark-banner.jpeg" alt="MerMark Editor - Mermaid Markdown 编辑器" width="600">
</p>

<p align="center">
  <strong>现代化、开源的 Markdown 编辑器，内置 Mermaid 图表支持</strong>
</p>

<p align="center">
  <a href="https://github.com/Vesperino/MerMarkEditor/releases"><img src="https://img.shields.io/github/v/release/Vesperino/MerMarkEditor?style=flat" alt="发布"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/blob/master/LICENSE"><img src="https://img.shields.io/github/license/Vesperino/MerMarkEditor?style=flat" alt="许可证"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/stargazers"><img src="https://img.shields.io/github/stars/Vesperino/MerMarkEditor?style=flat" alt="星标"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/releases"><img src="https://img.shields.io/github/downloads/Vesperino/MerMarkEditor/total?style=flat&color=brightgreen&cacheSeconds=300" alt="下载量"></a>
  <a href="https://buymeacoffee.com/vesperinio"><img src="https://img.shields.io/badge/%E8%AF%B7%E6%88%91%E5%96%9D%E5%92%96%E5%95%A1-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black" alt="请我喝咖啡"></a>
</p>

<p align="center">
  <a href="#本地-ai-助手">AI 助手</a> •
  <a href="#演示文稿-marp">演示文稿</a> •
  <a href="#功能">功能</a> •
  <a href="#截图">截图</a> •
  <a href="#安装">安装</a> •
  <a href="#使用">使用</a> •
  <a href="#开发">开发</a>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="README_PL.md">Polski</a> •
  <strong>中文</strong>
</p>

---

## 为什么选择 MerMark Editor？

**MerMark Editor** 将 Markdown 的简洁性与 Mermaid 图表的强大功能融合在一个精美的原生桌面应用中。非常适合开发者、技术作者，以及任何需要使用流程图、时序图和其他可视化内容编写文档的人。

### 主要优势

- **无云端依赖** - 文档完全保留在你的电脑上
- **原生性能** - 基于 Tauri 构建，快速且轻量
- **所见即所得编辑** - 边输入边查看格式化内容
- **Mermaid 集成** - 直接在文档中创建图表
- **Marp 演示文稿** - 用 Markdown 制作幻灯片，支持实时预览和全屏演示
- **多根工作区** - 打开一个或多个文件夹；AI 自动将其作为只读上下文范围
- **本地 AI 助手** - 与 Claude 或 Codex 对话来处理你的笔记，AI 会直接编辑文件
- **跨平台** - 支持 Windows、macOS 和 Linux

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.6/ui-light-mode.png" alt="MerMark — Minimal 主题与工作区侧栏" width="48%" />
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.6/ui-with-ai-panel.png" alt="MerMark — 同样的布局，AI 助手停靠在右侧" width="48%" />
</p>

---

## 演示文稿 (Marp)

把任意笔记变成幻灯片。新建文件时选择 *Marp 演示文稿*（或打开已有的演示稿），用纯 Markdown 编写幻灯片，并在编辑器旁实时查看渲染效果。专用工具栏可以添加幻灯片、切换主题、设置单页布局、添加背景、开关页码、调整字号，然后全屏演示。

<p align="center">
  <img src="assets/screenshots/marp-presentation.png" alt="MerMark — Marp 演示文稿与编辑器旁的实时幻灯片预览" width="90%" />
</p>

- **实时分屏预览** - 左侧编辑，右侧查看真实幻灯片，滚动同步
- **带预览的主题** - gaia、default、uncover；从图形缩略图中选择
- **本地与网络图片** - 在实时预览和导出中都能显示
- **全屏演示** - 用方向键、点击或自动切换

---

## 本地 AI 助手

如果你已经在为 **Claude Code** 或 **OpenAI Codex** 付费 — 或两者都有 — MerMark 直接把这份订阅接进编辑器。AI 面板使用你已经登录的 `claude` 和 `codex` CLI，每次请求都走你已经付费的账户。无需生成 API 密钥。无需第二份账单。你和服务商之间没有任何代理。

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/ai-panel-overview.png" alt="AI 面板概览" />
  <br>
  <em>AI 面板停靠在编辑器旁，包含模型选择器、会话下拉、固定的片段以及实时上下文使用条</em>
</p>

### 使用你已有的订阅

- **Claude Code 或 Codex 的 Pro/Plus 计划** — MerMark 使用该登录，无需额外账户。
- **无需管理 API 令牌** — CLI 处理鉴权，MerMark 永远看不到你的密钥。
- **直连服务商** — 请求从你的机器直接到 Anthropic 或 OpenAI；中间没有任何中间人。
- **零遥测** — 除了你自己也能在终端运行的 CLI 调用，编辑器不会再泄露任何数据。
- **逐轮切换提供商** — 一条聊天选 Claude，下一条选 Codex；两者都在同一个面板里配置好。

### 它能做什么

- **直接编辑你的 markdown** — "用更友好的语气重写这一段"、"提取行动项"、"翻译成英文"。原子地写入磁盘；编辑器自动重新加载。
- **跨你授权的文件夹读取** — 在访问图中指向项目文件夹，AI 就能看到昨天的笔记、术语表、风格指南。
- **修改同级文件** — 把长文档拆成多份笔记、在源文件旁生成摘要、为某个文件夹建立 TOC 文件。
- **搜索网络** — 打开 `network` 工具开关，需要新信息时启用。
- **执行 shell 命令** — 可选的 `bash` 开关，用于 grep 笔记、运行构建或任何终端任务。默认关闭。
- **每次 AI 写入自动生成快照** — 结果不满意时一键 **撤销**。

### 多片段选择与图片附件

- 在 Visual *和* Code 视图中固定一个或多个高亮片段。
- AI 只会收到这些片段，而不是整篇文档。
- 关闭 **Send** 可以保留固定片段但本次不发送。
- 粘贴截图（`Ctrl+V`）、拖放图片，或从磁盘选择文件。
- 每张图最大 8 MB，支持 png / jpg / gif / webp / bmp。
- Claude 和 Codex 都能看到图片。
- 已发送的图片以缩略图形式保留在聊天记录里 — 你能清楚记得传过什么。

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/pin-multi-fragments.png" alt="固定多个片段" />
  <br>
  <em>发送前固定多个高亮片段 — 每个片段都以编号 chip 的形式出现在 composer 里</em>
</p>

### 工具调用在聊天中可见

- 模型调用的每个工具都以虚线 chip 的形式内联显示在记录里。
- chip 上带有工具名以及参数的一行预览。
- 点击展开格式化的 JSON 完整调用视图。
- 涵盖 Read、Edit、Write、Bash、WebFetch、codex shell — 全部覆盖。

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/tool-chips.png" alt="工具调用 chip" />
  <br>
  <em>AI 使用的每个工具（Read、Edit、Write、Bash、WebFetch ……）都会作为可展开的 chip 内联显示</em>
</p>

### 每文档独立会话，并完整恢复上下文

- 每个文档都有自己的可滚动会话历史。
- **+** 归档当前对话并新开一个。
- 每个文档最多 50 个会话，存储在 `localStorage` 中。
- 重新打开旧会话会恢复你之前使用的 CLI、模型和推理强度。

### 安全性、可审计性、按文档的访问控制

- 每文档独立的访问图：明确的读路径、写路径、工具开关。
- 通过 **+ File** 添加文件，**+ Folder** 添加整个文件夹。
- 编辑前快照自动轮转（默认 3 个 + 已固定），一键 **撤销**。
- 状态栏指示器：绿色 / 红色 / 闪烁红色（bypass 启用）。
- 仅追加的审计日志记录每一次 AI 操作，可在 Settings 中查看。

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/access-map.png" alt="访问图编辑器" />
  <br>
  <em>每文档访问图 — 显式的读 / 写路径加上工具开关</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/snapshots.png" alt="快照历史" />
  <br>
  <em>快照历史 — 还原、固定、导出或删除编辑前的版本</em>
</p>

### 两个提供商，一个面板

- 在聊天 header 中切换 `claude` / `codex`。
- 每个 CLI 的默认设置会持久化（最近的模型、最近的 effort）。
- Token 流式输出，第一段返回前显示思考指示器。
- 分段上下文使用条 — input、cache、free — 直接来自 CLI 报告的用量。
- 可点击链接通过编辑器的外链确认对话框打开。
- 发送快捷键：`Ctrl+Enter`（Win/Linux）、`Cmd+Enter`（macOS）。
- 最小化到侧边 tab、全屏、关闭 — 都在面板 header 里。

### 在 Mermaid 图表中使用 AI

- 在任意图表（或全屏编辑）中点击 **AI** — 主面板自动将图表源码作为只读上下文固定，并把 preamble 切换到 mermaid-edit 模式。
- 同一个面板、同一个模型选择器、同一种你处理散文时使用的多轮对话。
- 每条助手回复都会被解析出 `mermaid` 代码块，并实时渲染替代已保存的图表。
- 面板 chip 中显示 **Apply ✓ / Discard × / Stop** 按钮；Apply 提交到节点，Discard 继续迭代，Stop 结束会话。

完整功能列表 — 包含快照轮转、崩溃会话的 tmp 恢复、多窗口安全的流式输出和按 CLI 隔离会话 — 详见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

---

## 功能

### Markdown 编辑
- 完整支持 **GitHub Flavored Markdown** (GFM)
- **WYSIWYG 编辑器** 带实时预览
- 代码块**语法高亮**（50+ 种语言）
- 表格、任务列表、引用块等
- **键盘快捷键** 提高编辑效率
- **可配置内边距** — Settings 中的顶部、两侧、底部滑块

### Mermaid 图表
- **流程图**、**时序图**、**类图**、**状态图**、**ER 图**、**甘特图**、**饼图** 以及许多其他图表类型
- **可调整大小** - 拖动右侧边缘设置自定义宽度（持久化到 markdown）
- **可调整分屏** - 全屏编辑中拖动代码与预览面板之间的分隔条
- **AI 辅助** - 在任意图表上点击 AI，主 AI 面板将以图表为上下文接管
- **快速模板** — flowchart / sequence / class / state / ER / Gantt / pie / mindmap 一键插入

### 演示文稿 (Marp)
- **Marp 演示稿** - 新建文件时选择 *Marp 演示文稿*，或打开已有的演示稿
- **实时分屏预览** - 左侧编辑，右侧渲染幻灯片，滚动同步
- **演示工具栏** - 添加幻灯片、切换主题（gaia / default / uncover）并预览、设置单页布局、添加背景、页码、宽高比和字号
- **全屏演示** - 方向键、点击或自动切换
- **图片** - 本地文件和网络 URL 在预览和导出中均可显示

### 工作区
- **多根侧栏** — 打开一个或多个文件夹；每个都有自己的可折叠区段，包含独立的文件树
- **文件树** — 展开 / 折叠文件夹、在标签中打开文件、OS 级 reveal、重命名、删除、新建文件 / 文件夹
- **AI 看到工作区** — 工作区根目录自动作为只读范围加入 AI preamble
- **快速切换器**（`Ctrl+Shift+E`）— 工作区、文件、活动工作区中的全文 grep
- **拖动重新排序** 工作区；展开的文件夹在会话之间保留

### 导出与集成
- **导出 PDF** — 接近所见即所得：与编辑器相同的衬线字体和缩放、带语法高亮的代码块、coral 行内代码、根据内容自适应的表格
- **保存为 Markdown** (.md 文件)，简洁可移植
- 编辑器内边距设置会转换成 PDF 边距

### 用户体验
- **标签 + pin / context menu** — Pin / Unpin / Close / Close others / Close all but pinned / Close saved
- **深色 / 浅色主题** 加上 **Minimal 主题变体**（Mermaid 标志色：teal + coral 配 slate）
- **Word 风格的缩放滑块** 在状态栏 — `±` 按钮 + 百分比读数
- **字符 / 单词 / 行 / token 计数器** 作为单一可移动单元
- **样式化的 prompt / confirm 对话框** 全程使用（不再有原生浏览器弹窗）
- **自动保存** - 不会丢失工作
- **多语言界面** - 英语、波兰语、中文
- **快捷键速查模态** - 所有快捷键的快速参考 (`Ctrl+/`)

### 高级功能
- **分屏视图** - 并排编辑两个文档，分屏比例可调
- **标签对比** - 左右两个面板文档的 diff 比较 (`Ctrl+Shift+C`)
- **变更追踪** - 查看自上次保存以来的所有改动 (`Ctrl+Shift+D`)
- **代码视图** - 在可视化 WYSIWYG 与原始 Markdown 之间切换，并跟踪光标位置
- **AI Token 计数器** - 估算 GPT (OpenAI)、Claude (Anthropic) 和 Gemini (Google) 的 token 数
- **多窗口支持** - 打开多个独立的编辑器窗口
- **跨窗口标签管理** - 在面板与窗口之间拖放标签
- **文件监听** - 自动检测外部文件变更并重新加载内容
- **冲突检测** - 当本地与外部都有改动时显示内联 diff
- **手动重新加载** - 通过 `Ctrl+R` 从磁盘重新加载文件

---

## 截图

<p align="center">
<img width="3835" height="2071" alt="深色模式" src="https://github.com/user-attachments/assets/6dae5f4b-28b0-4803-9f07-9ac8b71581bb" />
  <br>
  <em>深色模式</em>
</p>

<p align="center">
<img width="3837" height="2071" alt="简洁界面" src="https://github.com/user-attachments/assets/ce4bbd47-5df3-445a-af3a-b13cadf5db3f" />
  <br>
  <em>简洁、极简的界面，配以直观的工具栏</em>
</p>

<p align="center">
<img width="3840" height="2078" alt="多标签编辑" src="https://github.com/user-attachments/assets/f8e5ef5b-bc36-45b6-8019-29c22f9aee48" />
  <br>
  <em>多标签编辑、格式化文档与可点击的目录</em>
</p>

<p align="center">
  <img width="3828" height="2075" alt="C4 架构图" src="https://github.com/user-attachments/assets/8d911a3a-e5e6-40dc-8d17-7e624a8c17c9" />
  <br>
  <em>带缩放控件和全屏模式的 C4 架构图</em>
</p>

<p align="center">
 <img width="3820" height="2038" alt="全屏图表视图" src="https://github.com/user-attachments/assets/21d560c1-25bd-41a0-b1ed-83e356ff26d3" />
  <br>
  <em>带 400% 缩放的全屏图表视图，便于细节查看</em>
</p>

<p align="center">
  <img width="1578" height="742" alt="代码与文档" src="https://github.com/user-attachments/assets/5969be85-95a1-4199-a378-cfeb6075c48d" />
  <br>
  <em>带代码块和嵌入图表的技术文档</em>
</p>

<p align="center">
<img width="3831" height="2081" alt="分屏视图" src="https://github.com/user-attachments/assets/6fb41a24-958e-42c6-a56a-81ecf0d72a9d" />
  <br>
  <em>用于同时编辑两个文档的分屏视图</em>
</p>

<p align="center">
<img width="3830" height="2072" alt="标签对比" src="https://github.com/user-attachments/assets/804dfb96-9d84-4bd6-ad3d-b6d0a8dbca06" />
  <br>
  <em>并排比较文档，按行高亮 diff</em>
</p>

<p align="center">
<img width="3822" height="2073" alt="变更追踪" src="https://github.com/user-attachments/assets/e4d2fcc5-d1a4-41f0-b7c7-16a389801206" />
  <br>
  <em>查看自上次保存以来的所有改动，包括新增和删除</em>
</p>

<p align="center">
<img width="3836" height="2076" alt="代码视图" src="https://github.com/user-attachments/assets/c4823de1-4b66-4065-8c66-15b184d8619e" />
  <br>
  <em>在可视化与 Markdown 代码视图间切换，并跟踪光标</em>
</p>

<p align="center">
<img width="3834" height="1633" alt="键盘快捷键" src="https://github.com/user-attachments/assets/4594b71c-cb50-479d-ba8c-dd053efd34db" />
  <br>
  <em>所有键盘快捷键的快速参考 (Ctrl+/)</em>
</p>

<p align="center">
<img width="829" height="306" alt="AI Token 计数器" src="https://github.com/user-attachments/assets/8ffcf467-f02a-41e2-bda6-dda4fa44322d" />
  <br>
  <em>支持模型选择的 AI Token 计数器（GPT、Claude、Gemini）</em>
</p>

<p align="center">
<img width="3019" height="1565" alt="多窗口" src="https://github.com/user-attachments/assets/a28effaa-3e5b-4a9b-8b58-7fb4f4053d15" />
  <br>
  <em>支持跨窗口拖放标签的多窗口编辑</em>
</p>

---

## 安装

### 下载

从 [发布页面](https://github.com/Vesperino/MerMarkEditor/releases) 下载最新版本。

| 平台    | 下载                                                                                          |
|---------|-----------------------------------------------------------------------------------------------|
| Windows | [.exe / .msi 安装程序](https://github.com/Vesperino/MerMarkEditor/releases/latest)             |
| macOS   | [.dmg（通用：Apple Silicon + Intel）](https://github.com/Vesperino/MerMarkEditor/releases/latest) |
| Linux   | [.deb / .AppImage](https://github.com/Vesperino/MerMarkEditor/releases/latest)                |

### 重要说明

本应用是开源软件且未进行代码签名。操作系统在首次启动时可能会显示安全警告：

- **Windows**（SmartScreen）：点击「更多信息」→「仍要运行」
- **macOS**：右键点击应用 →「打开」→「打开」绕过 Gatekeeper

这是开源软件在没有付费代码签名证书的情况下分发时的标准行为。本仓库中的源代码完全可供审阅。

### 系统需求

- **Windows**：Windows 10 或更高版本（64 位）
- **macOS**：macOS 10.15 (Catalina) 或更高版本
- **Linux**：Ubuntu 22.04+ 或同等版本（需要 WebKitGTK 4.1）

---

## 使用

### 基本编辑

1. **打开文件**：`Ctrl+O`（macOS 上为 `Cmd+O`）
2. **保存**：`Ctrl+S`（保存为 Markdown）
3. **另存为**：`Ctrl+Shift+S`
4. **导出 PDF**：点击工具栏中的 PDF 按钮

### 键盘快捷键

| 操作 | 快捷键 |
|------|--------|
| 新建文件 | `Ctrl+N` |
| 打开文件 | `Ctrl+O` |
| 保存 | `Ctrl+S` |
| 另存为 | `Ctrl+Shift+S` |
| 导出 PDF | `Ctrl+P` |
| 撤销 | `Ctrl+Z` |
| 重做 | `Ctrl+Y` |
| 加粗 | `Ctrl+B` |
| 斜体 | `Ctrl+I` |
| 显示变更 | `Ctrl+Shift+D` |
| 标签对比 | `Ctrl+Shift+C` |
| 重新加载文件 | `Ctrl+R` |
| 关闭标签 | `Ctrl+W` |
| 下一个标签 | `Ctrl+Tab` |
| 上一个标签 | `Ctrl+Shift+Tab` |
| 跳到标签 1–9 | `Ctrl+1` … `Ctrl+9` |
| 切换 代码 / 可视化 视图 | `Ctrl+Shift+V` |
| 放大 / 缩小 | `Ctrl++` / `Ctrl+-` |
| 重置缩放 | `Ctrl+0` |
| 设置 | `Ctrl+,` |
| 键盘快捷键 | `Ctrl+/` |
| 关闭模态 | `Escape` |

> 在 macOS 上，使用 `⌘`（Cmd）替代 `Ctrl`。

### 创建 Mermaid 图表

点击工具栏中的 **Mermaid** 按钮或键入：

~~~markdown
```mermaid
graph LR
    A[开始] --> B[处理]
    B --> C[结束]
```
~~~

这会创建一个流程图：

```
[开始] --> [处理] --> [结束]
```

### 支持的图表类型

- `graph` / `flowchart` - 流程图
- `sequenceDiagram` - 时序图
- `classDiagram` - 类图
- `stateDiagram-v2` - 状态图
- `erDiagram` - 实体关系图
- `gantt` - 甘特图
- `pie` - 饼图
- `journey` - 用户旅程图
- `gitgraph` - Git 图
- `mindmap` - 思维导图
- `timeline` - 时间线

---

## 开发

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)（用于 Tauri）
- [pnpm](https://pnpm.io/)（推荐）

### 配置

```bash
# 克隆仓库
git clone https://github.com/Vesperino/MerMarkEditor.git
cd MerMarkEditor

# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri dev

# 生产构建
pnpm tauri build
```

### 运行测试

```bash
# 运行测试
pnpm test

# 运行一次测试
pnpm test:run
```

### 技术栈

- **前端**：Vue 3 + TypeScript
- **编辑器**：TipTap（基于 ProseMirror）
- **图表**：Mermaid.js
- **桌面**：Tauri 2.0
- **构建**：Vite

---

## 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 仓库
2. 创建你的功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交你的修改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 开启一个 Pull Request

---

## 许可证

本项目基于 **MIT 许可证** - 详情请参阅 [LICENSE](LICENSE) 文件。

---

## 致谢

- [Codycody31](https://github.com/Codycody31) - 非常感谢对 macOS 与 Linux 的支持！
- [TipTap](https://tiptap.dev/) - Headless 编辑器框架
- [Mermaid](https://mermaid.js.org/) - 图表与流程图工具
- [Tauri](https://tauri.app/) - 桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架

---

## 支持

MerMark 现在以及未来都将基于 MIT 许可证保持免费与开源。如果你觉得这个项目有用，欢迎：

- 在 GitHub 上点亮星标
- 报告 bug 与提出新功能建议
- 为代码库做出贡献
- [请我喝杯咖啡](https://buymeacoffee.com/vesperinio) — 完全自愿，如果 MerMark 帮你节省了时间，可以这样表示感谢

<p align="center">
  <a href="https://buymeacoffee.com/vesperinio">
    <img src="https://img.shields.io/badge/%E8%AF%B7%E6%88%91%E5%96%9D%E5%92%96%E5%95%A1-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black" alt="请我喝咖啡" />
  </a>
</p>

---

<p align="center">
  由 <a href="https://github.com/Vesperino">Vesperino</a> 用 ❤️ 制作
</p>
