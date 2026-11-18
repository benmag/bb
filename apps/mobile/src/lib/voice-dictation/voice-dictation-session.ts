import type { ShellToPageEvent } from "@bb/mobile-bridge";
import * as Crypto from "expo-crypto";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { ensureCallKeepReady, loadCallKeep } from "./callkeep-setup";
import { joinDictationBatches } from "./dictation-text";
import { mergeSealedAndFreshBatches } from "./voice-dictation-batches";

type SpeechRecognizerModule =
  typeof import("react-native-nitro-speech").SpeechRecognizer;

function loadSpeechRecognizer(): SpeechRecognizerModule {
  return require("react-native-nitro-speech")
    .SpeechRecognizer as SpeechRecognizerModule;
}

const DEFAULT_LOCALE = "en-US";
const BRAIN_DUMP_AUTO_FINISH_MS = 3_600_000;
const CALL_END_TIMEOUT_MS = 1_500;
const RECOGNIZER_SETTLE_MS = 150;
const AUDIO_SESSION_WAIT_MS = 2_000;
const RECOGNIZER_START_SETTLE_MS = 800;
const LEVEL_EMIT_INTERVAL_MS = 50;

export interface VoiceDictationStartOptions {
  locale?: string;
  contextualStrings?: readonly string[];
  autoFinishRecognitionMs?: number;
}

export interface VoiceDictationDiagnostics {
  active: boolean;
  callActive: boolean;
  audioSessionActive: boolean;
  recognizerActive: boolean;
}

export interface VoiceDictationDiagnostics {
  active: boolean;
  callActive: boolean;
  audioSessionActive: boolean;
  recognizerActive: boolean;
}

type Emit = (event: ShellToPageEvent) => void;

