import { Platform } from "react-native";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { subscribeLocale, tr } from "../locale";
import type { Document, Element, MutationObserverApi, ResizeObserverApi, Window } from "../dom";

// Sticky-question DOM access: host scroll-container discovery, the overlay bar and its 100ms
// show confirmation live here. No other feature reaches into the conversation viewport.
declare const document: Document;
declare const window: Window;
declare const MutationObserver: new (
  callback: (records: Array<{ target: unknown }>) => void,
) => MutationObserverApi;
declare const ResizeObserver: new (callback: () => void) => ResizeObserverApi;

export interface StickyPrompt {
  id: string;
  text: string;
  aliases?: readonly string[];
}

/** Resolve the preceding user prompt for a mounted history row, including virtualized history. */
export type ResolveStickyPrompt = (
  rowId: string,
  messageId: string | null,
) => StickyPrompt | undefined;

const SCROLL_SELECTOR = '[data-testid="agent-chat-scroll"]';
const ROW_SELECTOR = "[data-history-row-id], [data-chat-view-hidden-row-id]";
export interface StickyColors {
  background: string;
  foreground: string;
  muted: string;
  border: string;
}
const installations = new Map<Element, { count: number; cleanup: () => void }>();

export function getStickyViewport(anchor: unknown): unknown | undefined {
  if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
  let element = anchor as Element | null;
  const direct = element?.closest?.(SCROLL_SELECTOR);
  if (direct) return direct;
  while (element) {
    const scrolls = element.querySelectorAll(SCROLL_SELECTOR);
    if (scrolls.length === 1) return scrolls[0];
    if (scrolls.length > 1) return undefined;
    element = element.parentElement;
  }
  return undefined;
}

