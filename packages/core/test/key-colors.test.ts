import { describe, expect, it } from "vitest";
import { createKey, InvalidBoardError, readStoredBoards, setKey, makeBoard } from "../src/index";
import { InMemoryBoardRepository } from "./fakes";

const record = { type: "obs.toggleRecord" } as const;

describe("a key's colour when on", () => {
  it("accepts an optional activeColor validated like color, kept after color", () => {
    const key = createKey({ slot: 0, color: "#112233", activeColor: "#AA0000", action: record });
    expect(key).toEqual({ slot: 0, color: "#112233", activeColor: "#aa0000", action: record });
    expect(Object.keys(key)).toEqual(["slot", "color", "activeColor", "action"]);
    expect(createKey({ slot: 0, activeColor: "", action: record })).toEqual({ slot: 0, action: record });
    for (const activeColor of ["red", "#abc", 5]) expect(() => createKey({ slot: 0, activeColor, action: record })).toThrow(InvalidBoardError);
  });

  it("is stored and read back", async () => {
    const repository = new InMemoryBoardRepository([makeBoard("deck", "Deck", "deck")]);
    await setKey(repository, "deck", { slot: 3, activeColor: "#00ff00", action: record });
    const [board] = await repository.list();
    expect(readStoredBoards(JSON.parse(JSON.stringify([board])))[0]!.keys).toEqual([{ slot: 3, activeColor: "#00ff00", action: record }]);
  });
});
