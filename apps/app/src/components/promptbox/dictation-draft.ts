export interface DictationEdit {
  draft: string;
  appliedLive: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface DictationPhrase {
  start: number;
  end: number;
  revising: boolean;
}

export function applyLiveTranscript(
  state: DictationEdit,
  live: string,
): DictationEdit {
  if (live.startsWith(state.appliedLive)) {
    let delta = live.slice(state.appliedLive.length);
    if (delta.length === 0) return { ...state, appliedLive: live };
    const start = Math.min(state.selectionStart, state.selectionEnd);
    const end = Math.max(state.selectionStart, state.selectionEnd);
    const appending =
      state.appliedLive.length === 0 && start === end && start === state.draft.length;
    if (
      appending &&
      state.draft.length > 0 &&
      !/\s$/.test(state.draft) &&
      !/^\s/.test(delta)
    ) {
      delta = ` ${delta}`;
    }
    if (
      start !== end &&
      delta.startsWith(" ") &&
      (start === 0 || state.draft[start - 1] === " ")
    ) {
      delta = delta.slice(1);
    }
    return insertAtSelection(state, delta, live);
  }
  if (
    state.appliedLive.length > 0 &&
    state.draft.endsWith(state.appliedLive)
  ) {
    const base = state.draft.slice(
      0,
      state.draft.length - state.appliedLive.length,
    );
    const draft = `${base}${live}`;
    return {
      draft,
      appliedLive: live,
      selectionStart: draft.length,
      selectionEnd: draft.length,
    };
  }
  return { ...state, appliedLive: live };
}

export function adoptUserText(
  state: DictationEdit,
  text: string,
): DictationEdit {
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  const prefix = state.draft.slice(0, start);
  const suffix = state.draft.slice(end);
  const caret =
    text.startsWith(prefix) && text.endsWith(suffix)
      ? text.length - suffix.length
      : text.length;
  return {
    draft: text,
    appliedLive: state.appliedLive,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export function locatePhrases(
  draft: string,
  batches: readonly string[],
): DictationPhrase[] {
  const phrases: DictationPhrase[] = [];
  let from = 0;
  const spoken = batches.map((batch) => batch.trim()).filter((batch) => batch.length > 0);
  spoken.forEach((batch, index) => {
    const start = draft.indexOf(batch, from);
    if (start < 0) return;
    const end = start + batch.length;
    phrases.push({
      start,
      end,
      revising: index === spoken.length - 1,
    });
    from = end;
  });
  return phrases;
}

export function deleteRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; caret: number } {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const left = text.slice(0, start);
  const right = text.slice(end);
  if (left.endsWith(" ") && right.startsWith(" ")) {
    return { text: `${left}${right.slice(1)}`, caret: left.length };
  }
  return { text: `${left}${right}`, caret: left.length };
}

export function wordAtOffset(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  if (text.length === 0) return null;
  let index = Math.max(0, Math.min(offset, text.length));
  const wordChar = (char: string | undefined) =>
    char !== undefined && !/\s/.test(char);
  if (!wordChar(text[index])) {
    if (!wordChar(text[index - 1])) return null;
    index -= 1;
  }
  let start = index;
  let end = index + 1;
  while (wordChar(text[start - 1])) start -= 1;
  while (wordChar(text[end])) end += 1;
  return { start, end };
}

export function phraseAtOffset(
  phrases: readonly DictationPhrase[],
  offset: number,
): DictationPhrase | null {
  return (
    phrases.find((phrase) => offset >= phrase.start && offset < phrase.end) ??
    null
  );
}

function insertAtSelection(
  state: DictationEdit,
  delta: string,
  live: string,
): DictationEdit {
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  const draft = `${state.draft.slice(0, start)}${delta}${state.draft.slice(end)}`;
  const cursor = start + delta.length;
  return {
    draft,
    appliedLive: live,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}
