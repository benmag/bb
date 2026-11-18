import { useCallback, useEffect, useState } from "react";
import { AppState, Keyboard, View } from "react-native";
import {
  getVoiceDictationSession,
  type VoiceDictationDiagnostics,
} from "@/lib/voice-dictation";
import { GroupedRow, Input, Text } from "@/ui";
import { GroupedScreen } from "@/screens/settings/GroupedScreen";
import { SettingsSection } from "@/screens/settings/SettingsRows";
import { useBadgeColors } from "@/screens/settings/settings-badges";

export function VoiceDictationSpikeScreen() {
  const colors = useBadgeColors();
  const [batches, setBatches] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VoiceDictationDiagnostics>(
    () => getVoiceDictationSession().getDiagnostics(),
  );

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setDiagnostics(getVoiceDictationSession().getDiagnostics());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const session = getVoiceDictationSession();
    session.attachEmitter((event) => {
      if (event.type === "voice-dictation-partial") {
        setBatches([...event.batches]);
      }
      if (event.type === "voice-dictation-ended") {
        setListening(false);
        setBatches([...event.batches]);
      }
    });
  }, []);

  useEffect(() => {
    return AppState.addEventListener("change", setAppState).remove;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      setListening(true);
      setBatches([]);
      await getVoiceDictationSession().start({ locale: "en-US" });
    } catch (caught) {
      setListening(false);
      setError(caught instanceof Error ? caught.message : "Start failed");
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      await getVoiceDictationSession().stop();
      setListening(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stop failed");
    }
  }, []);

  const transcript = batches.join(" ").replace(/\s+/g, " ").trim();
  const status =
    appState !== "active"
      ? "In background — keep talking"
      : listening
        ? "Listening"
        : "Idle";

  return (
    <GroupedScreen testID="voice-dictation-spike-screen">
      <SettingsSection
        title="Session"
        footnote="iOS shows a call-style banner while this runs. That is how the mic stays alive in the background."
      >
        <GroupedRow
          title={listening ? "Stop dictation" : "Start dictation"}
          subtitle={status}
          badge={{
            icon: "Smartphone",
            symbol: listening ? "stop.fill" : "mic.fill",
            color: listening ? colors.red : colors.blue,
          }}
          onPress={listening ? stop : start}
          testID="voice-dictation-spike-toggle"
        />
      </SettingsSection>
      {error ? (
        <SettingsSection title="Error">
          <View className="rounded-xl bg-surface-grouped-cell p-4">
            <Text className="text-sm text-destructive" selectable>
              {error}
            </Text>
          </View>
        </SettingsSection>
      ) : null}
      <SettingsSection
        title="Native keyboard test"
        footnote="No WebView here. Start dictation, then tap this field. If the keyboard opens, the audio session is not what blocks it in the composer."
      >
        <Input
          grouped
          value={typed}
          onChangeText={setTyped}
          placeholder="Tap here while dictation runs"
          testID="voice-dictation-spike-keyboard-probe"
        />
        <View className="rounded-xl bg-surface-grouped-cell p-4">
          <Text className="text-sm" selectable>
            {[
              `keyboard: ${keyboardVisible ? "open" : "closed"}`,
              `dictation: ${diagnostics.active ? "on" : "off"}`,
              `recognizer: ${diagnostics.recognizerActive ? "on" : "off"}`,
              `callkit: ${diagnostics.callActive ? "on" : "off"}`,
              `audio session: ${diagnostics.audioSessionActive ? "on" : "off"}`,
            ].join("\n")}
          </Text>
        </View>
      </SettingsSection>
      <SettingsSection
        title="Transcript"
        footnote="Background the app, keep talking, then return. New words should appear here."
      >
        <View className="rounded-xl bg-surface-grouped-cell p-4">
          <Text className="text-base" selectable>
            {transcript.length > 0
              ? transcript
              : "Transcript shows up here after you start."}
          </Text>
        </View>
      </SettingsSection>
    </GroupedScreen>
  );
}
