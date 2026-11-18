import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { getVoiceDictationSession } from "@/lib/voice-dictation";
import {
  appendDictation,
  joinDictationBatches,
  type DictationText,
} from "@/lib/voice-dictation/dictation-text";
import { useTheme } from "@/theme";
import { Icon } from "@/ui";

export function ComposerDictationSheet({
  initialText,
  onCommit,
  onDiscard,
}: {
  initialText: string;
  onCommit: (text: string) => void;
  onDiscard: () => void;
}) {
  const { mode, tokens } = useTheme();
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(true);
  const editRef = useRef<DictationText>({
    draft: initialText,
    appliedLive: "",
  });

  useEffect(() => {
    return getVoiceDictationSession().subscribe((event) => {
      if (event.type !== "voice-dictation-partial") return;
      const next = appendDictation(
        editRef.current,
        joinDictationBatches(event.batches),
      );
      editRef.current = next;
      setText(next.draft);
    });
  }, []);

  const toggleListening = () => {
    const session = getVoiceDictationSession();
    if (listening) {
      setListening(false);
      void session.pause();
      return;
    }
    setListening(true);
    void session.resume();
  };

  return (
    <View
      className="absolute inset-0 justify-end"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.28)" }}
      testID="composer-dictation-sheet"
    >
      <KeyboardAvoidingView behavior="padding">
        <View
          className="mx-3 mb-2 rounded-2xl border border-border bg-background px-3 pb-3 pt-3"
          style={{ borderCurve: "continuous" }}
        >
          <TextInput
            multiline
            autoFocus
            value={text}
            onChangeText={(next) => {
              editRef.current = { ...editRef.current, draft: next };
              setText(next);
            }}
            placeholder="Start talking"
            placeholderTextColor={tokens.mutedForeground}
            keyboardAppearance={mode}
            selectionColor={tokens.primary}
            cursorColor={tokens.primary}
            testID="composer-dictation-sheet-input"
            style={{
              minHeight: 96,
              maxHeight: 220,
              color: tokens.foreground,
              fontSize: 17,
              lineHeight: 24,
            }}
          />
          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              accessibilityLabel="Discard dictation"
              onPress={onDiscard}
              className="h-11 w-11 items-center justify-center"
              testID="composer-dictation-sheet-discard"
            >
              <Icon name="CircleX" size={22} color={tokens.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityLabel={listening ? "Stop recording" : "Record"}
              onPress={toggleListening}
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: tokens.destructive }}
              testID="composer-dictation-sheet-record"
            >
              <View
                style={{
                  width: listening ? 14 : 16,
                  height: listening ? 14 : 16,
                  borderRadius: listening ? 3 : 8,
                  backgroundColor: tokens.destructiveForeground,
                }}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Use dictation"
              onPress={() => onCommit(editRef.current.draft)}
              className="h-11 w-11 items-center justify-center"
              testID="composer-dictation-sheet-commit"
            >
              <Icon name="Check" size={22} color={tokens.foreground} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
