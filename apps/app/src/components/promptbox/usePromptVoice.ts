import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useShellComposerDictationKeyboard } from "@/hooks/useShellComposerDictationKeyboard";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { transcribeVoiceInput } from "@/lib/api";
import type { VoiceDelivery } from "@/lib/voice-recording-store";
import type { PromptBoxHandle, PromptVoiceConfig } from "./ComposerBox";
import {
  deliverPromptVoiceTranscript,
  type PromptVoiceDraftTarget,
} from "./prompt-voice-intent";

async function requestVoiceTranscription({
  file,
  promptContext,
  signal,
}: {
  file: File;
  promptContext?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const transcription = await transcribeVoiceInput(file, promptContext, signal);
  return transcription.text;
}

export function usePromptVoice(
  promptBoxRef: RefObject<PromptBoxHandle | null>,
  draft: PromptVoiceDraftTarget | undefined,
  recordingKey: string | null,
): PromptVoiceConfig {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commitRef = useRef<string | null>(null);
  const onTranscript = useCallback(
    (text: string, delivery: VoiceDelivery) => {
      const committed = commitRef.current;
      commitRef.current = null;
      return deliverPromptVoiceTranscript(committed ?? text, delivery, {
        mounted: mountedRef.current,
        promptBox: promptBoxRef.current,
        draft,
      });
    },
    [draft, promptBoxRef],
  );

  const getPromptContext = useCallback(
    () => promptBoxRef.current?.voice?.textBeforeCursor() ?? undefined,
    [promptBoxRef],
  );

  const stopRef = useRef<(delivery: VoiceDelivery) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});

  const commitDictation = useCallback(
    (text: string, action: "insert" | "discard") => {
      if (action === "discard") {
        cancelRef.current();
        return;
      }
      commitRef.current = text;
      if (draft) {
        const current = draft.getCurrent();
        draft.setDraft({ ...current, text });
      }
      stopRef.current("insert");
    },
    [draft],
  );

  const shellKeyboard = useShellComposerDictationKeyboard(
    () => {},
    commitDictation,
  );

  const onLiveTranscript = useCallback(() => {}, []);

  const playCompletionTransition = useCallback(
    () => promptBoxRef.current?.voice?.playCompletionTransition(),
    [promptBoxRef],
  );

  const voiceInput = useVoiceInput({
    recordingKey,
    onTranscript,
    onLiveTranscript,
    onTranscribe: requestVoiceTranscription,
    getPromptContext,
    playCompletionTransition,
  });

  const startWithAnchor = useCallback(async () => {
    const anchor = draft?.getCurrent().text ?? "";
    if (shellKeyboard.available) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      shellKeyboard.open(anchor);
    }
    await voiceInput.start();
  }, [draft, shellKeyboard, voiceInput]);

  useEffect(() => {
    if (voiceInput.state === "recording") return;
    if (!shellKeyboard.isOpen) return;
    shellKeyboard.close();
  }, [shellKeyboard.close, shellKeyboard.isOpen, voiceInput.state]);

  const { stop: stopVoiceInput, cancel: cancelVoiceInput } = voiceInput;
  stopRef.current = stopVoiceInput;
  cancelRef.current = cancelVoiceInput;
  const stop = useCallback(() => stopVoiceInput("insert"), [stopVoiceInput]);
  const send = useCallback(() => stopVoiceInput("send"), [stopVoiceInput]);

  return useMemo<PromptVoiceConfig>(
    () => ({
      state: voiceInput.state,
      delivery: voiceInput.delivery,
      microphoneWarning: voiceInput.microphoneWarning,
      isSupported: voiceInput.isSupported,
      stream: voiceInput.stream,
      failedRecordings: voiceInput.failedRecordings,
      start: startWithAnchor,
      stop,
      send,
      retry: voiceInput.retry,
      discard: voiceInput.discard,
      download: voiceInput.download,
      cancel: voiceInput.cancel,
    }),
    [
      voiceInput.state,
      voiceInput.delivery,
      voiceInput.microphoneWarning,
      voiceInput.isSupported,
      voiceInput.stream,
      voiceInput.failedRecordings,
      startWithAnchor,
      stop,
      send,
      voiceInput.retry,
      voiceInput.discard,
      voiceInput.download,
      voiceInput.cancel,
    ],
  );
}
