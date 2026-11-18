import Constants from "expo-constants";

export function isDictationSpikeBuild(): boolean {
  return Constants.expoConfig?.extra?.bbMobileVariant === "dictation-spike";
}
