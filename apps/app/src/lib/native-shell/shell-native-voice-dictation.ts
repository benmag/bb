import type { ShellToPageEvent } from "@bb/mobile-bridge";
import { getNativeShell } from "./native-shell";

export interface ShellVoiceDictationStartOptions {
  locale?: string;
  contextualStrings?: string[];
  autoFinishRecognitionMs?: number;
}

export function isShellNativeVoiceDictationAvailable(): boolean {
  const shell = getNativeShell();
  return shell !== null && shell.has("voice-dictation");
}

export async function startShellNativeVoiceDictation(
  options: ShellVoiceDictationStartOptions = {},
): Promise<void> {
  const shell = getNativeShell();
  if (shell === null || !shell.has("voice-dictation")) {
    throw new Error("Native voice dictation is not available");
  }
  await shell.request("voice-dictation-start", options);
}

export async function stopShellNativeVoiceDictation(): Promise<string> {
  const shell = getNativeShell();
  if (shell === null || !shell.has("voice-dictation")) {
    throw new Error("Native voice dictation is not available");
  }
  const result = await shell.request("voice-dictation-stop", null);
  if (
    typeof result !== "object" ||
    result === null ||
    !("text" in result) ||
    typeof (result as { text: unknown }).text !== "string"
  ) {
    return "";
  }
  return (result as { text: string }).text;
}

export async function cancelShellNativeVoiceDictation(): Promise<void> {
  const shell = getNativeShell();
  if (shell === null || !shell.has("voice-dictation")) {
    throw new Error("Native voice dictation is not available");
  }
  await shell.request("voice-dictation-cancel", null);
}

export async function syncShellNativeVoiceDictation(): Promise<string[]> {
  const shell = getNativeShell();
  if (shell === null || !shell.has("voice-dictation")) {
    return [];
  }
  const result = await shell.request("voice-dictation-sync", null);
  if (
    typeof result !== "object" ||
    result === null ||
    !("batches" in result) ||
    !Array.isArray((result as { batches: unknown }).batches)
  ) {
    return [];
  }
  return (result as { batches: string[] }).batches;
}

export function subscribeShellNativeVoiceDictation(
  listener: (event: ShellToPageEvent) => void,
): () => void {
  const shell = getNativeShell();
  if (shell === null) return () => {};
  return shell.subscribe(listener);
}

export function batchesToTranscript(batches: readonly string[]): string {
  return batches.join(" ").replace(/\s+/g, " ").trim();
}