function listeningConfig(options: VoiceDictationStartOptions = {}) {
  return {
    locale: options.locale ?? DEFAULT_LOCALE,
    autoFinishRecognitionMs:
      options.autoFinishRecognitionMs ?? BRAIN_DUMP_AUTO_FINISH_MS,
    contextualStrings: options.contextualStrings
      ? [...options.contextualStrings]
      : undefined,
    iosPreset: "general" as const,
    iosAddPunctuation: true,
    disableRepeatingFilter: true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

export class VoiceDictationSession {
  private callUuid: string | null = null;
  private active = false;
  private allowRecognizerRestart = false;
  private callConnectedReported = false;
  private tearingDown = false;
  private sessionEpoch = 0;
  private lifecycleLock: Promise<void> = Promise.resolve();
  private batches: string[] = [];
  private sealedBatches: string[] = [];
  private pageEmit: Emit = () => {};
  private listeners = new Set<Emit>();
  private paused = false;
  private startOptions: VoiceDictationStartOptions = {};
  private appStateSubscription: { remove(): void } | null = null;
  private callKitListenersRegistered = false;
  private lastAppState: AppStateStatus = "active";
  private backgroundEnteredAt: number | null = null;
  private pendingCallEnd: {
    uuid: string;
    resolve: () => void;
  } | null = null;
  private audioSessionActive = false;
  private audioSessionWaiters: Array<() => void> = [];
  private restartInFlight = false;
  private lastLevelEmitAt = 0;
  private startupError = false;

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.lifecycleLock;
    let release = () => {};
    this.lifecycleLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  attachEmitter(emit: Emit): void {
    this.pageEmit = emit;
  }

  subscribe(listener: Emit): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(event: ShellToPageEvent): void {
    this.pageEmit(event);
    for (const listener of this.listeners) listener(event);
  }

  private emitPartial(): void {
    this.publish({
      type: "voice-dictation-partial",
      batches: [...this.batches],
    });
  }

  private emitEnded(
    reason: "stopped" | "cancelled" | "error" | "system",
  ): void {
    this.publish({
      type: "voice-dictation-ended",
      reason,
      batches: [...this.batches],
    });
  }

  private wireRecognizerCallbacks(): void {
    const SpeechRecognizer = loadSpeechRecognizer();
    SpeechRecognizer.onResult = (resultBatches) => {
      this.batches = mergeSealedAndFreshBatches(
        this.sealedBatches,
        resultBatches,
      );
      this.emitPartial();
    };
    SpeechRecognizer.onError = () => {
      this.startupError = true;
      if (!this.active || this.tearingDown) return;
      if (this.callUuid !== null) return;
      void this.runExclusive(() => this.teardown("error"));
    };
    SpeechRecognizer.onRecordingStopped = () => {
      if (this.active && this.allowRecognizerRestart && Platform.OS === "ios") {
        void this.restartIfCallActive();
      }
    };
    SpeechRecognizer.onVolumeChange = (event) => {
      if (!this.active) return;
      const now = Date.now();
      if (now - this.lastLevelEmitAt < LEVEL_EMIT_INTERVAL_MS) return;
      this.lastLevelEmitAt = now;
      const amplitude = Math.min(1, Math.max(0, event.smoothedVolume));
      this.publish({ type: "voice-dictation-level", amplitude });
    };
  }

  private sealBatchesBeforeRecognizerHandoff(): void {
    this.sealedBatches = [...this.batches];
  }

  private async restartIfCallActive(): Promise<void> {
    if (this.restartInFlight || !this.active) return;
    this.restartInFlight = true;
    try {
      await sleep(RECOGNIZER_SETTLE_MS);
      if (!this.active || !this.allowRecognizerRestart) return;
      if (this.callUuid !== null) {
        await this.waitForAudioSession();
        if (!this.active || !this.allowRecognizerRestart) return;
        if (this.callUuid !== null) {
          this.reportCallConnectedIfNeeded(this.callUuid);
        }
      }
      this.sealBatchesBeforeRecognizerHandoff();
      await loadSpeechRecognizer().startListening(listeningConfig(this.startOptions));
    } catch {
      if (__DEV__) console.warn("voice-dictation: restart after stop failed");
    } finally {
      this.restartInFlight = false;
    }
  }

  private observeAppState(): void {
    if (this.appStateSubscription !== null) return;
    this.appStateSubscription = AppState.addEventListener("change", (next) => {
      const previous = this.lastAppState;
      this.lastAppState = next as AppStateStatus;
      if (
        next === "background" &&
        previous === "active" &&
        this.active
      ) {
        this.backgroundEnteredAt = Date.now();
        if (__DEV__) {
          console.log("voice-dictation: entered background while listening");
        }
      }
      if (next === "active" && this.active) {
        this.emitPartial();
        if (this.backgroundEnteredAt !== null && __DEV__) {
          console.log(
            "voice-dictation: foregrounded after",
            Date.now() - this.backgroundEnteredAt,
            "ms background",
          );
        }
        this.backgroundEnteredAt = null;
      }
    });
  }

  private readonly onCallKitEnd = ({ callUUID }: { callUUID: string }) => {
    const uuid = normalizeUuid(callUUID);
    if (this.pendingCallEnd?.uuid === uuid) {
      const { resolve } = this.pendingCallEnd;
      this.pendingCallEnd = null;
      resolve();
    }
    if (this.callUuid === uuid && this.active && !this.tearingDown) {
      void this.teardown("system");
    }
  };

  private readonly onAudioSessionActivated = () => {
    this.audioSessionActive = true;
    const waiters = this.audioSessionWaiters;
    this.audioSessionWaiters = [];
    for (const waiter of waiters) waiter();
    if (!this.active || this.callUuid === null) return;
    this.reportCallConnectedIfNeeded(this.callUuid);
    if (
      !this.paused &&
      this.allowRecognizerRestart &&
      !this.recognizerIsActive()
    ) {
      void this.restartIfCallActive();
    }
  };

  private readonly onAudioSessionDeactivated = () => {
    this.audioSessionActive = false;
  };

  private waitForAudioSession(): Promise<void> {
    if (this.audioSessionActive) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.audioSessionWaiters = this.audioSessionWaiters.filter(
          (waiter) => waiter !== finish,
        );
        resolve();
      };
      const timer = setTimeout(finish, AUDIO_SESSION_WAIT_MS);
      this.audioSessionWaiters.push(finish);
    });
  }

  private registerCallKitListeners(): void {
    if (this.callKitListenersRegistered) return;
    const CallKeep = loadCallKeep();
    CallKeep.addEventListener("endCall", this.onCallKitEnd);
    CallKeep.addEventListener(
      "didActivateAudioSession",
      this.onAudioSessionActivated,
    );
    CallKeep.addEventListener(
      "didDeactivateAudioSession",
      this.onAudioSessionDeactivated,
    );
    this.callKitListenersRegistered = true;
  }

  private async beginOutgoingCall(): Promise<void> {
    if (this.callUuid !== null || this.tearingDown) return;
    await ensureCallKeepReady();
    if (this.callUuid !== null || this.tearingDown) return;
    this.registerCallKitListeners();
    const callUuid = normalizeUuid(Crypto.randomUUID());
    this.callUuid = callUuid;
    this.callConnectedReported = false;
    this.audioSessionActive = false;
    const audioReady = this.waitForAudioSession();
    loadCallKeep().startCall(
      callUuid,
      "Listening",
      "Dictation",
      "generic",
      false,
    );
    await audioReady;
    if (this.callUuid !== callUuid || this.tearingDown) return;
    this.reportCallConnectedIfNeeded(callUuid);
  }

  private reportCallConnectedIfNeeded(callUuid: string): void {
    if (this.callConnectedReported) return;
    this.callConnectedReported = true;
    const CallKeep = loadCallKeep();
    CallKeep.reportConnectingOutgoingCallWithUUID(callUuid);
    CallKeep.reportConnectedOutgoingCallWithUUID(callUuid);
  }

  private async endCurrentCall(): Promise<void> {
    const uuid = this.callUuid;
    this.callUuid = null;
    this.callConnectedReported = false;
    if (uuid === null) return;
    const CallKeep = loadCallKeep();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingCallEnd?.uuid === uuid) {
          this.pendingCallEnd = null;
        }
        resolve();
      }, CALL_END_TIMEOUT_MS);
      this.pendingCallEnd = {
        uuid,
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
      };
      try {
        CallKeep.endCall(uuid);
      } catch {
        clearTimeout(timeout);
        this.pendingCallEnd = null;
        resolve();
      }
    });
  }

  async start(options: VoiceDictationStartOptions = {}): Promise<void> {
    return this.runExclusive(async () => {
      if (this.active) {
        return;
      }
      if (Platform.OS !== "ios") {
        throw new Error("CallKit voice dictation is only enabled on iOS");
      }

      this.observeAppState();
      this.wireRecognizerCallbacks();
      this.batches = [];
      this.sealedBatches = [];
      this.paused = false;
      this.startOptions = options;
      this.callUuid = null;
      this.callConnectedReported = false;
      this.allowRecognizerRestart = false;
      this.tearingDown = false;
      const epoch = ++this.sessionEpoch;

      try {
        await this.beginOutgoingCall();
      } catch {
        if (__DEV__) {
          console.warn("voice-dictation: CallKit unavailable, mic may stop in background");
        }
      }
      if (epoch !== this.sessionEpoch) return;

      const config = listeningConfig(options);
      const SpeechRecognizer = loadSpeechRecognizer();

      await SpeechRecognizer.prewarm(config, {
        requestPermission: true,
        loadOnDeviceModel: true,
      });

      this.startupError = false;
      await SpeechRecognizer.startListening(config);

      if (epoch !== this.sessionEpoch) {
        return;
      }
      await sleep(RECOGNIZER_START_SETTLE_MS);
      if (epoch !== this.sessionEpoch) return;
      if (!this.recognizerIsActive() && this.startupError) {
        this.startupError = false;
        await sleep(RECOGNIZER_SETTLE_MS);
        await SpeechRecognizer.startListening(config);
        await sleep(RECOGNIZER_START_SETTLE_MS);
      }
      if (epoch !== this.sessionEpoch) return;
      if (!this.recognizerIsActive()) {
        await this.teardown("error");
        throw new Error("Dictation did not start");
      }

      this.active = true;
      this.allowRecognizerRestart = true;
      this.emitPartial();
    });
  }

  private recognizerIsActive(): boolean {
    try {
      return loadSpeechRecognizer().getIsActive();
    } catch {
      return false;
    }
  }

  async pause(): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.active || this.paused) return;
      this.allowRecognizerRestart = false;
      this.paused = true;
      try {
        await loadSpeechRecognizer().stopListening();
      } catch {
        // The recognizer may already be idle.
      }
      await this.endCurrentCall();
      this.audioSessionActive = false;
    });
  }

  async resume(): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.active || !this.paused) return;
      this.paused = false;
      try {
        await this.beginOutgoingCall();
      } catch {
        if (__DEV__) {
          console.warn("voice-dictation: CallKit unavailable, mic may stop while locked");
        }
      }
      this.allowRecognizerRestart = true;
      this.sealBatchesBeforeRecognizerHandoff();
      await loadSpeechRecognizer().startListening(
        listeningConfig(this.startOptions),
      );
    });
  }

  isPaused(): boolean {
    return this.paused;
  }

  async stop(): Promise<string> {
    return this.runExclusive(async () => {
      if (!this.active) {
        return joinDictationBatches(this.batches);
      }
      this.allowRecognizerRestart = false;
      try {
        await loadSpeechRecognizer().stopListening();
      } catch {
        // stop is idempotent for session teardown.
      }
      await sleep(RECOGNIZER_SETTLE_MS);
      const text = joinDictationBatches(this.batches);
      await this.teardown("stopped");
      return text;
    });
  }

  async cancel(): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.active) return;
      this.allowRecognizerRestart = false;
      try {
        await loadSpeechRecognizer().stopListening();
      } catch {
        // ignore
      }
      await sleep(RECOGNIZER_SETTLE_MS);
      this.batches = [];
      await this.teardown("cancelled");
    });
  }

  getBatches(): readonly string[] {
    return this.batches;
  }

  isActive(): boolean {
    return this.active;
  }

  getDiagnostics(): VoiceDictationDiagnostics {
    return {
      active: this.active,
      callActive: this.callUuid !== null,
      audioSessionActive: this.audioSessionActive,
      recognizerActive: this.recognizerIsActive(),
    };
  }

  getDiagnostics(): VoiceDictationDiagnostics {
    return {
      active: this.active,
      callActive: this.callUuid !== null,
      audioSessionActive: this.audioSessionActive,
      recognizerActive: this.recognizerIsActive(),
    };
  }

  private async teardown(
    reason: "stopped" | "cancelled" | "error" | "system",
  ): Promise<void> {
    if (this.tearingDown) {
      return;
    }
    this.tearingDown = true;
    this.sessionEpoch += 1;
    const batches = [...this.batches];
    this.active = false;
    this.paused = false;
    this.allowRecognizerRestart = false;

    try {
      const SpeechRecognizer = loadSpeechRecognizer();
      SpeechRecognizer.onResult = undefined;
      SpeechRecognizer.onError = undefined;
      SpeechRecognizer.onRecordingStopped = undefined;
      SpeechRecognizer.onVolumeChange = undefined;
    } catch {
      // ignore
    }

    if (reason === "system") {
      this.callUuid = null;
      this.callConnectedReported = false;
    } else {
      await this.endCurrentCall();
    }

    this.emitEnded(reason);
    if (batches.length > 0 && reason !== "cancelled") {
      this.batches = batches;
    } else {
      this.batches = [];
    }
    this.sealedBatches = [];
    this.tearingDown = false;
  }
}

let sharedSession: VoiceDictationSession | null = null;

export function getVoiceDictationSession(): VoiceDictationSession {
  if (sharedSession === null) {
    sharedSession = new VoiceDictationSession();
  }
  return sharedSession;
}
