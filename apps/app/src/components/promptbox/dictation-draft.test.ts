import { describe, expect, it } from "vitest";
import {
  adoptUserText,
  applyLiveTranscript,
  deleteRange,
  locatePhrases,
  phraseAtOffset,
  wordAtOffset,
} from "./dictation-draft";

describe("applyLiveTranscript", () => {
  it("appends speech after the text that was already in the composer", () => {
    expect(
      applyLiveTranscript(
        {
          draft: "Hello",
          appliedLive: "",
          selectionStart: 5,
          selectionEnd: 5,
        },
        "there",
      ),
    ).toEqual({
      draft: "Hello there",
      appliedLive: "there",
      selectionStart: 11,
      selectionEnd: 11,
    });
  });

  it("keeps a manual edit and only adds speech that is new", () => {
    const edited = adoptUserText(
      {
        draft: "Hello there",
        appliedLive: "there",
        selectionStart: 11,
        selectionEnd: 11,
      },
      "Hello there friend",
    );
    expect(
      applyLiveTranscript(
        { ...edited, selectionStart: edited.draft.length, selectionEnd: edited.draft.length },
        "there now",
      ).draft,
    ).toBe("Hello there friend now");
  });

  it("replaces the selected phrase with the next spoken words", () => {
    expect(
      applyLiveTranscript(
        {
          draft: "Hello there friend",
          appliedLive: "there",
          selectionStart: 6,
          selectionEnd: 11,
        },
        "there pal",
      ).draft,
    ).toBe("Hello pal friend");
  });
});

describe("adoptUserText", () => {
  it("keeps the caret where a typed character replaced the selected phrase", () => {
    expect(
      adoptUserText(
        {
          draft: "Hello there friend",
          appliedLive: "there",
          selectionStart: 6,
          selectionEnd: 11,
        },
        "Hello x friend",
      ),
    ).toEqual({
      draft: "Hello x friend",
      appliedLive: "there",
      selectionStart: 7,
      selectionEnd: 7,
    });
  });
});

describe("adoptUserText", () => {
  it("keeps the caret where a typed character replaced the selected phrase", () => {
    expect(
      adoptUserText(
        {
          draft: "Hello there friend",
          appliedLive: "there",
          selectionStart: 6,
          selectionEnd: 11,
        },
        "Hello x friend",
      ),
    ).toEqual({
      draft: "Hello x friend",
      appliedLive: "there",
      selectionStart: 7,
      selectionEnd: 7,
    });
  });
});

describe("deleteRange", () => {
  it("removes the selected phrase and the extra space it leaves behind", () => {
    expect(deleteRange("Hello there friend", 6, 11)).toEqual({
      text: "Hello friend",
      caret: 6,
    });
  });
});

describe("wordAtOffset", () => {
  it("selects the word under the tap, including a tap on the space after it", () => {
    expect(wordAtOffset("Hello there friend", 8)).toEqual({
      start: 6,
      end: 11,
    });
    expect(wordAtOffset("Hello there friend", 11)).toEqual({
      start: 6,
      end: 11,
    });
    expect(wordAtOffset("Hello there friend", 5)).toEqual({
      start: 0,
      end: 5,
    });
  });
});

describe("locatePhrases", () => {
  it("finds each spoken phrase in order", () => {
    const phrases = locatePhrases("Hello there friend", ["there", "friend"]);
    expect(phrases.map((phrase) => [phrase.start, phrase.end, phrase.revising])).toEqual([
      [6, 11, false],
      [12, 18, true],
    ]);
    expect(phraseAtOffset(phrases, 8)?.start).toBe(6);
    expect(phraseAtOffset(phrases, 5)).toBeNull();
  });
});
