# chat-view 开发说明

## 目录

- 插件源码与工作目录：当前仓库根目录（`./`）
- Paseo 宿主源码：`../paseo`（或通过 `PASEO_SOURCE_DIR` 环境变量指定）
- 宿主插件文档：`../paseo/docs/plugins.md`
- 宿主公开 API 参考：`../paseo/public-docs/plugins/reference.md`

宿主 checkout 可能包含未发布 API。以插件 package.json 中的公开 SDK 版本和实际安装的 Paseo 版本为兼容基准。

## 原始需求

原始需求档案 `PRD.md` 已从工作区删除，需要时用 `git show fb6d53f:PRD.md` 取出；它是历史方案记录，不作为当前架构或部署状态的说明。后续开发先核对用户最新要求与 README 中的现有行为。

## 范围

插件 ID 与包名为 `chat-view`。增强原生对话的提问吸顶与紧凑活动；替换思考与工具时间线条目，并接管含 Mermaid 的助手回答。用户提问与普通助手回答保持原生；含 Mermaid 的助手回答改用插件绘图与简化 Markdown，不再提供该条回答的原生分叉与复制操作。

生产插件只使用公开 Paseo SDK，不直接导入宿主源码。DOM 操作只放在各功能域自己的 `dom.ts`（共用类型声明在 `client/dom.ts`）并限制到 web；原生端不使用 DOM。跟随原生用户消息样式与正文宽度。

界面文案（含设置页、吸顶条、胶囊、按钮，以及插件自产的增强/探针提示）统一放在 `shared/i18n.ts` 词表，zh-CN / en-US 各一条：React 里用 `t(locale, key)`，组件外用 `tr(key)`。运行语言由 `client/locale.ts` 持有，唯一写入者是 `client/features.ts` 的 `apply()`；语言变化时，注册类贡献（composer 胶囊、slash 命令、设置页）按需重建。模型提示词与 policy 文本、活动域字段标签不参与多语言，属刻意设计。

## 开发与验证

使用 npm，不依赖宿主 node_modules。修改后运行 `npm run typecheck`、`npm run lint`，使用 `npm run format` 格式化。

只运行受影响的测试文件，例如 `npm test -- shared/sticky/history.test.ts --run --bail=1`。不要运行 Paseo 宿主完整测试套件。

`client/registration.test.ts` 使用真实宿主 compiler，默认源码位置是 `../paseo`；可设置 `PASEO_SOURCE_DIR` 覆盖。该测试需要宿主依赖已安装；共享逻辑测试不依赖宿主源码。

源码更新通过 `paseo plugin reload chat-view` 热加载，用 `paseo plugin ls chat-view` 检查运行状态。不得擅自重启主 daemon（6767），它管理正在运行的 agents。

修改吸顶时检查三行折叠与末尾「…」、点击整条展开/收起（复制图标不触发）、轮次切换、底部保留、正文宽度、虚拟列表、浅/深色主题和中英文切换。
