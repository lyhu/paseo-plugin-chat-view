# Paseo Plugin: chat-view

[English](README.md) | [简体中文](README_zh.md)

> 专注于提升长对话阅读与调试效率的 Paseo 界面增强插件：提供**当前轮次提问智能吸顶**、**思考与工具调用紧凑聚合**以及 **Mermaid 图表交互式渲染**。

---

## 目录

- [核心特性概览](#核心特性概览)
- [平台支持与兼容性矩阵](#平台支持与兼容性矩阵)
- [宿主配置前置要求](#宿主配置前置要求)
- [快速开始](#快速开始)
  - [安装与加载](#安装与加载)
  - [日常维护命令](#日常维护命令)
- [功能模块详解](#功能模块详解)
  - [1. 提问智能吸顶 (Sticky Questions)](#1-提问智能吸顶-sticky-questions)
  - [2. 紧凑活动聚合 (Compact Activity)](#2-紧凑活动聚合-compact-activity)
  - [3. Mermaid 交互图表 (Mermaid Diagrams)](#3-mermaid-交互图表-mermaid-diagrams)
  - [4. 提示词增强 (Prompt Enhancement)](#4-提示词增强-prompt-enhancement)
- [插件配置指南](#插件配置指南)
- [架构设计与技术边界](#架构设计与技术边界)
- [项目结构](#项目结构)
- [本地开发与测试](#本地开发与测试)
- [致谢与开源许可](#致谢与开源许可)

---

## 核心特性概览

| 功能模块                | 说明                                                                                         | 交互亮点                                                               |
| :---------------------- | :------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| 📌 **智能提问吸顶**     | 在长对话滚动浏览时，将当前阅读轮次的用户提问固定在视口顶部。                                 | 100ms 视口防抖、原生视觉继承、默认三行并可点击整条展开、一键复制全文。 |
| ⚡ **紧凑活动展示**     | 默认按 compact-agent-activity 的 Folded 模式显示单行活动摘要，点击后直接展开思考与工具详情。 | 平滑思考文字、点击展开命令输出、代码 Diff 与首帧语法高亮。             |
| 📊 **Mermaid 图表渲染** | 内置 Mermaid 解析与渲染引擎，自动将代码块渲染为高质量可视化图表。                            | 支持 25%–400% 自由缩放、自适应宽度、源码/图表无缝切换、全屏弹窗预览。  |
| ✨ **提示词增强**       | 把输入框里的模糊诉求改写为「目标 / 范围 / 约束 / 验收」四要素完整的可执行提示词并回填。      | 一键增强、结合当前项目环境、再次点击可撤销原文。                       |

> [!NOTE]
> **设计哲学**：保持零后端侵入，严格基于 Paseo 公开 SDK 构建；用户提问与普通助手回答均完整保留 Paseo 原生分叉与复制功能。

---

## 平台支持与兼容性矩阵

| 平台 / 运行环境                 | 智能提问吸顶 | 紧凑活动聚合 | Mermaid 图表渲染 | 体验增强细节                                                    |
| :------------------------------ | :----------: | :----------: | :--------------: | :-------------------------------------------------------------- |
| **桌面端 (Electron / Desktop)** |   ✅ 支持    |   ✅ 支持    |     ✅ 支持      | DOM 级行间距紧缩、图片自适应约束（最大 440 × 320）              |
| **Web 浏览器**                  |   ✅ 支持    |   ✅ 支持    |     ✅ 支持      | 完整的视口监测与 DOM 交互能力                                   |
| **原生移动端 (iOS / Android)**  | ⏸️ 暂不支持  |   ✅ 支持    |    ✅ 支持\*     | 基于标准 React Native 构建；无 DOM 行距微调（真机待进一步验收） |

> [!WARNING]
> **插件互斥提醒**：
> 请勿与 `compact-agent-activity`、`reasoning-display` 或独立的 `paseo-plugin-mermaid` 同时启用，以免多重消息转换器互相冲突或覆盖。

---

## 宿主配置前置要求

为了让紧凑活动聚合正常解析工具调用的完整参数与执行结果，必须调整 Paseo 宿主设置：

> [!IMPORTANT]
> 请前往 Paseo 宿主配置，将 **Tool call detail** 设置为 **Detailed**。<br>
> _若设置为 `Overview`，宿主系统会在插件接管前预先合并工具项，导致紧凑活动详情无法正确采集数据。_

---

## 快速开始

### 安装与加载

本插件为本地源码包，通过 Paseo CLI 直接安装：

```bash
# 1. 本地安装插件（指定当前目录或插件绝对路径）
paseo plugin install .
# 或：paseo plugin install /path/to/paseo-plugin-chat-view

# 2. 检查安装与运行状态
paseo plugin ls chat-view
```

安装完成后，打开或刷新任意 Agent 对话窗口即可生效。

### 日常维护命令

- **热重载插件**（修改源码后即时生效，**严禁重启 6767 宿主守护进程**）：
  ```bash
  paseo plugin reload chat-view
  ```
- **查看插件列表**：
  ```bash
  paseo plugin ls
  ```

---

## 功能模块详解

### 1. 提问智能吸顶 (Sticky Questions)

在查看长篇助手回复时，用户无需频繁往上回滚即可随时查看当前上下文对应的提问。

```
+--------------------------------------------------------------+
| [用户提问内容摘要 (最多3行)...]                           [📋] | <- 吸顶栏 (与正文等宽)
+--------------------------------------------------------------+
| (当前轮次的助手回答正文 / 工具执行记录持续滚动...)           |
| ...                                                          |
```

- **生命周期与控制开关**：
  - 功能设置中提供按主机保存的「吸顶提问」总开关，默认开启；禁用时同时移除对话输入区的同名胶囊，重新开启后恢复。胶囊可临时关闭或重新启用单个对话，总开关优先。
  - 吸顶逻辑依托于开关组件挂载，独立于助手回答的渲染周期。
- **触发与切换判定**：
  - 当该轮用户提问**完全滚出视口顶部**时触发吸顶。
  - 若提问正文有**任何像素残留于视口**中，吸顶条立即隐藏。
  - 滚动进入下一轮对话时自动切换为下一轮提问；回滚向上浏览时智能恢复上一轮。
  - 引入 **约 100ms 不可见状态确认机制**，彻底杜绝虚拟列表重绘或临界滚动时的画面闪烁。
  - 浏览至会话最底部时规则保持一致：仅在提问离开视口后才维持置顶。
- **视觉风格与自适应**：
  - 吸顶条宽度与正文完全对齐，继承原生用户气泡的背景色、圆角、横向内边距与字体，无缝适应浅色/深色主题。
  - **整条只占三行文字的高度**：没有标题行，垂直内边距收紧到 4px，正文最多 3 行；复制图标放在正文右侧，不额外占用高度。
  - **点哪都能展开**：点击吸顶条任意位置（复制图标除外）即展开全文，再点一次收回 3 行；展开后在区域内部独立滚动。超过 3 行时，最后一行末尾由插件补一个「…」；正文本来就不足 3 行时点击无效果，鼠标也不会变成手型。
  - **无损全文复制**：右侧内嵌复制图标，点击可复制该轮提问的完整文本（含折叠隐藏部分）；悬停轻微高亮，复制成功后切换为对勾图标反馈，约 1.8 秒后自动复原。

### 2. 紧凑活动聚合 (Compact Activity)

活动展示按 [cnaron/compact-agent-activity](https://github.com/cnaron/compact-agent-activity) 的 Folded / Detailed 模式迁移，源码基准为 `4866482961c4c43a2f5f102fd63eadff85e15ef2`。默认 Folded 从活动开始即展示单行摘要，完成后不切换为“用时”或二级命令分组；展开后直接显示思考正文及工具详情。Detailed 保留上游逐项卡片、状态图标、输出、Diff 和结构化工具详情。旧 Codex 设置读取时兼容迁移为 Folded，配色与功能开关继续保留。用户提问与普通助手回答继续使用原生 Markdown、复制及分叉操作。

迁移保留上游摘要、字体、颜色、详情树与整行点击交互，并针对公开 SDK 和虚拟列表做稳定性适配：按连接与 Agent 隔离历史，流式活动保持行身份，展开选择在行重挂载后保留，首帧直接生成语法高亮；恢复订阅时保留缓存直到确认历史 epoch 变化。历史首次读取尚未完成或无法匹配时显示收起的单项摘要，避免先闪现整块详情。DOM 只放在各功能域自己的 `dom.ts`，间距与图片尺寸使用声明式 CSS，不在挂载后遍历并调整活动节点的外边距。

将 Agent 执行过程中密集的“思考链”与“工具调用”从瀑布流精简为高度紧凑的信息胶囊：

```
Thought · Ran 17 commands · Edited 1 file  [▼ 点击展开详情]
```

- **聚合摘要与详情展开**：
  - 连续思考与工具操作折叠为单行摘要条；
  - 单击即可原位展开完整面板，查看结构化思考过程、命令与输出终端、语法高亮展示、文件修改 Diff、错误异常栈以及子 Agent 派发详情。
- **天然消息边界隔离**：
  - 一旦遇到助手文本回答、用户提问或其他可见节点，当前活动分组立即封口，详情绝不跨消息错位聚合。
- **高性能与隔离机制**：
  - 按 Paseo 会话连接与 Agent 实例双重隔离；
  - 基于公开时间线接口按需向前加载历史；若连接尚未就绪或正在拉取，自动降级为逐项明细模式；
  - 流式活动**历史读取**引入 **100ms 聚合窗口**，合并高频请求；渲染不做延后，而是靠行标识在流式增长期间保持稳定、折叠内容不进渲染路径来避免多余重排。超长输出（超过 12000 字符）自动退化为纯文本，避免逐帧全量重新分词。
  - 思考文字连续增长时保留当前折叠分组；虚拟列表回收活动行后保留已加载的分组、暂停订阅，重新挂载时直接复用，减少行高变化造成的滚动拉扯。
  - 订阅恢复期间保留分组，读取到相同历史内容时不重建分组或通知渲染；首次历史读取完成后才开始向前分页，避免重复请求。
- **桌面与 Web 专属微调**：
  - 精细收敛对话消息与段落间距（助手消息垂直内边距缩减为 4px、段落间距优化为专业 8px 并自动消除尾部双重留白，列表/代码块/引用按黄金比例紧凑排列）；
  - 压缩折叠活动行外间距与提问衔接间隙，提升连续思考与工具输出的信息密度与可读性；
  - 将对话内插入的图片尺寸智能限制在最大 440 × 320，保持流式版面工整（不影响点击后的全屏看图功能）。

### 3. Mermaid 交互图表 (Mermaid Diagrams)

完整吸收上游 [paseo-plugin-mermaid](https://github.com/dutchakdev/paseo-plugin-mermaid) 0.2.0 的渲染实现，原生赋能 Agent 输出可视化图表的能力。

- **动态交互控制**：
  - 自动拦截并转换助手回答中的 ````mermaid` 代码块；
  - 支持流式输出过程中渐进式呈现；
  - 内置交互工具条：支持 **25%–400% 自由缩放**、**适应宽度**、**全屏弹窗浏览**以及**图表 / 源码视图一键切换**。
- **语法支持范围**：
  - **全面支持**：`flowchart` / `graph`（支持 `TD`, `TB`, `BT`, `LR`, `RL` 全部方向，含**顶层子图（Subgraphs）分组框**）以及 `sequenceDiagram`（包括常用节点几何形状、连线箭头、文本标签、参与者 Participants、角色 Actors、行内注释 Notes 等）。
  - **暂不支持**：嵌套子图（折叠进外层分组框渲染）、`style` / `classDef` 自定义样式及其他非常用图表类型。
  - **优雅降级**：解析异常或遇不支持语法时，自动回退显示原始源码，并提供辅助错误提示。
- **接管行为说明**：
  - 插件仅针对**含有 Mermaid 代码块的助手回答**进行接管渲染；
  - 接管后的该条消息采用上游轻量级 Markdown 引擎渲染（支持标题、段落、列表、**表格（含对齐与单元格内强调）**、代码块、引用等），**不再提供 Paseo 原生分叉与复制按钮**（纯文本普通回答则不受任何影响）。

---

### 4. 提示词增强 (Prompt Enhancement)

把输入框里的模糊诉求（如「加个缓存」）自动改写为包含**目标、范围、约束、验收**四要素的可执行提示词，并结合当前项目环境补充真实的技术栈与验证命令。

- **两个入口**：
  - **composer 轨道 pill**（全平台）：位于输入框上方的插件轨道的「增强」按钮，与「吸顶提问」并列；
  - **`/enhance <原始提示词>`**（全平台）：宿主未开放草稿读写 API，原生端与命令行走此入口。
- **再次点击即撤销**：回填后按钮变为撤销图标，点击恢复增强前的原文；增强结果以 `origin` 标记，不会被二次增强。
- **环境适配**：服务端只读采集项目清单文件（`package.json` / `Cargo.toml` / `go.mod` 等）、脚本命令、依赖框架、tsconfig strict、Git 改动文件与 `README` / `AGENTS` / `CLAUDE` 等说明文档，作为上下文注入提示词。**验收标准只能引用仓库里真实存在的命令**，探测不到时改为可人工核对的现象。
- **判定先行**：原文已是清晰可执行的指令时原样返回（`applied=false`），不做同义改写造句。原文本身已超过 200 字时同样保持原样——增强结果不可能比用户已写的内容更短。
- **长度上限 200 字**：改写正文硬上限 200 字，四要素各占一行、每项只给结论。上限与原文长度无关，短诉求不会被压缩成残句。
- **失败可见**：模型超时、端点报错、密钥缺失都会以宿主 toast 提示原因，并保留原文，不会静默失败。

> [!NOTE]
> 提示词增强使用自带的模型端点（设置中配置），不经过 Paseo 宿主账号，因此不产生任何宿主对话记录，也**只发送文本与上述环境画像摘要，不发送源码文件内容**。

---

## 插件配置指南

可在 Paseo 客户端菜单中打开首选项进行个性化配置：

**路径**：`设置 (Settings)` → `插件 (Plugins)` → `chat-view` → `功能设置`

| 配置项                                 | 可选项                                      | 说明                                                                                                                                                                        |
| :------------------------------------- | :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mermaid 图表**                       | 开启（默认） / 禁用                         | 控制插件绘图；禁用后恢复 Paseo 原生消息与图表显示。                                                                                                                         |
| **紧凑活动（compact-agent-activity）** | 开启（默认） / 禁用                         | 控制思考与工具调用增强；禁用后恢复原生时间线。                                                                                                                              |
| **吸顶提问**                           | 开启（默认） / 禁用                         | 控制全部对话的吸顶提示；禁用后立即移除，仅桌面与 Web 支持。                                                                                                                 |
| **锁定已发送消息**                     | 开启（默认） / 禁用                         | 发送后隐藏「回退到此消息」，内容不可再改写；仅桌面与 Web 支持。                                                                                                             |
| **提示词增强**                         | 开启（默认关闭） / 禁用                     | 控制输入框旁的增强按钮与 `/enhance` 命令；需先填写模型端点。                                                                                                                |
| **API 地址 / API 密钥 / 模型**         | 文本                                        | 任意 OpenAI Chat Completions 兼容端点；密钥存于宿主设置（0600）。                                                                                                           |
| **测试连接**                           | 按钮                                        | 用当前配置发一次最小请求，验证地址、密钥与模型；显示延迟与实际端点。                                                                                                        |
| **展示模式 (Display Mode)**            | `Folded` (默认) / `Detailed`                | 选择上游聚合摘要或逐项明细；旧 Codex 设置迁移为 Folded。                                                                                                                    |
| **配色方案 (Color Theme)**             | `Vivid` / `Soft` / `High contrast`          | 适配不同的终端审美与高对比度无障碍需求。                                                                                                                                    |
| **界面语言 (Language)**                | `简体中文`（默认） / `English` / `跟随系统` | 插件自有文案的语言：设置页、吸顶条、胶囊与按钮，以及增强流程上报的提示。不是模型的回答语言——回答跟随你的提问语言。`跟随系统` 在浏览器端读取系统语言，原生端回落到简体中文。 |

_注：配置项基于 Host 独立持久化存储，已有展示模式与配色配置会保留。当前设置页和打开的对话即时更新；其他客户端的时间线开关最迟约 2 秒同步，无需重启 daemon。紧凑活动禁用时，其展示模式和配色选项暂不可修改；界面语言不受该开关限制，切换后设置页、吸顶条与输入区胶囊同时换词。_

_文本字段（API 地址 / 密钥 / 模型）在停止输入约 300ms 后写入，离开字段时立即写入；宿主以内容哈希作为 revision 并拒绝基于旧 revision 的写入，逐字提交会与往返竞争而丢字（见 `client/settings.tsx` 的 `DraftField`）。_

---

## 架构设计与技术边界

1. **零私有侵入原则 (Public SDK Only)**
   - 生产插件完全依赖 `@getpaseo/client`、`@getpaseo/plugin`、`@getpaseo/protocol`（基于 0.10.3 规范），不导入宿主私有源码，不入侵 Paseo Daemon。
2. **DOM 增强边界隔离**
   - 宿主 0.10.3 尚未开放原生对话浮层 API。吸顶能力通过 `client/sticky/dom.ts` 对原生滚动区域进行 DOM 注入增强，并借助时间线消息 ID 精确匹配轮次。
   - 所有 DOM 访问被严格收敛在 Web / 桌面端环境下；原生移动端运行逻辑纯粹基于 React Native，无 DOM 污染。
   - DOM 知识按功能域私有：吸顶、紧凑活动、提示词增强各自持有一份 `dom.ts`，互不可见；只有 `client/dom.ts` 共享其中用到的最小 DOM 类型声明。
3. **只读会话边界**
   - 历史归档的只读对话窗口因未挂载输入区吸顶控制器，当前暂不展示吸顶条。

---

## 项目结构

### 双轴布局：外层由宿主锁定，内层按功能划分

宿主编译器对插件 import 图里的**每个**模块做归属判定，只有落在下面三类目录（或根级两个入口文件）里的代码才会被编译，否则直接报错 `Plugin modules belong in client/, server/, or shared/`：

| 目录      | 归属   | 可用内容                                                 |
| --------- | ------ | -------------------------------------------------------- |
| `client/` | 客户端 | React、React Native、hooks、样式、DOM 操作、回调         |
| `server/` | 服务端 | Node API、文件系统与进程访问、凭据、handler              |
| `shared/` | 双端   | Zod 契约与纯值；**不得**引用 React 组件、hooks、Node API |

因此本项目采用**双轴**结构：外层轴由宿主决定，内层轴（功能域）由本项目决定。四个功能域是 `sticky`（吸顶提问）、`activity`（紧凑活动）、`mermaid`（图表渲染）、`enhance`（提示词增强），每个域在需要它的运行层下各有一个同名目录。

```text
chat-view/
├── paseo-plugin.json          宿主清单（强校验）
├── index.client.tsx           固定入口：只做注册接线
├── index.server.ts            固定入口：注册 settings 与 provider
│
├── client/                    ── 客户端运行时
│   ├── features.ts            订阅宿主设置与 Agent 更新，把开关与 Agent 分发给各域
│   ├── settings.tsx           设置页：聚合四域开关与界面语言
│   ├── locale.ts              运行中的插件语言；唯一写入者是 createFeatureController.apply
│   ├── feature.ts             域与装配器之间的接口
│   ├── agent-pills.ts         按 Agent 维护 composer 胶囊的挂载与回收
│   ├── timeline-pager.ts      基于宿主时间线句柄的向前分页
│   ├── dom.ts                 各域共用的最小 DOM 类型声明
│   │
│   ├── sticky/                ── 吸顶提问
│   │   ├── index.ts           createStickyDomain
│   │   ├── StickyBar.tsx      useStickyMessage 挂载吸顶条
│   │   ├── pill.tsx           createStickyPill 与开关状态
│   │   └── dom.ts             滚动容器探测与吸顶条注入
│   │
│   ├── readonly/              ── 锁定已发送消息
│   │   ├── index.ts           createReadonlyDomain（无 React 状态、无 Agent 接线）
│   │   └── dom.ts             隐藏宿主回退控件的样式表
│   │
│   ├── activity/              ── 紧凑活动
│   │   ├── index.ts           createActivityDomain
│   │   ├── Activity.tsx       时间线行渲染（折叠组 / 详情面板）
│   │   ├── styles.ts          调色板与样式推导（无入边，勿反向依赖）
│   │   ├── history.ts         历史向前分页
│   │   ├── group-store.ts     折叠分组仓储
│   │   ├── disclosure.ts      展开 / 收起状态
│   │   ├── transform.ts       时间线转换器
│   │   ├── highlight.ts       首帧语法高亮
│   │   ├── latest-marker.ts   「最新条目」标记的延迟通知
│   │   ├── dom.ts             作用域样式表与滚动定位
│   │   ├── detail/            折叠行正文，按 detail 类型各一个模块
│   │   │   ├── index.tsx      DetailBody 分发
│   │   │   ├── parts.tsx      标签、路径行、高亮代码、Diff 块
│   │   │   ├── file.tsx       read / write / edit
│   │   │   ├── search.tsx     search / fetch
│   │   │   ├── terminal.tsx   shell / worktree setup
│   │   │   ├── texts.tsx      sub-agent / 纯文本 / plan
│   │   │   └── dispatch.tsx   未知 detail 的回退
│   │   └── tools/             工具详情面板（第四层）
│   │       ├── shared.tsx     跨工具族复用的展示积木与取值助手
│   │       ├── list.tsx       共用的列表行渲染
│   │       ├── exa.tsx        Exa 搜索工具族
│   │       ├── github.tsx     GitHub 工具族
│   │       ├── child-agent.tsx 子 Agent 派发
│   │       └── paseo/         Paseo 工具族，按工具组各一个模块
│   │                          （index · parts · agent · browser · provider · schedule · speak · terminal · workspace）
│   │
│   ├── mermaid/               ── Mermaid 图表
│   │   ├── index.ts           createMermaidDomain
│   │   ├── registration.ts    宿主渲染器与转换器注册
│   │   ├── item.tsx           时间线条目
│   │   ├── markdown.tsx       轻量 Markdown 渲染
│   │   ├── diagram.tsx       图表绘制
│   │   ├── viewer.tsx         全屏预览
│   │   └── toolbar.tsx        缩放 / 适应宽度 / 源码切换
│   │
│   └── enhance/               ── 提示词增强
│       ├── index.ts           createEnhanceDomain
│       ├── controller.ts      增强流程编排
│       ├── state.ts           跨会话的增强状态
│       ├── pill.tsx           composer 轨道按钮
│       └── dom.ts             输入框探测与按钮注入
│
├── server/                    ── 服务端运行时（仅增强域需要 Node）
│   └── enhance/
│       ├── index.ts           registerEnhance
│       ├── provider.ts        模型端点调用
│       ├── probe.ts           仓库环境探测
│       └── manifest.ts        清单文件读取
│
└── shared/                    ── 双端共享
    ├── settings.ts            宿主级设置契约（四域共用；宿主只接受单一契约，拆开会把一次写入变成跨模块协调，故不拆）
    ├── i18n.ts                双语词表、`t()` 插值，以及增强 RPC 携带的 `localeSchema`
    ├── sticky/history.ts      PromptHistory 轮次数据
    ├── activity/
    │   ├── palette.ts         主题 token → 共用的 ActivityPalette
    │   ├── tool-presentation.ts  时间线条目 → 标题、图标、分类、摘要
    │   ├── text.ts            文本预算、宽松 JSON 格式化、任意值转文本
    │   ├── diff.ts            行级差异与增删统计
    │   ├── file-kind.ts       路径 → 语言、文件图标
    │   ├── paseo-tools.ts     Paseo 工具名 → 分类
    │   ├── timeline.ts        渲染器 kind 与 schema
    │   ├── parse.ts           思考正文的 Markdown 解析
    │   ├── child-agent.ts     子 Agent 时间线契约
    │   ├── github.ts          GitHub 工具元数据
    │   └── exa.ts             Exa 搜索工具元数据
    ├── mermaid/               parse · segment · flowchart · sequence
    │                          layout · zoom · transform
    └── enhance/               contract · decide · parse · policy
                               normalize · prompt · run
                               failure（带类型的 provider 失败，按语言成文）
                               index（汇总导出）
```

### 命名约定

- 目录名与模块文件名一律 `kebab-case`；域的主组件文件用 `PascalCase`（`Activity.tsx`、`StickyBar.tsx`）。
- 每个域的出口是 `index.ts`，对外只暴露该域的公开面。
- 同名文件分属不同功能域时由目录消歧（各域都有自己的 `dom.ts` / `index.ts` / `parse.ts`），这是刻意的一致形态而非冲突。
- 解析层与渲染层同名时，解析层统一叫 `parse.ts`（`shared/*/parse.ts`），渲染层保留领域名（`client/mermaid/markdown.tsx`）。
- 测试与实现同目录成对，命名 `<被测模块>.test.ts`；测试文件一律为 `.ts`，与 `tsconfig.json` 的 `exclude` 保持一致。

### 改动纪律

- **新增功能**：在 `client/` `server/` `shared/` 下新建对应功能目录，实现从该域 `index.ts` 导出，再把 `create*Domain` 加进 `client/features.ts` 的域列表。装配器不需要知道域内部任何细节；带 composer 胶囊的域另在 `FeatureDomain` 上实现 `registerAgent` / `unregisterAgent`，由装配器转发 Agent 增删。
- **DOM 相关改动**只能落在对应域的 `dom.ts`；新增 DOM 能力时在 `client/dom.ts` 补类型声明，不要把选择器散到别处。
- **不要**把代码放进 `client/` `server/` `shared/` 与根级两个入口之外——宿主编译器会拒绝。新增顶层目录前请先确认它不会进入 import 图。
- `client/activity/styles.ts` 必须保持无入边（除类型外不依赖本域其他模块），否则会重新引入 `Activity ↔ tools/*` 循环。
- **界面文案**统一放在 `shared/i18n.ts` 词表（每种语言各一条），React 里用 `t(locale, key)` 读取、组件外用 `tr(key)`；运行中的语言存在 `client/locale.ts`，只允许 `client/features.ts` 的 `apply()` 写入。`shared/i18n.test.ts` 会在词条没有任何源码引用时报错，弃用的词条要一并删掉。
- **模型自己的文本不进词表**：增强系统提示词与策略表述刻意固定为中文，活动域的字段标签刻意保持英文。

---

## 本地开发与测试

> 深入开发指南与架构约束请参考 [AGENTS.md](./AGENTS.md)。
> 原始需求档案（`PRD.md`）已不在工作区，需要时从 git 历史取出：`git show fb6d53f:PRD.md`。

### 环境准备与静态检查

```bash
# 安装依赖
npm ci

# TypeScript 类型检查
npm run typecheck

# 代码规范检查 (oxlint)
npm run lint

# 代码格式校验 (oxfmt)
npm run format:check

# 自动格式化
npm run format
```

### 运行单元测试

遵循最小必要原则，仅运行受改动影响的针对性测试套件：

```bash
# 1. 验证提问吸顶与历史轮次逻辑
npm test -- shared/sticky/history.test.ts --run --bail=1

# 2. 验证紧凑活动转换器、状态仓储与注册流程
npm test -- client/registration.test.ts client/activity --run --bail=1

# 3. 验证 Mermaid 语法解析与图表转换
npm test -- shared/mermaid --run --bail=1

# 4. 验证功能开关与滚动防闪回归
npm test -- client/features.test.ts client/sticky/dom.test.ts client/activity/dom.test.ts client/enhance/dom.test.ts --run --bail=1

# 5. 验证提示词增强核心逻辑与环境探测
npm test -- shared/enhance server/enhance --run --bail=1

# 6. 验证词表完整性与语言切换
npm test -- shared/i18n.test.ts --run --bail=1

# 7. 验证已发送消息锁定与时间线分页
npm test -- client/readonly client/timeline-pager.test.ts --run --bail=1
```

> [!TIP]
> `client/registration.test.ts` 需要调用宿主真实的 Paseo 编译器。默认源码检索路径为同级目录 `../paseo`；若本地路径不同，可通过环境变量覆盖：<br>
> `PASEO_SOURCE_DIR=/path/to/paseo npm test -- client/registration.test.ts --run --bail=1`

---

## 致谢与开源许可

本项目在实现过程中吸收并整合了以下优秀开源项目的核心成果：

- **[beautiful-chat](https://github.com/ABorakati/beautiful-chat)**
  - 参考了其滚动容器检测与 DOM 注入吸顶的架构思路。
- **[compact-agent-activity](https://github.com/cnaron/compact-agent-activity)**
  - 紧凑活动摘要计算、配色面板与详情面板渲染深度基于该项目实现。
  - 版权归 Matt Cowger 所有，遵循 MIT 协议，完整声明见 [LICENSE.compact-agent-activity](./LICENSE.compact-agent-activity)。
- **[paseo-plugin-mermaid](https://github.com/dutchakdev/paseo-plugin-mermaid)**
  - 吸收其 0.2.0 版本（Commit: `95cf07db794f6be3e121a41a7e774e3fdde3ccf5`）跨端图表解析与渲染模块。
  - 版权归 dutchakdev 所有，遵循 MIT 协议，完整声明见 [LICENSE.mermaid](./LICENSE.mermaid)。
