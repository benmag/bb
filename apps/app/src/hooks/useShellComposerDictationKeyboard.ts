import { subscribeShellNativeVoiceDictation } from "@/lib/native-shell";
import {
  isShellComposerDictationKeyboardAvailable,
  postShellComposerDictationKeyboard,
} from "@/lib/native-shell/shell-composer-dictation-keyboard";
import { useCallback, useEffect, useRef, useState } from "react";

const DOCK_BOTTOM_INSET_PROPERTY = "--bb-dictation-dock-inset";
const DOCK_OPEN_ATTRIBUTE = "shellDictationKeyboard";

function dockInsetInVisualViewport(fromFrameBottom: number): number {
  const viewport = window.visualViewport;
  if (viewport === null) return fromFrameBottom;
  const hiddenBelowViewport = Math.max(
    0,
    window.innerHeight - viewport.offsetTop - viewport.height,
  );
  return Math.max(0, Math.round(fromFrameBottom - hiddenBelowViewport));
}

export function useShellComposerDictationKeyboard(
  onTextFromShell: (
    text: string,
    selection?: { start: number; end: number },
  ) => void,
  onCommit?: (text: string, action: "insert" | "discard") => void,
) {
  const available = isShellComposerDictationKeyboardAvailable();
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const onTextRef = useRef(onTextFromShell);
  const onCommitRef = useRef(onCommit);
  const frameInsetRef = useRef(0);
  onTextRef.current = onTextFromShell;
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!available) return;
    const applyFrameInset = () => {
      document.documentElement.style.setProperty(
        DOCK_BOTTOM_INSET_PROPERTY,
        `${dockInsetInVisualViewport(frameInsetRef.current)}px`,
      );
    };
    const unsubscribe = subscribeShellNativeVoiceDictation((event) => {
      if (event.type === "composer-dictation-commit") {
        onCommitRef.current?.(event.text, event.action);
        return;
      }
      if (event.type === "composer-dictation-keyboard-text") {
        const selection =
          event.selectionStart !== undefined &&
          event.selectionEnd !== undefined
            ? { start: event.selectionStart, end: event.selectionEnd }
            : undefined;
        onTextRef.current(event.text, selection);
        return;
      }
      if (event.type !== "composer-dictation-keyboard-layout") return;
      frameInsetRef.current = event.bottomInset;
      if (!isOpenRef.current) return;
      applyFrameInset();
    });
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", applyFrameInset);
    viewport?.addEventListener("scroll", applyFrameInset);
    return () => {
      unsubscribe();
      viewport?.removeEventListener("resize", applyFrameInset);
      viewport?.removeEventListener("scroll", applyFrameInset);
    };
  }, [available]);

  const open = useCallback(
    (text: string, selection?: { start: number; end: number }) => {
      if (!available) return;
      isOpenRef.current = true;
      setIsOpen(true);
      document.documentElement.dataset[DOCK_OPEN_ATTRIBUTE] = "";
      window.dispatchEvent(new Event("resize"));
      postShellComposerDictationKeyboard(true, text, selection);
    },
    [available],
  );

  const close = useCallback(() => {
    if (!available) return;
    isOpenRef.current = false;
    setIsOpen(false);
    const root = document.documentElement;
    delete root.dataset[DOCK_OPEN_ATTRIBUTE];
    root.style.removeProperty(DOCK_BOTTOM_INSET_PROPERTY);
    window.dispatchEvent(new Event("resize"));
    postShellComposerDictationKeyboard(false, "");
  }, [available]);

  const syncText = useCallback(
    (
      text: string,
      selection?: { start: number; end: number },
    ) => {
      if (!available || !isOpenRef.current) return;
      postShellComposerDictationKeyboard(true, text, selection);
    },
    [available],
  );

  return { available, isOpen, open, close, syncText };
}
