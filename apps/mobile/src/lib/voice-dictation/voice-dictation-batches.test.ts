import { describe, expect, it } from "vitest";
import { mergeSealedAndFreshBatches } from "./voice-dictation-batches";

describe("mergeSealedAndFreshBatches", () => {
  it("returns fresh batches when nothing is sealed", () => {
    expect(mergeSealedAndFreshBatches([], ["hello"])).toEqual(["hello"]);
  });

  it("appends a new recognition segment after background handoff", () => {
    expect(mergeSealedAndFreshBatches(["while open"], ["in background"])).toEqual(
      ["while open", "in background"],
    );
  });

  it("keeps sealed text when the recognizer has not emitted yet", () => {
    expect(mergeSealedAndFreshBatches(["prior"], [])).toEqual(["prior"]);
  });
});
