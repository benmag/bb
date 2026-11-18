import { describe, expect, it, vi } from "vitest";
import {
  resolveVoiceSupport,
  voiceUnsupportedMessage,
} from "./voice-input-support";
import { isShellNativeVoiceDictationAvailable } from "@/lib/native-shell";

vi.mock("@/lib/native-shell", () => ({
  isShellNativeVoiceDictationAvailable: vi.fn(() => false),
}));

describe("resolveVoiceSupport", () => {
  it("is supported when the browser has both APIs", () => {
    expect(
      resolveVoiceSupport({
        hasMediaDevices: true,
        hasMediaRecorder: true,
        isSecureContext: true,
      }),
    ).toEqual({ isSupported: true, reason: null });
  });

  it("blames the origin on a plain-HTTP LAN server", () => {
    expect(
      resolveVoiceSupport({
        hasMediaDevices: false,
        hasMediaRecorder: true,
        isSecureContext: false,
      }),
    ).toEqual({ isSupported: false, reason: "insecure-origin" });
  });

  it("blames the browser on a secure origin", () => {
    expect(
      resolveVoiceSupport({
        hasMediaDevices: true,
        hasMediaRecorder: false,
        isSecureContext: true,
      }),
    ).toEqual({ isSupported: false, reason: "unsupported-browser" });
  });

  it("is supported when the native shell can dictate", () => {
    vi.mocked(isShellNativeVoiceDictationAvailable).mockReturnValueOnce(true);
    expect(
      resolveVoiceSupport({
        hasMediaDevices: false,
        hasMediaRecorder: false,
        isSecureContext: false,
      }),
    ).toEqual({ isSupported: true, reason: null });
  });
});

describe("voiceUnsupportedMessage", () => {
  it("names the fix for each reason", () => {
    expect(voiceUnsupportedMessage("insecure-origin")).toBe(
      "Voice input needs an HTTPS connection to this server",
    );
    expect(voiceUnsupportedMessage("unsupported-browser")).toBe(
      "Voice input is not supported in this browser",
    );
    expect(voiceUnsupportedMessage(null)).toBe(
      "Voice input is not supported in this browser",
    );
  });
});
