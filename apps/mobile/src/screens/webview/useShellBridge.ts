import { openApplicationUrl } from "@/lib/shell/application-url";
import {
  buildBridgeEventScript,
  parsePageToShellMessage,
  type BridgeResponse,
  type NativeScreen,
  type PageToShellMessage,
  type ShellToPageEvent,
} from "@bb/mobile-bridge";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Linking, Platform, Share } from "react-native";
import type { WebView, WebViewMessageEvent } from "react-native-webview";
import { describeError } from "@/lib/describe-error";
import { haptic } from "@/lib/haptics";
import { buildBridgeSharePayload, isExternallyOpenable } from "@/lib/shell";
import { updateAppBadgeCount } from "@/notifications/AppBadgeSync";
import { getVoiceDictationSession } from "@/lib/voice-dictation";

export interface ShellBridgeCallbacks {
  onReady(path: string): void;
  onPath(path: string): void;
  onOpenNative(screen: NativeScreen): void;
  onSwitchServer(id: string): void;
  onComposerDictationKeyboard?(input: {
    open: boolean;
    text: string;
    selectionStart?: number;
    selectionEnd?: number;
  }): void;
}

export interface ShellBridge {
  onMessage(event: WebViewMessageEvent): void;
  send(event: ShellToPageEvent): void;
}

export function useShellBridge(
  webViewRef: React.RefObject<WebView | null>,
  callbacks: ShellBridgeCallbacks,
): ShellBridge {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const send = useCallback(
    (event: ShellToPageEvent) => {
      webViewRef.current?.injectJavaScript(buildBridgeEventScript(event));
    },
    [webViewRef],
  );

  useEffect(() => {
    getVoiceDictationSession().attachEmitter(send);
  }, [send]);

  const respond = useCallback(
    (id: string, response: BridgeResponse) => {
      send({ type: "response", id, response });
    },
    [send],
  );

  const handle = useCallback(
    async (message: PageToShellMessage): Promise<void> => {
      switch (message.type) {
        case "ready":
          callbacksRef.current.onReady(message.path);
          return;
        case "title":
          callbacksRef.current.onPath(message.path);
          return;
        case "haptic":
          haptic(message.kind);
          return;
        case "badge":
          updateAppBadgeCount(message.count);
          return;
        case "open-native":
          callbacksRef.current.onOpenNative(message.screen);
          return;
        case "switch-server":
          callbacksRef.current.onSwitchServer(message.id);
          return;
        case "composer-dictation-keyboard":
          callbacksRef.current.onComposerDictationKeyboard?.({
            open: message.open,
            text: message.text,
            selectionStart: message.selectionStart,
            selectionEnd: message.selectionEnd,
          });
          return;
        case "open-external": {
          if (!isExternallyOpenable(message.url)) return;
          await Linking.openURL(message.url).catch(() => undefined);
          return;
        }
        case "request": {
          if (message.request.kind === "open-application") {
            try {
              await openApplicationUrl(message.request.payload.url);
              respond(message.id, { ok: true, result: null });
            } catch (error) {
              respond(message.id, { ok: false, error: describeError(error) });
            }
            return;
          }
          if (message.request.kind === "share") {
            const payload = buildBridgeSharePayload(
              Platform.OS,
              message.request.payload,
            );
            try {
              const result = await Share.share(
                payload.content,
                payload.options,
              );
              respond(message.id, {
                ok: true,
                result: { shared: result.action !== Share.dismissedAction },
              });
            } catch (error) {
              respond(message.id, {
                ok: false,
                error: describeError(error),
              });
            }
            return;
          }
          const voiceSession = getVoiceDictationSession();
          if (message.request.kind === "voice-dictation-start") {
            try {
              await voiceSession.start(message.request.payload);
              respond(message.id, { ok: true, result: null });
            } catch (error) {
              respond(message.id, {
                ok: false,
                error: describeError(error),
              });
            }
            return;
          }
          if (message.request.kind === "voice-dictation-stop") {
            try {
              const text = await voiceSession.stop();
              respond(message.id, { ok: true, result: { text } });
            } catch (error) {
              respond(message.id, {
                ok: false,
                error: describeError(error),
              });
            }
            return;
          }
          if (message.request.kind === "voice-dictation-cancel") {
            try {
              await voiceSession.cancel();
              respond(message.id, { ok: true, result: null });
            } catch (error) {
              respond(message.id, {
                ok: false,
                error: describeError(error),
              });
            }
            return;
          }
          if (message.request.kind === "voice-dictation-sync") {
            respond(message.id, {
              ok: true,
              result: { batches: [...voiceSession.getBatches()] },
            });
            return;
          }
          respond(message.id, {
            ok: false,
            error: `Unsupported native request: ${message.request.kind}`,
          });
          return;
        }
      }
    },
    [respond],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parsePageToShellMessage(event.nativeEvent.data);
      if (!parsed.ok) {
        if (__DEV__)
          console.warn("shell bridge dropped a message", parsed.reason);
        return;
      }
      if (__DEV__) console.log("shell bridge", JSON.stringify(parsed.message));
      void handle(parsed.message);
    },
    [handle],
  );

  return useMemo(() => ({ onMessage, send }), [onMessage, send]);
}
