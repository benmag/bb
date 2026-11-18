import { describe, expect, it } from "vitest";
import { appendDictation, joinDictationBatches } from "./dictation-text";

describe("appendDictation", () => {
  it("appends speech after text the user already had", () => {
    expect(
      appendDictation({ draft: "Hello", appliedLive: "" }, "there"),
    ).toEqual({ draft: "Hello there", appliedLive: "there" });
  });

  it("keeps a typed edit and only adds speech that is new", () => {
    expect(
      appendDictation(
        { draft: "Hello there friend", appliedLive: "there" },
        "there now",
      ),
    ).toEqual({
      draft: "Hello there friend now",
      appliedLive: "there now",
    });
  });

  it("adopts a recognizer rewrite of the words it already showed", () => {
    expect(
      appendDictation({ draft: "Hello there", appliedLive: "there" }, "their"),
    ).toEqual({ draft: "Hello their", appliedLive: "their" });
  });

  it("does not overwrite an edit when the recognizer rewrites earlier words", () => {
    expect(
      appendDictation(
        { draft: "Hello pal", appliedLive: "there" },
        "their",
      ),
    ).toEqual({ draft: "Hello pal", appliedLive: "their" });
  });
});

describe("joinDictationBatches", () => {
  it("keeps a period attached when it arrives as its own batch", () => {
    expect(joinDictationBatches(["Hello", "."])).toBe("Hello.");
  });

  it("spaces a later phrase after the previous one", () => {
    expect(joinDictationBatches(["Hello.", "How are you"])).toBe(
      "Hello. How are you",
    );
  });

  it("collapses the duplicated sentence and the corrected question", () => {
    const sentence =
      "Okay, let's see whether this is much better at detecting.";
    expect(
      joinDictationBatches([
        sentence,
        sentence,
        "Why' you do it twice?",
        "Why did you do it twice?",
      ]),
    ).toBe(`${sentence} Why did you do it twice?`);
  });

  it("drops a sentence the recognizer emits again", () => {
    const sentence =
      "Okay, let's see whether this is much better at detecting.";
    expect(joinDictationBatches([sentence, sentence])).toBe(sentence);
  });

  it("replaces a rough phrase with the corrected phrase", () => {
    expect(
      joinDictationBatches([
        "Okay, let's see whether this is much better at detecting.",
        "Why' you do it twice?",
        "Why did you do it twice?",
      ]),
    ).toBe(
      "Okay, let's see whether this is much better at detecting. Why did you do it twice?",
    );
  });

  it("keeps the corrected sentence when a later batch repeats the earlier one", () => {
    const sentence =
      "Okay, let's see whether this is much better at detecting.";
    expect(
      joinDictationBatches([
        sentence,
        "Why' you do it twice?",
        `${sentence} Why did you do it twice?`,
      ]),
    ).toBe(`${sentence} Why did you do it twice?`);
  });
});
