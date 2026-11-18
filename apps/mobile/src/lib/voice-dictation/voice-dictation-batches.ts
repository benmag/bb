export function mergeSealedAndFreshBatches(
  sealed: readonly string[],
  fresh: readonly string[],
): string[] {
  if (sealed.length === 0) {
    return [...fresh];
  }
  if (fresh.length === 0) {
    return [...sealed];
  }
  return [...sealed, ...fresh];
}