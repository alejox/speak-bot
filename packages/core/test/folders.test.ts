import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  BoardLimitError,
  clearKey,
  createBoard,
  createFolder,
  deleteBoard,
  FOLDER_BACK_KEY,
  folderDepth,
  folderPath,
  InvalidBoardError,
  LastBoardError,
  makeBoard,
  makeFolderBoard,
  MAX_STORED_BOARDS,
  moveKey,
  navigateBoard,
  readStoredBoards,
  resolveBoardPosition,
  setBoardGrid,
  setKey,
  SlotOccupiedError,
  visibleBoards,
  type Board,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const stream = (slot: number): Key => ({ slot, action: { type: "obs.toggleStream" } });
const deck = (id: string, keys: Key[] = []): Board => makeBoard(id, id, "deck", keys);
const setup = (boards: Board[]) => {
  const repository = new InMemoryBoardRepository(boards);
  return { repository, deps: { repository, generateId: sequentialIds("folder") } };
};
const ids = (boards: readonly Board[]) => boards.map((board) => board.id);

describe("folder boards", () => {
  it("makes an empty folder with the parent's kind and grid, the Back key on slot 0 and a link to its parent", () => {
    const parent = makeBoard("d", "Deck", "deck", [], { columns: 6, rows: 4 });
    expect(makeFolderBoard("f", "Scenes", parent)).toEqual({ id: "f", name: "Scenes", kind: "deck", parentId: "d", columns: 6, rows: 4, keys: [FOLDER_BACK_KEY] });
  });

  it("keeps the Back key on slot 0 of folders only, and nothing else there", () => {
    expect(() => makeBoard("f", "F", "deck", [], undefined, "d")).toThrow(InvalidBoardError);
    expect(() => makeBoard("f", "F", "deck", [stream(0)], undefined, "d")).toThrow(InvalidBoardError);
    expect(() => makeBoard("f", "F", "deck", [FOLDER_BACK_KEY, { slot: 3, action: { type: "nav.folderBack" } }], undefined, "d")).toThrow(InvalidBoardError);
    expect(() => makeBoard("d", "D", "deck", [FOLDER_BACK_KEY])).toThrow(InvalidBoardError);
  });

  it("never offers the Back action in the picker", () => {
    expect(ACTION_REGISTRY["nav.folderBack"].userSelectable).toBe(false);
    expect(ACTION_REGISTRY["nav.openFolder"].userSelectable).toBe(true);
    expect(ACTION_REGISTRY["nav.openFolder"].params.map((param) => [param.name, param.kind])).toEqual([["folderId", "folder"]]);
  });

  it("leaves folders out of the board lists and of the first board shown", () => {
    const folder = makeFolderBoard("f", "Scenes", deck("d"));
    const boards = [folder, deck("d"), deck("e")];
    expect(ids(visibleBoards(boards))).toEqual(["d", "e"]);
    expect(resolveBoardPosition(boards, null)).toEqual({ boardId: "d", page: 0 });
    expect(resolveBoardPosition(boards, { boardId: "f", page: 0 })).toEqual({ boardId: "f", page: 0 });
  });

  it("gives the path from the outermost board, for the breadcrumb, and the depth", () => {
    const root = deck("d");
    const scenes = makeFolderBoard("f1", "Scenes", root);
    const intro = makeFolderBoard("f2", "Intro", scenes);
    const boards = [root, scenes, intro];
    expect(folderPath(boards, "f2").map((board) => board.name)).toEqual(["d", "Scenes", "Intro"]);
    expect([folderDepth(boards, root), folderDepth(boards, scenes), folderDepth(boards, intro)]).toEqual([0, 1, 2]);
  });

  it("opens a folder on its first page and goes Back to the board it is in", () => {
    const root = deck("d");
    const boards = [root, makeFolderBoard("f", "Scenes", root)];
    expect(navigateBoard(boards, { boardId: "d", page: 2 }, { type: "nav.openFolder", folderId: "f" })).toEqual({ boardId: "f", page: 0 });
    expect(navigateBoard(boards, { boardId: "d", page: 0 }, { type: "nav.openFolder", folderId: "gone" })).toEqual({ boardId: "d", page: 0 });
    expect(navigateBoard(boards, { boardId: "f", page: 0 }, { type: "nav.folderBack" })).toEqual({ boardId: "d", page: 0 });
  });
});

