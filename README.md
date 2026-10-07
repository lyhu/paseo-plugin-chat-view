# Paseo Plugin: chat-view

[English](README.md) | [简体中文](README_zh.md)

> A Paseo interface enhancement plugin focused on reading and debugging efficiency in long conversations: **smart sticky questions for the current turn**, **compact aggregation of reasoning and tool calls**, and **interactive Mermaid diagram rendering**.

---

## Table of Contents

- [Core Features](#core-features)
- [Platform Support & Compatibility Matrix](#platform-support--compatibility-matrix)
- [Host Configuration Prerequisites](#host-configuration-prerequisites)
- [Quick Start](#quick-start)
  - [Installation & Loading](#installation--loading)
  - [Maintenance Commands](#maintenance-commands)
- [Feature Details](#feature-details)
  - [1. Sticky Questions](#1-sticky-questions)
  - [2. Compact Activity](#2-compact-activity)
  - [3. Interactive Mermaid Diagrams](#3-interactive-mermaid-diagrams)
  - [4. Prompt Enhancement](#4-prompt-enhancement)
- [Plugin Settings Guide](#plugin-settings-guide)
- [Architecture & Technical Boundaries](#architecture--technical-boundaries)
- [Project Structure](#project-structure)
- [Local Development & Testing](#local-development--testing)
- [Credits & Licenses](#credits--licenses)

---

## Core Features

| Feature                   | Description                                                                                                                             | Highlights                                                                                              |
| :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 📌 **Sticky Questions**   | Pins the current turn's user question to the top of the viewport while scrolling through a long conversation.                           | 100ms viewport debounce, native visual inheritance, default 3-line auto fold, one-click full-text copy. |
| ⚡ **Compact Activity**   | Shows a single-line activity summary by default (compact-agent-activity Folded mode); a click expands thoughts and tool details inline. | Smooth reasoning text, click-to-expand command output, code diffs, first-frame syntax highlighting.     |
| 📊 **Mermaid Diagrams**   | Built-in Mermaid parser and renderer that turns diagram code blocks into high-quality visual charts.                                    | 25%–400% free zoom, fit-to-width, seamless source/diagram toggle, full-screen preview.                  |
| ✨ **Prompt Enhancement** | Rewrites a vague composer request into an executable prompt complete with goal / scope / constraints / acceptance, and writes it back.  | One-click enhance, project-environment aware, click again to undo to the original text.                 |

> [!NOTE]
> **Design philosophy**: zero backend intrusion and strictly built on the public Paseo SDK; user questions and ordinary assistant answers keep Paseo's native fork and copy functionality in full.

---

## Platform Support & Compatibility Matrix

| Platform / Runtime                | Sticky Questions | Compact Activity | Mermaid Diagrams | Experience details                                                                         |
| :-------------------------------- | :--------------: | :--------------: | :--------------: | :----------------------------------------------------------------------------------------- |
| **Desktop (Electron / Desktop)**  |   ✅ Supported   |   ✅ Supported   |   ✅ Supported   | DOM-level line spacing tightening, image size constraints (max 440 × 320).                 |
| **Web browser**                   |   ✅ Supported   |   ✅ Supported   |   ✅ Supported   | Full viewport observation and DOM interaction.                                             |
| **Native mobile (iOS / Android)** | ⏸️ Not supported |   ✅ Supported   |  ✅ Supported\*  | Built on standard React Native; no DOM line-spacing tuning (on-device validation pending). |

> [!WARNING]
> **Plugin conflict notice**:
> Do not enable this plugin together with `compact-agent-activity`, `reasoning-display`, or the standalone `paseo-plugin-mermaid`, otherwise multiple timeline transformers may conflict with or overwrite each other.

---

## Host Configuration Prerequisites

For compact activity to parse full tool-call arguments and results, change the Paseo host setting:

> [!IMPORTANT]
> In the Paseo host settings, set **Tool call detail** to **Detailed**.<br>
> _If it is set to `Overview`, the host merges tool entries before the plugin takes over, so compact activity details cannot be collected correctly._

---

## Quick Start

### Installation & Loading

This plugin is a local source package, installed directly through the Paseo CLI:

```bash
# 1. Install the plugin locally (current directory or an absolute plugin path)
paseo plugin install .
# Or: paseo plugin install /path/to/paseo-plugin-chat-view

# 2. Check install and runtime status
paseo plugin ls chat-view
```

Once installed, open or refresh any agent conversation window for it to take effect.

### Maintenance Commands

- **Hot-reload the plugin** (takes effect immediately after source changes; **never restart the host daemon on port 6767**):
  ```bash
  paseo plugin reload chat-view
  ```
- **List plugins**:
  ```bash
  paseo plugin ls
  ```

---

## Feature Details

### 1. Sticky Questions

While reading a long assistant response, you can see the question for the current context at any time without scrolling back up.

```text
+--------------------------------------------------------------+
| [User question excerpt (up to 3 lines)...]            [More... / 📋] | <- Sticky bar (same width as the message body)
+--------------------------------------------------------------+
| (Assistant answer for this turn / tool execution keeps scrolling...) |
| ...                                                          |
```

- **Lifecycle and controls**:
  - Settings provide a per-host master switch for sticky questions, enabled by default. Disabling it also removes the composer pill of the same name; re-enabling restores it. The pill can temporarily turn sticky questions off or back on for a single conversation, with the master switch taking precedence.
  - Sticky behavior is driven by mounting the toggle component and is independent of assistant-response render cycles.
- **Trigger and switching rules**:
  - Triggers when the turn's user question scrolls **completely out of the top of the viewport**.
  - If **any pixel** of the question body remains in the viewport, the sticky bar hides immediately.
  - Scrolling into the next turn switches to that turn's question; scrolling back up restores the previous one.
  - A **~100ms absence confirmation** eliminates flicker during virtual-list repaints or boundary scrolling.
  - The rule is the same at the very bottom of a conversation: the bar stays pinned only once the question has left the viewport.
- **Visual style and adaptation**:
  - The sticky bar aligns exactly with the message body width and fully inherits the native user bubble's background color, corner radius, padding, and font, adapting seamlessly to light and dark themes.
  - **Adaptive folding**: shows at most 3 lines by default and offers a "More…" action for the rest; once expanded it scrolls independently inside the area and can be collapsed with "Show less". Switching turns resets it to the collapsed state.
  - **Lossless full-text copy**: a copy icon embedded at the bar's bottom-right copies the complete question text of that turn (including the hidden part); it highlights slightly on hover and switches to a check mark for about 1.8 seconds after copying.

### 2. Compact Activity

Activity rendering is migrated from the Folded / Detailed modes of [cnaron/compact-agent-activity](https://github.com/cnaron/compact-agent-activity), with source baseline `4866482961c4c43a2f5f102fd63eadff85e15ef2`. Folded (the default) shows a single-line summary from the start of an activity and does not switch to "duration" or second-level command grouping when it finishes; expanding shows the reasoning text and tool details directly. Detailed keeps the upstream per-item cards, status icons, output, diffs, and structured tool details. Old Codex settings are migrated to Folded on read, while the color theme and feature toggle are preserved. User questions and ordinary assistant answers keep native Markdown, copy, and fork behavior.

The migration keeps the upstream summary, fonts, colors, detail tree, and whole-row click interaction, adapted for stability against the public SDK and virtual lists: history is isolated per connection and per agent, streaming activity rows keep their identity, expand selection survives a row remount, and syntax highlighting is produced on the first frame; on subscription resume, cached state is kept until a history epoch change is confirmed. When the first history read has not completed or cannot be matched, a collapsed single-item summary is shown instead of flashing the whole detail block. DOM handling lives only in each feature domain's own `dom.ts`; spacing and image sizing use declarative CSS rather than walking and adjusting activity node margins after mount.

Dense chains of thought and tool calls during agent execution are condensed from a waterfall into a highly compact information capsule:

```text
Thought · Ran 17 commands · Edited 1 file  [▼ click to expand details]
```

- **Aggregated summary and detail expansion**:
  - Consecutive reasoning and tool operations collapse into a single summary line;
  - One click expands the full panel in place: structured reasoning, commands and output terminal, syntax highlighting, file diffs, error stacks, and sub-agent dispatch details.
- **Natural message boundary isolation**:
  - As soon as an assistant text answer, a user question, or any other visible node appears, the current activity group is sealed; details never aggregate across messages out of place.
- **High performance and isolation**:
  - Isolated by both Paseo session connection and agent instance;
  - History is loaded forward on demand through the public timeline API; if the connection is not ready or a fetch is in flight, it degrades to per-item details automatically;
  - Streaming activity **history reads** use a **100ms aggregation window** to merge high-frequency requests; rendering is not delayed—instead, row identity keeps rows stable while streaming grows and folded content stays out of the render path, avoiding extra reflow. Very long output (over 12,000 characters) degrades to plain text to avoid re-tokenizing everything on every frame.
  - When reasoning text keeps growing, the current folded group is preserved; when the virtual list recycles activity rows, loaded groups are kept and the subscription is paused, then reused directly on remount, reducing scroll jitter from row-height changes.
  - Groups are preserved while the subscription resumes; identical history content does not rebuild groups or notify rendering. Forward pagination starts only after the first history read completes, avoiding duplicate requests.
- **Desktop and Web micro-adjustments**:
  - Tightens conversation message and paragraph spacing (assistant message vertical padding reduced to 4px, paragraph spacing tuned to a professional 8px with trailing double whitespace removed automatically; lists, code blocks, and quotes packed in a golden-ratio rhythm);
  - Compresses the outer spacing of folded activity rows and the gap to questions, improving the information density and readability of consecutive reasoning and tool output;
  - Constrains inline images to a maximum of 440 × 320 to keep streaming layouts tidy (full-screen image viewing on click is unaffected).

### 3. Interactive Mermaid Diagrams

Fully adopts the rendering implementation of upstream [paseo-plugin-mermaid](https://github.com/dutchakdev/paseo-plugin-mermaid) 0.2.0, natively empowering agents to output visual diagrams.

- **Dynamic interaction controls**:
  - Automatically intercepts and converts ````mermaid` code blocks in assistant answers;
  - Presents diagrams progressively while streaming;
  - Built-in toolbar: **25%–400% free zoom**, **fit to width**, **full-screen preview**, and **one-click diagram / source switching**.
- **Supported syntax**:
  - **Fully supported**: `flowchart` / `graph` (all of `TD`, `TB`, `BT`, `LR`, `RL`, including **top-level subgraph cluster boxes**) and `sequenceDiagram` (common node shapes, connector arrows, text labels, participants, actors, inline notes, etc.).
  - **Not yet supported**: nested subgraphs (folded into the enclosing cluster box), `style` / `classDef` custom styles, and other uncommon diagram types.
  - **Graceful degradation**: on a parse error or unsupported syntax, it falls back to showing the original source with a helpful error hint.
- **Takeover behavior**:
  - The plugin only takes over **assistant answers that contain a Mermaid code block**;
  - Such a message is rendered with the upstream lightweight Markdown engine (headings, paragraphs, lists, **tables with alignment and inline emphasis in cells**, code blocks, quotes, etc.) and **no longer offers Paseo's native fork and copy buttons** (plain-text answers are completely unaffected).

---

### 4. Prompt Enhancement

Automatically rewrites a vague composer request (say, "add caching") into an executable prompt covering **goal, scope, constraints, and acceptance**, enriched with the real tech stack and verification commands of the current project.

- **Two entry points**:
  - **composer track pill** (all platforms): the "Enhance" button on the plugin track above the input box, next to "Sticky questions";
  - **`/enhance <original prompt>`** (all platforms): since the host does not expose a draft read/write API, native clients and the command line use this entry point.
- **Click again to undo**: after writing back, the button becomes an undo icon; clicking it restores the pre-enhancement text. Enhanced results are tagged with `origin` and are never enhanced twice.
- **Environment awareness**: the server read-only collects project manifest files (`package.json` / `Cargo.toml` / `go.mod`, etc.), script commands, dependency frameworks, tsconfig strict, changed Git files, and docs such as `README` / `AGENTS` / `CLAUDE`, and injects them into the prompt as context. **Acceptance criteria may only reference commands that actually exist in the repository**; when nothing can be detected, it falls back to manually checkable observations.
- **Judge first**: if the original text is already a clear, executable instruction it is returned as is (`applied=false`), with no paraphrasing for its own sake. The same applies when the original already exceeds 200 characters—an enhancement could never be shorter than what the user wrote.
- **200-character limit**: the rewritten body is hard-capped at 200 characters, one line per element, each stating only the conclusion. The cap is independent of the original length, so short requests are not compressed into fragments.
- **Visible failures**: model timeouts, endpoint errors, and missing keys all surface the reason through a host toast and keep the original text; nothing fails silently.

> [!NOTE]
> Prompt enhancement uses its own model endpoint (configured in settings) and does not go through the Paseo host account, so it produces no host conversation record and **sends only the text plus the environment profile summary above—never source file contents**.

---

## Plugin Settings Guide

Open preferences from the Paseo client menu to configure the plugin:

**Path**: `Settings` → `Plugins` → `chat-view` → `Feature Settings`

| Setting                                       | Options                                   | Description                                                                                                                                                                                                                                                                       |
| :-------------------------------------------- | :---------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mermaid Diagrams**                          | Enabled (default) / Disabled              | Controls plugin rendering; disabling restores Paseo's native message and diagram display.                                                                                                                                                                                         |
| **Compact Activity (compact-agent-activity)** | Enabled (default) / Disabled              | Controls reasoning and tool-call enhancement; disabling restores the native timeline.                                                                                                                                                                                             |
| **Sticky Questions**                          | Enabled (default) / Disabled              | Controls sticky questions for all conversations; disabling removes them immediately. Desktop and Web only.                                                                                                                                                                        |
| **Lock Sent Messages**                        | Enabled (default) / Disabled              | Hides "Revert to this message" after sending so content cannot be rewritten; desktop and Web only.                                                                                                                                                                                |
| **Prompt Enhancement**                        | Enabled (default off) / Disabled          | Controls the enhance button next to the input box and the `/enhance` command; a model endpoint must be configured first.                                                                                                                                                          |
| **API URL / API Key / Model**                 | Text                                      | Any OpenAI Chat Completions compatible endpoint; the key is stored in host settings (0600).                                                                                                                                                                                       |
| **Test Connection**                           | Button                                    | Sends one minimal request with the current configuration to verify URL, key, and model; shows latency and the actual endpoint.                                                                                                                                                    |
| **Display Mode**                              | `Folded` (default) / `Detailed`           | Chooses the upstream aggregated summary or per-item details; old Codex settings migrate to Folded.                                                                                                                                                                                |
| **Color Theme**                               | `Vivid` / `Soft` / `High contrast`        | Fits different terminal aesthetics and high-contrast accessibility needs.                                                                                                                                                                                                         |
| **UI Language**                               | `简体中文` (default) / `English` / `Auto` | Language of the plugin's own text: settings page, sticky bar, pills and buttons, and the messages the enhancement flow reports. It is not the language the model answers in — that follows your request. `Auto` follows the browser language and falls back to Chinese on native. |

_Note: settings are persisted per host. Existing display mode and color theme configuration is preserved. The settings page and open conversations update immediately; timeline switches in other clients sync within about 2 seconds, with no need to restart the daemon. While compact activity is disabled, its display mode and color theme options cannot be changed; the language choice is never disabled, and changing it relabels the settings page, the sticky bar and the composer pills at once._

_Text fields (API URL / key / model) are written about 300ms after you stop typing and immediately when you leave the field; the host treats a content hash as the revision and rejects writes based on a stale revision, so submitting keystroke by keystroke would race with the round trip and drop characters (see `DraftField` in `client/settings.tsx`)._

---

## Architecture & Technical Boundaries

1. **Public SDK only**
   - The production plugin depends entirely on `@getpaseo/client`, `@getpaseo/plugin`, and `@getpaseo/protocol` (per the 0.10.3 spec). It does not import host private source and does not intrude on the Paseo daemon.
2. **Isolated DOM enhancement boundary**
   - Host 0.10.3 does not yet expose a native conversation overlay API. Sticky behavior injects DOM enhancements into the native scroll area through `client/sticky/dom.ts` and matches turns precisely via timeline message IDs.
   - All DOM access is strictly confined to Web / desktop environments; native mobile runs purely on React Native with no DOM pollution.
   - DOM knowledge is private per feature domain: sticky, compact activity, and prompt enhancement each own a `dom.ts` invisible to the others; only the minimal DOM type declarations they use are shared in `client/dom.ts`.
3. **Read-only session boundary**
   - Archived read-only conversations do not mount the composer sticky controller, so the sticky bar is currently not shown there.

---

## Project Structure

### Dual-axis layout: the outer axis is set by the host, the inner axis by feature

The host compiler assigns every module in the plugin's import graph to a location; only code inside the three directories below (or the two root entry files) is compiled. Anything else fails with `Plugin modules belong in client/, server/, or shared/`:

| Directory | Side   | What is allowed                                                                             |
| --------- | ------ | ------------------------------------------------------------------------------------------- |
| `client/` | Client | React, React Native, hooks, styles, DOM work, callbacks                                     |
| `server/` | Server | Node APIs, filesystem and process access, credentials, handlers                             |
| `shared/` | Both   | Zod contracts and pure values; **must not** reference React components, hooks, or Node APIs |

The project therefore uses a **dual-axis** structure: the outer axis is decided by the host, the inner axis (feature domains) by this project. The four domains are `sticky` (sticky questions), `activity` (compact activity), `mermaid` (diagram rendering), and `enhance` (prompt enhancement); each has a directory of the same name under every runtime layer that needs it.

```text
chat-view/
├── paseo-plugin.json          Host manifest (strictly validated)
├── index.client.tsx           Fixed entry: registration wiring only
├── index.server.ts            Fixed entry: registers settings and the provider
│
├── client/                    ── Client runtime
│   ├── features.ts            Subscribes to host settings and agent updates, distributes toggles and agents to domains
│   ├── settings.tsx           Settings page: the four domains' toggles and the language choice
│   ├── locale.ts              The live plugin language; its only writer is createFeatureController.apply
│   ├── feature.ts             Interface between domains and the assembler
│   ├── agent-pills.ts         Mounts and reclaims composer pills per agent
│   ├── timeline-pager.ts      Forward pagination over the host timeline handle
│   ├── dom.ts                 Minimal DOM type declarations shared by the domains
│   │
│   ├── sticky/                ── Sticky questions
│   │   ├── index.ts           createStickyDomain
│   │   ├── StickyBar.tsx      useStickyMessage mounts the sticky bar
│   │   ├── pill.tsx           createStickyPill and toggle state
│   │   └── dom.ts             Scroll container detection and sticky bar injection
│   │
│   ├── readonly/              ── Lock sent messages
│   │   ├── index.ts           createReadonlyDomain (no React state, no agent wiring)
│   │   └── dom.ts             The stylesheet that hides the host's rewind control
│   │
│   ├── activity/              ── Compact activity
│   │   ├── index.ts           createActivityDomain
│   │   ├── Activity.tsx       Timeline row rendering (folded group / detail panel)
│   │   ├── styles.ts          Palette and style derivation (no inbound edges; never depend on it in reverse)
│   │   ├── history.ts         History forward pagination
│   │   ├── group-store.ts     Folded group store
│   │   ├── disclosure.ts      Expand / collapse state
│   │   ├── transform.ts       Timeline transformer
│   │   ├── highlight.ts       First-frame syntax highlighting
│   │   ├── latest-marker.ts   Deferred notifications for the "latest item" marker
│   │   ├── dom.ts             Scoped stylesheets and scroll positioning
│   │   ├── detail/            Collapsed-row bodies, one module per detail type
│   │   │   ├── index.tsx      DetailBody dispatch
│   │   │   ├── parts.tsx      Labels, path rows, highlighted code, diff blocks
│   │   │   ├── file.tsx       read / write / edit
│   │   │   ├── search.tsx     search / fetch
│   │   │   ├── terminal.tsx   shell / worktree setup
│   │   │   ├── texts.tsx      sub-agent / plain text / plan
│   │   │   └── dispatch.tsx   Unknown-detail fallback
│   │   └── tools/             Tool detail panels (fourth layer)
│   │       ├── shared.tsx     Display building blocks and value helpers reused across tool families
│   │       ├── list.tsx       Shared list-row rendering
│   │       ├── exa.tsx        Exa search tool family
│   │       ├── github.tsx     GitHub tool family
│   │       ├── child-agent.tsx Sub-agent dispatch
│   │       └── paseo/         Paseo tool family, one module per tool group
│   │                          (index · parts · agent · browser · provider · schedule · speak · terminal · workspace)
│   │
│   ├── mermaid/               ── Mermaid diagrams
│   │   ├── index.ts           createMermaidDomain
│   │   ├── registration.ts    Host renderer and transformer registration
│   │   ├── item.tsx           Timeline item
│   │   ├── markdown.tsx       Lightweight Markdown rendering
│   │   ├── diagram.tsx        Diagram drawing
│   │   ├── viewer.tsx         Full-screen preview
│   │   └── toolbar.tsx        Zoom / fit width / source toggle
│   │
│   └── enhance/               ── Prompt enhancement
│       ├── index.ts           createEnhanceDomain
│       ├── controller.ts      Enhancement flow orchestration
│       ├── state.ts           Enhancement state across conversations
│       ├── pill.tsx           Composer track button
│       └── dom.ts             Input detection and button injection
│
├── server/                    ── Server runtime (Node needed by the enhance domain only)
│   └── enhance/
│       ├── index.ts           registerEnhance
│       ├── provider.ts        Model endpoint calls
│       ├── probe.ts           Repository environment probing
│       └── manifest.ts        Manifest file reading
│
└── shared/                    ── Shared by both sides
    ├── settings.ts            Host-level settings contract (shared by four domains; the host accepts only a single contract, so splitting it would turn one write into cross-module coordination—hence not split)
    ├── i18n.ts                Message catalogue for both languages, `t()` interpolation, and the `localeSchema` the enhancement RPC sends
    ├── sticky/history.ts      PromptHistory turn data
    ├── activity/
    │   ├── palette.ts         Theme tokens → the shared ActivityPalette
    │   ├── tool-presentation.ts  Timeline item → title, icon, category, summary
    │   ├── text.ts            Text budgets, lenient JSON formatting, value to text
    │   ├── diff.ts            Line diffs and +/- statistics
    │   ├── file-kind.ts       Path → language, file icon
    │   ├── paseo-tools.ts     Paseo tool name → category
    │   ├── timeline.ts        Renderer kind and schema
    │   ├── parse.ts           Markdown parsing of reasoning bodies
    │   ├── child-agent.ts     Sub-agent timeline contract
    │   ├── github.ts          GitHub tool metadata
    │   └── exa.ts             Exa search tool metadata
    ├── mermaid/               parse · segment · flowchart · sequence
    │                          layout · zoom · transform
    └── enhance/               contract · decide · parse · policy
                               normalize · prompt · run
                               failure (typed provider failure, worded per locale)
                               index (barrel)
```

### Naming conventions

- Directory and module file names are always `kebab-case`; a domain's main component file uses `PascalCase` (`Activity.tsx`, `StickyBar.tsx`).
- Each domain's exit point is `index.ts`, exposing only that domain's public surface.
- Files with the same name in different feature domains are disambiguated by directory (each domain has its own `dom.ts` / `index.ts` / `parse.ts`); this is a deliberate consistent shape, not a conflict.
- When the parsing and rendering layers share a name, the parsing layer is always `parse.ts` (`shared/*/parse.ts`) while the rendering layer keeps the domain name (`client/mermaid/markdown.tsx`).
- Tests live next to the implementation as pairs named `<module-under-test>.test.ts`; test files are always `.ts`, consistent with `exclude` in `tsconfig.json`.

### Change discipline

- **New features**: create the matching feature directory under `client/` `server/` `shared/`, export the implementation from that domain's `index.ts`, then add `create*Domain` to the domain list in `client/features.ts`. The assembler needs to know nothing about a domain's internals; a domain with a composer pill additionally implements `registerAgent` / `unregisterAgent` on `FeatureDomain`, with the assembler forwarding agent adds and removes.
- **DOM-related changes** may only go in the matching domain's `dom.ts`; when adding a DOM capability, extend the type declarations in `client/dom.ts` rather than scattering selectors elsewhere.
- **Do not** put code outside `client/` `server/` `shared/` and the two root entry files—the host compiler rejects it. Before adding a top-level directory, confirm it will not enter the import graph.
- `client/activity/styles.ts` must keep no inbound edges (depending on nothing else in the domain except types), otherwise the `Activity ↔ tools/*` cycle comes back.
- **User-facing text** lives in the catalogue in `shared/i18n.ts` (one entry per language) and is read through `t(locale, key)` in React or `tr(key)` outside it; `client/locale.ts` holds the running language and only `apply()` in `client/features.ts` writes it. `shared/i18n.test.ts` fails on a key no source file uses, so drop the entries you stop using.
- **The model's own text stays out of the catalogue**: the enhancement system prompt and the policy table are deliberately fixed Chinese, and the activity domain's field labels are deliberately English.

---

## Local Development & Testing

> For the in-depth development guide and architectural constraints, see [AGENTS.md](./AGENTS.md).
> The original requirement archive (`PRD.md`) is no longer in the working tree; retrieve it from git history when needed: `git show fb6d53f:PRD.md`.

### Setup and static checks

```bash
# Install dependencies
npm ci

# TypeScript type check
npm run typecheck

# Lint (oxlint)
npm run lint

# Format check (oxfmt)
npm run format:check

# Auto format
npm run format
```

### Running unit tests

Following the minimal-necessary principle, run only the targeted suites affected by your change:

```bash
# 1. Verify sticky questions and history turn logic
npm test -- shared/sticky/history.test.ts --run --bail=1

# 2. Verify the compact activity transformer, state store, and registration flow
npm test -- client/registration.test.ts client/activity --run --bail=1

# 3. Verify Mermaid syntax parsing and diagram transforms
npm test -- shared/mermaid --run --bail=1

# 4. Verify feature toggles and scroll flicker regressions
npm test -- client/features.test.ts client/sticky/dom.test.ts client/activity/dom.test.ts client/enhance/dom.test.ts --run --bail=1

# 5. Verify prompt enhancement core logic and environment probing
npm test -- shared/enhance server/enhance --run --bail=1

# 6. Verify the message catalogue and the language switch
npm test -- shared/i18n.test.ts --run --bail=1

# 7. Verify read-only sent messages and timeline paging
npm test -- client/readonly client/timeline-pager.test.ts --run --bail=1
```

> [!TIP]
> `client/registration.test.ts` invokes the host's real Paseo compiler. The default source path is the sibling directory `../paseo`; if yours differs, override it with an environment variable:<br>
> `PASEO_SOURCE_DIR=/path/to/paseo npm test -- client/registration.test.ts --run --bail=1`

---

## Credits & Licenses

This project incorporates and builds on the core work of the following open-source projects:

- **[beautiful-chat](https://github.com/ABorakati/beautiful-chat)**
  - Informed the scroll container detection and DOM-injection sticky architecture.
- **[compact-agent-activity](https://github.com/cnaron/compact-agent-activity)**
  - The compact activity summary computation, color palette, and detail panel rendering are deeply based on this project.
  - Copyright Matt Cowger, MIT licensed; see [LICENSE.compact-agent-activity](./LICENSE.compact-agent-activity) for the full notice.
- **[paseo-plugin-mermaid](https://github.com/dutchakdev/paseo-plugin-mermaid)**
  - Adopts its 0.2.0 (commit `95cf07db794f6be3e121a41a7e774e3fdde3ccf5`) cross-platform diagram parsing and rendering modules.
  - Copyright dutchakdev, MIT licensed; see [LICENSE.mermaid](./LICENSE.mermaid) for the full notice.
