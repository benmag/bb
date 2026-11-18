import type { DictationPhrase } from "./dictation-draft";

const OVERLAY_ID = "bb-dictation-overlay";
const PHRASE_COLOR_COUNT = 4;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 24;

interface TapHandlers {
  root: HTMLElement;
  onTap: (offset: number) => void;
  onDoubleTap: (offset: number) => void;
}

const tapHandlers: TapHandlers = {
  root: null as unknown as HTMLElement,
  onTap: () => {},
  onDoubleTap: () => {},
};
let lastTap = { time: 0, x: 0, y: 0 };

export function clearDictationOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function renderDictationOverlay({
  root,
  phrases,
  selectionStart,
  selectionEnd,
  onTap,
  onDoubleTap,
}: {
  root: HTMLElement;
  phrases: readonly DictationPhrase[];
  selectionStart: number;
  selectionEnd: number;
  onTap: (offset: number) => void;
  onDoubleTap: (offset: number) => void;
}): void {
  const overlay = ensureOverlay(root.ownerDocument);
  const tap = ensureTapTarget(overlay);
  tapHandlers.root = root;
  tapHandlers.onTap = onTap;
  tapHandlers.onDoubleTap = onDoubleTap;
  placeAt(tap, root.getBoundingClientRect());
  const marks = ensureMarks(overlay);
  marks.replaceChildren();

  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selectedIndex = phrases.findIndex(
    (phrase) => phrase.start === start && phrase.end === end,
  );

  phrases.forEach((phrase, index) => {
    if (index === selectedIndex) return;
    for (const rect of rectsForOffsets(root, phrase.start, phrase.end)) {
      marks.appendChild(
        underlineElement(root.ownerDocument, rect, index, phrase.revising),
      );
    }
  });

  if (start === end) {
    const caret = caretElement(root, start);
    if (caret !== null) marks.appendChild(caret);
    return;
  }

  const selectionColor = phraseColor(selectedIndex < 0 ? 0 : selectedIndex);
  for (const rect of rectsForOffsets(root, start, end)) {
    const fill = root.ownerDocument.createElement("div");
    fill.dataset.dictationSelection = "";
    fill.style.setProperty("--bb-dictation-phrase", selectionColor);
    placeAt(fill, rect);
    marks.appendChild(fill);
  }
}

function ensureOverlay(document: Document): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing !== null) return existing;
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);
  return overlay;
}

function ensureTapTarget(overlay: HTMLElement): HTMLElement {
  const existing = overlay.querySelector<HTMLElement>("[data-dictation-tap]");
  if (existing !== null) return existing;
  const tap = overlay.ownerDocument.createElement("div");
  tap.dataset.dictationTap = "";
  tap.addEventListener("touchstart", (event) => event.preventDefault(), {
    passive: false,
  });
  tap.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const offset = offsetFromPoint(
        tapHandlers.root,
        event.clientX,
        event.clientY,
      );
      if (offset === null) return;
      const now = event.timeStamp;
      const isDouble =
        now - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <
          DOUBLE_TAP_DISTANCE;
      lastTap = { time: now, x: event.clientX, y: event.clientY };
      if (isDouble) {
        lastTap.time = 0;
        tapHandlers.onDoubleTap(offset);
        return;
      }
      tapHandlers.onTap(offset);
    },
    { passive: false },
  );
  overlay.appendChild(tap);
  return tap;
}

function ensureMarks(overlay: HTMLElement): HTMLElement {
  const existing = overlay.querySelector<HTMLElement>("[data-dictation-marks]");
  if (existing !== null) return existing;
  const marks = overlay.ownerDocument.createElement("div");
  marks.dataset.dictationMarks = "";
  overlay.appendChild(marks);
  return marks;
}

function underlineElement(
  document: Document,
  rect: DOMRect,
  index: number,
  revising: boolean,
): HTMLElement {
  const underline = document.createElement("div");
  underline.dataset.dictationUnderline = revising ? "revising" : "settled";
  underline.style.setProperty("--bb-dictation-phrase", phraseColor(index));
  placeAt(
    underline,
    new DOMRect(rect.left, rect.bottom - 1, Math.max(rect.width, 2), 2),
  );
  return underline;
}

function caretElement(root: HTMLElement, offset: number): HTMLElement | null {
  const rect = caretRect(root, offset);
  if (rect === null) return null;
  const caret = root.ownerDocument.createElement("div");
  caret.dataset.dictationCaret = "";
  placeAt(
    caret,
    new DOMRect(rect.left, rect.top, 2, Math.max(rect.height, 16)),
  );
  return caret;
}

function placeAt(element: HTMLElement, rect: DOMRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function phraseColor(index: number): string {
  return `var(--dictation-phrase-${(index % PHRASE_COLOR_COUNT) + 1})`;
}

function offsetFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
): number | null {
  const range = root.ownerDocument.createRange();
  let base = 0;
  let bestOffset: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const node of textNodes(root)) {
    for (let index = 0; index < node.data.length; index += 1) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const verticalMiss =
        y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const middle = rect.left + rect.width / 2;
      const score = verticalMiss * 1000 + Math.abs(x - middle);
      if (score >= bestScore) continue;
      bestScore = score;
      bestOffset = base + (x > middle ? index + 1 : index);
    }
    base += node.data.length;
  }
  return bestOffset ?? (base === 0 ? null : base);
}

function rectsForOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): DOMRect[] {
  const range = rangeForOffsets(root, start, end);
  if (range === null) return [];
  return [...range.getClientRects()].filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
}

function caretRect(root: HTMLElement, offset: number): DOMRect | null {
  const leading = rectsForOffsets(root, Math.max(offset - 1, 0), offset)[0];
  if (leading !== undefined) {
    return new DOMRect(leading.right, leading.top, 0, leading.height);
  }
  const trailing = rectsForOffsets(root, offset, offset + 1)[0];
  if (trailing !== undefined) {
    return new DOMRect(trailing.left, trailing.top, 0, trailing.height);
  }
  const fallback = root.getBoundingClientRect();
  return new DOMRect(fallback.left, fallback.top, 0, 0);
}

function rangeForOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const startPosition = positionAtTextOffset(root, start);
  const endPosition = positionAtTextOffset(root, end);
  if (startPosition === null || endPosition === null) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return range;
}

function positionAtTextOffset(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  let remaining = offset;
  let last: Text | null = null;
  for (const node of textNodes(root)) {
    last = node;
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  if (last === null) return null;
  return { node: last, offset: last.data.length };
}

function textNodes(root: HTMLElement): Text[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    if (current instanceof Text) nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}