describe("stored folders", () => {
  const stored = (board: Board) => JSON.parse(JSON.stringify(board)) as unknown;

  it("reads folders back unchanged", () => {
    const root = deck("d", [{ slot: 1, action: { type: "nav.openFolder", folderId: "f" } }]);
    const folder = { ...makeFolderBoard("f", "Scenes", root), keys: [FOLDER_BACK_KEY, stream(4)] };
    const boards = [root, folder];
    expect(readStoredBoards(boards.map(stored))).toEqual(boards);
  });

  it("drops folders whose parent is missing, of another kind, too deep or in a loop, with everything inside them", () => {
    const root = deck("d");
    const f1 = makeFolderBoard("f1", "1", root);
    const f2 = makeFolderBoard("f2", "2", f1);
    const f3 = makeFolderBoard("f3", "3", f2);
    const f4 = makeFolderBoard("f4", "4", f3);
    const orphan = makeFolderBoard("o", "O", deck("gone"));
    const inOrphan = makeFolderBoard("o2", "O2", orphan);
    const otherKind = { ...makeFolderBoard("k", "K", root), kind: "voice" as const };
    const loopA = { ...makeFolderBoard("a", "A", root), parentId: "b" };
    const loopB = { ...makeFolderBoard("b", "B", root), parentId: "a" };
    const read = readStoredBoards([root, f1, f2, f3, f4, orphan, inOrphan, otherKind, loopA, loopB].map(stored));
    expect(ids(read)).toEqual(["d", "f1", "f2", "f3"]);
  });

  it("puts the Back key back on slot 0 and drops a key stored there or a Back key anywhere else", () => {
    const folder = { id: "f", name: "F", kind: "deck", parentId: "d", columns: 5, rows: 3, keys: [stream(0), { slot: 2, action: { type: "nav.folderBack" } }, stream(3)] };
    const root = { ...deck("d"), keys: [FOLDER_BACK_KEY, stream(1)] };
    const [readRoot, readFolder] = readStoredBoards([root, folder]);
    expect(readRoot!.keys).toEqual([stream(1)]);
    expect(readFolder!.keys).toEqual([FOLDER_BACK_KEY, stream(3)]);
  });
});