/** Decorate the host viewport without replacing native prompts or touching its scrolling model. */
export function installStickyMessages(
  anchor: unknown,
  resolvePrompt: ResolveStickyPrompt,
  colors: StickyColors,
  subscribeChanges?: (listener: () => void) => () => void,
  onDetached?: () => void,
  getLatestPrompt?: () => StickyPrompt | undefined,
): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const foundScroller = getStickyViewport(anchor) as Element | undefined;
  if (!foundScroller) return () => {};
  const scroller: Element = foundScroller;
  const existing = installations.get(scroller);
  if (existing) {
    existing.count += 1;
    return () => release(scroller);
  }

  let overlay:
    | { bar: Element; label: Element; text: Element; toggle: Element; resetCopy: () => void }
    | undefined;
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingPromptId: string | undefined;
  let showReady = false;
  let frame: number | null = null;
  let stopped = false;
  let lastPrompt: StickyPrompt | undefined;
  let lastContentBounds: { left: number; width: number } | undefined;
  const appliedStyles: Record<string, string> = {};
  let expanded = false;
  let displayedPromptId: string | undefined;
  let textLineHeight = 21;
  let userAppearance: Record<string, string> = {
    backgroundColor: colors.background,
    border: "0",
    borderRadius: "16px",
    borderTopRightRadius: "2px",
    padding: "16px",
  };

  function cancelPendingShow() {
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = undefined;
    pendingPromptId = undefined;
    showReady = false;
  }

  let userAppearanceMatched = false;
  function matchUserAppearance(rows: Element[]) {
    if (userAppearanceMatched) return userAppearance;
    const message = rows
      .map((row) => row.querySelector('[data-testid="user-message"] [data-message-text="true"]'))
      .find(Boolean);
    if (message?.parentElement) {
      userAppearanceMatched = true;
      const bubble = window.getComputedStyle(message.parentElement);
      for (const key of [
        "backgroundColor",
        "borderRadius",
        "borderTopRightRadius",
        "paddingTop",
        "paddingBottom",
        "paddingLeft",
        "paddingRight",
      ]) {
        userAppearance[key] = bubble[key] ?? "";
      }
      const text = window.getComputedStyle(message);
      textLineHeight = Number.parseFloat(text.lineHeight ?? "") || 21;
      if (overlay)
        Object.assign(overlay.text.style, {
          fontSize: text.fontSize,
          lineHeight: `${textLineHeight}px`,
          fontFamily: text.fontFamily,
        });
    }
    return userAppearance;
  }

  function updateDisclosure(prompt: StickyPrompt, viewportHeight: number) {
    if (!overlay) return;
    if (displayedPromptId !== prompt.id) {
      displayedPromptId = prompt.id;
      expanded = false;
      overlay.resetCopy();
      overlay.text.scrollTop = 0;
    }
    overlay.text.style.WebkitLineClamp = expanded ? "unset" : "3";
    overlay.text.style.display = expanded ? "block" : "-webkit-box";
    overlay.text.style.maxHeight = expanded
      ? `${Math.max(textLineHeight * 3, viewportHeight - 96)}px`
      : `${textLineHeight * 3}px`;
    overlay.text.style.overflowY = expanded ? "auto" : "hidden";
    const overflowing = overlay.text.scrollHeight > overlay.text.clientHeight + 1;
    overlay.toggle.style.display = expanded || overflowing ? "block" : "none";
    describeDisclosure();
  }

  /** The toggle's own wording, set by a new frame and by a language change alike. */
  function describeDisclosure() {
    if (!overlay) return;
    const title = expanded ? tr("sticky.collapse") : tr("sticky.more");
    if (overlay.toggle.textContent !== title) overlay.toggle.textContent = title;
    overlay.toggle.setAttribute(
      "aria-label",
      expanded ? tr("sticky.ariaCollapse") : tr("sticky.ariaExpand"),
    );
    overlay.toggle.setAttribute("aria-expanded", String(expanded));
  }

  /** Static overlay text lives in nodes created once, so a language change rewrites it here. */
  function relabelOverlay() {
    if (!overlay) return;
    overlay.label.textContent = tr("sticky.label");
    overlay.resetCopy();
    describeDisclosure();
  }

  function nativePrompt(row: Element): StickyPrompt | undefined {
    const text = row.querySelector(
      '[data-testid="user-message"] [data-message-text="true"]',
    )?.textContent;
    const id = row.getAttribute("data-history-row-id");
    return text?.trim() && id ? { id, text } : undefined;
  }

  function resolveRow(row: Element): StickyPrompt | undefined {
    return (
      nativePrompt(row) ??
      resolvePrompt(
        row.getAttribute("data-history-row-id") ?? "",
        row.getAttribute("data-message-id"),
      )
    );
  }

  function readingContext(rows: Element[], viewportTop: number, atBottom: boolean) {
    const firstIndex = rows.findIndex(
      (row) => row.getBoundingClientRect().bottom > viewportTop + 1,
    );
    const index = atBottom || firstIndex < 0 ? rows.length - 1 : firstIndex;
    let prompt = atBottom ? getLatestPrompt?.() : undefined;
    for (let previous = index; !prompt && previous >= 0; previous -= 1) {
      prompt = resolveRow(rows[previous]!);
    }
    // Keep context during a virtualizer's transient empty frame or an async history lookup.
    prompt ??= lastPrompt;
    if (prompt) lastPrompt = prompt;
    return { index, prompt };
  }

  function promptIsVisible(rows: Element[], prompt: StickyPrompt, top: number, bottom: number) {
    const ids = new Set([prompt.id, ...(prompt.aliases ?? [])]);
    const row = rows.find(
      (item) =>
        ids.has(item.getAttribute("data-history-row-id") ?? "") ||
        ids.has(item.getAttribute("data-message-id") ?? ""),
    );
    if (!row) return false;
    const message = row.querySelector('[data-testid="user-message"] [data-message-text="true"]');
    const rect = (message ?? row).getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom;
  }

  function contentBounds(row: Element | undefined, viewportLeft: number) {
    if (lastContentBounds && lastContentBounds.width > 0) {
      return lastContentBounds;
    }
    const content = row?.firstElementChild;
    if (content) {
      const rect = content.getBoundingClientRect();
      const style = window.getComputedStyle(content);
      const paddingLeft = Number.parseFloat(style.paddingLeft ?? "0") || 0;
      const paddingRight = Number.parseFloat(style.paddingRight ?? "0") || 0;
      if (rect.width > 0)
        lastContentBounds = {
          left: rect.left + paddingLeft,
          width: rect.width - paddingLeft - paddingRight,
        };
    }
    return lastContentBounds ?? { left: viewportLeft + 16, width: scroller.clientWidth - 32 };
  }

  function createOverlay() {
    const parent = scroller.parentElement;
    if (!parent) return undefined;
    const bar = document.createElement("div");
    bar.setAttribute("data-conversation-sticky-message", "true");
    bar.setAttribute("role", "note");
    Object.assign(bar.style, {
      position: "absolute",
      zIndex: "20",
      boxSizing: "border-box",
      display: "none",
      padding: "10px 16px",
      pointerEvents: "auto",
      border: "1px solid",
      borderRadius: "8px",
      overflow: "hidden",
      fontFamily: "inherit",
      lineHeight: "20px",
    });
    const label = document.createElement("div");
    label.textContent = tr("sticky.label");
    Object.assign(label.style, { fontSize: "11px", lineHeight: "16px", marginBottom: "2px" });
    label.style.color = colors.muted;
    const text = document.createElement("div");
    Object.assign(text.style, {
      fontSize: "15px",
      lineHeight: "21px",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: "3",
      overflow: "hidden",
    });
    const message = document.createElement("div");
    Object.assign(message.style, { minWidth: "0" });
    const copy = document.createElement("button");
    copy.setAttribute("type", "button");
    copy.setAttribute("data-sticky-copy", "true");
    copy.setAttribute("aria-label", tr("sticky.copy"));
    copy.setAttribute("title", tr("sticky.copy"));
    Object.assign(copy.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      marginLeft: "auto",
      width: "24px",
      height: "24px",
      padding: "5px",
      border: "0",
      borderRadius: "4px",
      background: "transparent",
      color: colors.muted,
      cursor: "pointer",
      transition: "background-color 150ms ease",
    });
    const hoverStyle = document.createElement("style");
    hoverStyle.textContent = `
      [data-conversation-sticky-message] [data-sticky-copy]:hover,
      [data-conversation-sticky-message] [data-sticky-copy]:focus-visible {
        background-color: color-mix(in srgb, currentColor 10%, transparent) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-conversation-sticky-message] [data-sticky-copy] {
          transition: none !important;
        }
      }
    `;
    bar.appendChild(hoverStyle);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.75",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      icon.setAttribute(name, value);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [name, value] of Object.entries({
      x: "9",
      y: "9",
      width: "13",
      height: "13",
      rx: "2",
    }))
      rect.setAttribute(name, value);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
    icon.appendChild(rect);
    icon.appendChild(path);
    copy.appendChild(icon);
    const copyPath = path.getAttribute("d")!;
    function resetCopy() {
      if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
      rect.style.display = "";
      path.setAttribute("d", copyPath);
      copy.setAttribute("title", tr("sticky.copy"));
      copy.setAttribute("aria-label", tr("sticky.copy"));
    }
    copy.addEventListener("click", () => {
      const copiedText = text.textContent ?? "";
      resetCopy();
      void copyText(copiedText).then(
        () => {
          if (stopped || text.textContent !== copiedText) return;
          rect.style.display = "none";
          path.setAttribute("d", "M5 12l4 4L19 6");
          copy.setAttribute("title", tr("sticky.copied"));
          copy.setAttribute("aria-label", tr("sticky.ariaCopied"));
          copyResetTimer = setTimeout(resetCopy, 1800);
        },
        () => copy.setAttribute("title", tr("sticky.copyFailed")),
      );
    });
    message.appendChild(text);
    const toggle = document.createElement("button");
    toggle.setAttribute("type", "button");
    toggle.setAttribute("aria-label", tr("sticky.ariaExpand"));
    Object.assign(toggle.style, {
      display: "none",
      border: "0",
      background: "transparent",
      color: colors.foreground,
      fontSize: "12px",
      lineHeight: "20px",
      padding: "4px 0 0",
      cursor: "pointer",
    });
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      schedule();
    });
    bar.appendChild(label);
    bar.appendChild(message);
    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      marginTop: "4px",
    });
    actions.appendChild(toggle);
    actions.appendChild(copy);
    bar.appendChild(actions);
    parent.appendChild(bar);
    return { bar, label, text, toggle, resetCopy };
  }

  function update() {
    frame = null;
    if (stopped) return;
    if (!scroller.isConnected) {
      installations.get(scroller)?.cleanup();
      installations.delete(scroller);
      onDetached?.();
      return;
    }
    overlay ??= createOverlay();
    if (!overlay) return;
    const viewport = scroller.getBoundingClientRect();
    const rows = Array.from(scroller.querySelectorAll(ROW_SELECTOR));
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2;
    const { index: readingIndex, prompt } = readingContext(rows, viewport.top, atBottom);
    if (
      !prompt ||
      !prompt.text.trim() ||
      promptIsVisible(rows, prompt, viewport.top, viewport.bottom) ||
      viewport.height <= 0 ||
      viewport.width <= 0
    ) {
      cancelPendingShow();
      if (overlay.bar.style.display !== "none") overlay.bar.style.display = "none";
      appliedStyles.display = "none";
      return;
    }
    // A virtualized row may disappear for a frame. Hide immediately when the prompt is visible,
    // but require a stable absence before showing the bar to avoid flashing during reconciliation.
    if (overlay.bar.style.display !== "block") {
      if (pendingPromptId !== prompt.id) {
        cancelPendingShow();
        pendingPromptId = prompt.id;
        showTimer = setTimeout(() => {
          showTimer = undefined;
          showReady = true;
          schedule();
        }, 100);
      }
      if (!showReady) return;
    }
    cancelPendingShow();
    const parent = scroller.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const bounds = contentBounds(rows[readingIndex], viewport.left);
    const topOffset = Math.round(viewport.top - parentRect.top - parent.clientTop);
    const styles = {
      display: "block",
      top: `${Math.abs(topOffset) <= 1 ? 0 : topOffset}px`,
      left: `${bounds.left - parentRect.left - parent.clientLeft}px`,
      width: `${bounds.width}px`,
      color: colors.foreground,
      backgroundColor: colors.background,
      borderColor: colors.border,
      ...matchUserAppearance(rows),
    };
    // Avoid writing identical inline styles on every stream/scroll frame.
    for (const [key, value] of Object.entries(styles)) {
      if (appliedStyles[key] !== value) {
        overlay.bar.style[key] = value;
        appliedStyles[key] = value;
      }
    }
    if (overlay.text.textContent !== prompt.text) overlay.text.textContent = prompt.text;
    updateDisclosure(prompt, viewport.height);
  }
  function schedule() {
    if (!stopped && frame === null) frame = window.requestAnimationFrame(update);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(scroller, {
    childList: true,
    subtree: true,
  });
  const parentElement = scroller.parentElement;
  const detachObserver = parentElement
    ? new MutationObserver(() => {
        if (!scroller.isConnected) schedule();
      })
    : null;
  if (parentElement && detachObserver) detachObserver.observe(parentElement, { childList: true });
  const onResize = () => {
    lastContentBounds = undefined;
    userAppearanceMatched = false;
    schedule();
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(scroller);
  // Listen on the scroller itself: a capture-phase listener on document also fires for the
  // plugin's own nested scroll panels, each forcing a full-viewport layout pass.
  scroller.addEventListener("scroll", schedule);
  window.addEventListener("resize", onResize);
  const unsubscribe = subscribeChanges?.(schedule);
  const unsubscribeLocale = subscribeLocale(() => {
    relabelOverlay();
    schedule();
  });
  schedule();
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    detachObserver?.disconnect();
    resizeObserver.disconnect();
    unsubscribe?.();
    unsubscribeLocale();
    scroller.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", onResize);
    if (frame !== null) window.cancelAnimationFrame(frame);
    cancelPendingShow();
    if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
    overlay?.bar.remove();
  };
  installations.set(scroller, { count: 1, cleanup });
  return () => release(scroller);
}

function release(scroller: Element) {
  const installation = installations.get(scroller);
  if (!installation) return;
  installation.count -= 1;
  if (installation.count === 0) {
    installation.cleanup();
    installations.delete(scroller);
  }
}
