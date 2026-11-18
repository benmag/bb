import { getNativeShell } from "./native-shell";
import { isShellNativeVoiceDictationAvailable } from "./shell-native-voice-dictation";

export function isShellComposerDictationKeyboardAvailable(): boolean {
  return isShellNativeVoiceDictationAvailable();
}

export function postShellComposerDictationKeyboard(
  open: boolean,
  text: string,
  selection?: { start: number; end: number },
): void {
  const shell = getNativeShell();
  if (shell === null || !isShellNativeVoiceDictationAvailable()) return;
  const selectionForShell =
    selection !== undefined && shell.handshake.bridgeVersion >= 8
      ? selection
      : undefined;
  shell.post({
    type: "composer-dictation-keyboard",
    open,
    text,
    ...(selectionForShell
      ? {
          selectionStart: selectionForShell.start,
          selectionEnd: selectionForShell.end,
        }
      : {}),
  });
}