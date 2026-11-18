import { Platform } from "react-native";

type CallKeepModule = typeof import("react-native-callkeep").default;

let setupPromise: Promise<void> | null = null;

export function loadCallKeep(): CallKeepModule {
  return require("react-native-callkeep").default as CallKeepModule;
}

export function ensureCallKeepReady(): Promise<void> {
  if (Platform.OS !== "ios") {
    return Promise.resolve();
  }
  if (setupPromise !== null) return setupPromise;
  const RNCallKeep = loadCallKeep();
  setupPromise = RNCallKeep.setup({
    ios: {
      appName: "Dictation",
      supportsVideo: false,
      includesCallsInRecents: false,
    },
    android: {
      alertTitle: "Permissions required",
      alertDescription: "bb needs phone account access for dictation",
      cancelButton: "Cancel",
      okButton: "OK",
      additionalPermissions: [],
    },
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      setupPromise = null;
      throw error;
    });
  return setupPromise;
}
