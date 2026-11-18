function loosen(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(value: string): string[] {
  const loose = loosen(value);
  return loose.length === 0 ? [] : loose.split(" ");
}

function startsWithLoose(value: string, prefix: string): boolean {
  const normalizedValue = loosen(value);
  const normalizedPrefix = loosen(prefix);
  if (normalizedPrefix.length === 0) return false;
  return (
    normalizedValue === normalizedPrefix ||
    normalizedValue.startsWith(`${normalizedPrefix} `)
  );
}

function isRevision(previous: string, next: string): boolean {
  const previousWords = words(previous);
  const nextWords = words(next);
  if (previousWords.length === 0 || nextWords.length === 0) return false;
  const shorter =
    previousWords.length <= nextWords.length ? previousWords : nextWords;
  const longer =
    previousWords.length <= nextWords.length ? nextWords : previousWords;
  if (longer.length > shorter.length + 4) return false;
  let index = 0;
  for (const word of shorter) {
    const found = longer.indexOf(word, index);
    if (found < 0) return false;
    index = found + 1;
  }
  return true;
}

function absorbDictationPiece(pieces: string[], piece: string): void {
  if (pieces.length === 0) {
    pieces.push(piece);
    return;
  }
  for (let index = 0; index < pieces.length; index += 1) {
    const head = pieces.slice(0, index + 1).join(" ");
    if (startsWithLoose(piece, head)) {
      pieces.splice(index, pieces.length - index, piece);
      return;
    }
  }
  const last = pieces[pieces.length - 1] ?? "";
  if (isRevision(last, piece)) {
    pieces[pieces.length - 1] = piece;
    return;
  }
  pieces.push(piece);
}

export function joinDictationBatches(batches: readonly string[]): string {
  const pieces: string[] = [];
  for (const batch of batches) {
    const piece = batch.replace(/\s+/g, " ").trim();
    if (piece.length === 0) continue;
    const last = pieces[pieces.length - 1];
    if (last !== undefined && /^[^\p{L}\p{N}]+$/u.test(piece)) {
      pieces[pieces.length - 1] = `${last}${piece}`;
      continue;
    }
    absorbDictationPiece(pieces, piece);
  }
  return pieces.join(" ").replace(/[ \t]+/g, " ").trim();
}

export interface DictationText {
  draft: string;
  appliedLive: string;
}

export function appendDictation(
  state: DictationText,
  live: string,
): DictationText {
  if (live.startsWith(state.appliedLive)) {
    let delta = live.slice(state.appliedLive.length);
    if (delta.length === 0) return { ...state, appliedLive: live };
    if (
      state.appliedLive.length === 0 &&
      state.draft.length > 0 &&
      !/\s$/.test(state.draft) &&
      !/^\s/.test(delta)
    ) {
      delta = ` ${delta}`;
    }
    return { draft: `${state.draft}${delta}`, appliedLive: live };
  }
  if (state.appliedLive.length > 0 && state.draft.endsWith(state.appliedLive)) {
    const base = state.draft.slice(0, state.draft.length - state.appliedLive.length);
    return { draft: `${base}${live}`, appliedLive: live };
  }
  return { ...state, appliedLive: live };
}
