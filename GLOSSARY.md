# chat-view

Paseo 插件，在原生对话里增强提问吸顶与紧凑活动展示：替换思考与工具时间线条目，并接管含 Mermaid 的助手回答。

## Language

**leaf（工具叶子）**:
宿主工具名去掉 `paseo_` 命名空间后的短名，例如 `create_agent`；是插件识别一个工具的最小单位。
_Avoid_: tool name、tool id、leaf name

**tool family（工具家族）**:
一组共享渲染方式的叶子；表示插件对叶子渲染归属的判定，与 `category` 无关。
_Avoid_: tool group、tool type、tool kind

**category（显示分类）**:
工具叶子在折叠摘要计数与行首强调色里使用的分类：`shell`、`file`、`search`、`agent`、`plan`、`communication`、`unknown`。
_Avoid_: kind、type、tool category

**registry row（描述行）**:
一个叶子在插件里的全部展示声明：label、icon、category、summary、family。
_Avoid_: descriptor、spec、metadata

**detail renderer（详情渲染器）**:
针对一种协议 detail 类型的渲染单元，一个类型一个；由 `client/activity/detail/index.tsx` 的 `RENDERERS` 记录穷尽登记，缺一个就编译不过。
_Avoid_: detail case、detail branch、detail view

**timeline pager（时间线翻页器）**:
读取宿主 projected timeline 的共同窗口记账：cursor、older、epoch 与 generation 守卫、并发合并；活动分组与吸顶提问条共用它，各自只保留 apply 与重绘策略。
_Avoid_: fetcher、loader、timeline client

**marker（最新条目标记）**:
按 agent 记录某类时间线条目（思考、工具调用）最新时间戳的订阅点，供流式态判断；`client/activity/latest-marker.ts` 里一个工厂出两个实例，共用一次微任务刷新。
_Avoid_: latest store、timestamp store、flag