describe("folder use cases", () => {
  it("creates the folder and the key that opens it in one write", async () => {
    const { repository, deps } = setup([deck("d")]);
    const { folder, key } = await createFolder(deps, "d", { slot: 2, label: " Scenes ", icon: "folder" });
    expect(repository.writeCount).toBe(1);
    expect(key).toEqual({ slot: 2, label: "Scenes", icon: "folder", action: { type: "nav.openFolder", folderId: "folder-1" } });
    expect(folder).toEqual(makeFolderBoard("folder-1", "Scenes", deck("d")));
    const boards = await repository.list();
    expect(ids(boards)).toEqual(["d", "folder-1"]);
    expect(boards[0]!.keys).toEqual([key]);
  });

  it("refuses a folder past three levels, on a used slot, without a name or past the stored board limit", async () => {
    const { repository, deps } = setup([deck("d", [stream(1)])]);
    const one = await createFolder(deps, "d", { slot: 2, label: "1" });
    const two = await createFolder(deps, one.folder.id, { slot: 1, label: "2" });
    const three = await createFolder(deps, two.folder.id, { slot: 1, label: "3" });
    await expect(createFolder(deps, three.folder.id, { slot: 1, label: "4" })).rejects.toThrow(InvalidBoardError);
    await expect(createFolder(deps, "d", { slot: 1, label: "X" })).rejects.toThrow(SlotOccupiedError);
    await expect(createFolder(deps, one.folder.id, { slot: 0, label: "X" })).rejects.toThrow(InvalidBoardError);
    await expect(createFolder(deps, "d", { slot: 5, label: "  " })).rejects.toThrow(InvalidBoardError);
    expect(await repository.list()).toHaveLength(4);

    const full = setup([deck("d"), ...Array.from({ length: MAX_STORED_BOARDS - 1 }, (_, index) => makeFolderBoard(`f${index}`, "F", deck("d")))]);
    await expect(createFolder(full.deps, "d", { slot: 1, label: "X" })).rejects.toThrow(BoardLimitError);
  });

  it("counts only boards that are not folders toward the board limit, and folders toward the stored limit", async () => {
    const folders = Array.from({ length: 60 }, (_, index) => makeFolderBoard(`f${index}`, "F", deck("d")));
    const { deps } = setup([deck("d"), ...folders]);
    await expect(createBoard(deps, { name: "New", kind: "deck" })).resolves.toMatchObject({ name: "New" });
  });

  it("keeps the Back key where it is: it cannot be replaced, cleared or moved, and no key goes on its slot", async () => {
    const { repository, deps } = setup([deck("d")]);
    const { folder } = await createFolder(deps, "d", { slot: 1, label: "F" });
    await setKey(repository, folder.id, stream(3));
    await expect(setKey(repository, folder.id, stream(0), { replace: true })).rejects.toThrow(InvalidBoardError);
    await expect(clearKey(repository, folder.id, 0)).rejects.toThrow(InvalidBoardError);
    await expect(moveKey(repository, folder.id, 0, 4)).rejects.toThrow(InvalidBoardError);
    await expect(moveKey(repository, folder.id, 3, 0)).rejects.toThrow(InvalidBoardError);
    await expect(setKey(repository, folder.id, { slot: 5, action: { type: "nav.folderBack" } })).rejects.toThrow(InvalidBoardError);
    await expect(setKey(repository, "d", { slot: 5, action: { type: "nav.folderBack" } })).rejects.toThrow(InvalidBoardError);
    const stored = (await repository.list()).find((board) => board.id === folder.id)!;
    expect(stored.keys).toEqual([FOLDER_BACK_KEY, stream(3)]);
  });

  it("lets a folder key open only an existing folder of its own board, and renames the folder with the key", async () => {
    const { repository, deps } = setup([deck("d"), deck("e")]);
    const { folder } = await createFolder(deps, "d", { slot: 1, label: "Old" });
    await expect(setKey(repository, "e", { slot: 1, action: { type: "nav.openFolder", folderId: folder.id } })).rejects.toThrow(InvalidBoardError);
    await expect(setKey(repository, "d", { slot: 2, action: { type: "nav.openFolder", folderId: "missing" } })).rejects.toThrow(InvalidBoardError);
    await setKey(repository, "d", { slot: 1, label: "New", action: { type: "nav.openFolder", folderId: folder.id } }, { replace: true });
    expect((await repository.list()).find((board) => board.id === folder.id)!.name).toBe("New");
  });

  it("moves a folder key and keeps the same folder", async () => {
    const { repository, deps } = setup([deck("d")]);
    const { folder, key } = await createFolder(deps, "d", { slot: 1, label: "F" });
    await moveKey(repository, "d", 1, 6);
    const boards = await repository.list();
    expect(boards[0]!.keys).toEqual([{ ...key, slot: 6 }]);
    expect(ids(boards)).toEqual(["d", folder.id]);
  });

  it("deletes the folder and everything inside it when its key is cleared or replaced", async () => {
    const { repository, deps } = setup([deck("d")]);
    const outer = await createFolder(deps, "d", { slot: 1, label: "Outer" });
    await createFolder(deps, outer.folder.id, { slot: 1, label: "Inner" });
    const other = await createFolder(deps, "d", { slot: 2, label: "Other" });
    expect(await repository.list()).toHaveLength(4);
    await clearKey(repository, "d", 1);
    expect(ids(await repository.list())).toEqual(["d", other.folder.id]);
    await setKey(repository, "d", stream(2), { replace: true });
    expect(ids(await repository.list())).toEqual(["d"]);
  });

  it("deletes a board with its folders, and a folder with the keys that open it", async () => {
    const { repository, deps } = setup([deck("d"), deck("e")]);
    const inD = await createFolder(deps, "d", { slot: 1, label: "D" });
    const inE = await createFolder(deps, "e", { slot: 1, label: "E" });
    await deleteBoard(repository, inE.folder.id);
    expect((await repository.list()).find((board) => board.id === "e")!.keys).toEqual([]);
    await deleteBoard(repository, "d");
    expect(ids(await repository.list())).toEqual(["e"]);
    expect(inD.folder.id).not.toBe(inE.folder.id);
    await expect(deleteBoard(repository, "e")).rejects.toThrow(LastBoardError);
  });

  it("resizes folders with their kind and keeps the Back key on slot 0", async () => {
    const { repository, deps } = setup([deck("d")]);
    const { folder } = await createFolder(deps, "d", { slot: 1, label: "F" });
    await setKey(repository, folder.id, stream(4));
    await setKey(repository, folder.id, stream(14));
    const boards = await setBoardGrid(repository, { kind: "deck", columns: 3, rows: 2 });
    const resized = boards.find((board) => board.id === folder.id)!;
    expect(resized).toMatchObject({ columns: 3, rows: 2, parentId: "d" });
    expect(resized.keys[0]).toEqual(FOLDER_BACK_KEY);
    expect(resized.keys.map((key) => key.slot)).toEqual([0, 1, 2]);
  });
});
