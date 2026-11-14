// A note's words are written in its own editor (its dialog or margin box),
// apart from the editor its mark stands in. Undo then redo in that editor
// put the note back as it was inserted, with no words: AI 2084's notes 3, 6,
// 23 and 24 (2026-11-13). The Studio keeps a note's words while its mark is
// out of the editor and writes them back once the document holds the empty
// copy (note-memory.ts, studio/portableText.tsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasWords, jsonPath, NoteMemory, noteId } from "./note-memory";

const para = (text: string, key = "b1") => ({
  _type: "block",
  _key: key,
  style: "normal",
  markDefs: [],
  children: [{ _type: "span", _key: `${key}s`, text, marks: [] }],
});
const words = [para("Third level text.")];
const full = { _key: "n3", _type: "footnote", content: words };
// What redo puts back: the note as it was inserted.
const bare = { _key: "n3", _type: "footnote" };
const ID = "drafts.post|b1/n1/c1/n2/c2/n3";
const ED = "editor";

test("a fast undo and redo: the words are written once the document holds the empty copy", () => {
  const memory = new NoteMemory<string>();
  // Undo: the mark leaves; the document still holds the note with words.
  memory.leave(ID, ED, full);
  // Redo within the same batch: the editor holds the empty copy, the
  // document still holds the words. Writing now would be overwritten by the
  // batch, so it waits.
  assert.deepEqual(memory.step(ID, ED, full, bare), { kind: "wait" });
  // The batch lands: unset, then insert of the empty copy.
  assert.deepEqual(memory.step(ID, ED, bare, bare), { kind: "write", words });
  // The written words reach the document, then the editor.
  assert.deepEqual(memory.step(ID, ED, full, bare), { kind: "wait" });
  assert.deepEqual(memory.step(ID, ED, full, full), { kind: "none" });
  assert.equal(memory.has(ID, ED), false);
});

test("a slow undo and redo: the document lacks the note, then holds the empty copy", () => {
  const memory = new NoteMemory<string>();
  memory.leave(ID, ED, full);
  // The undo was sent: the document no longer holds the note.
  assert.deepEqual(memory.step(ID, ED, undefined, bare), { kind: "wait" });
  // Opening the note's dialog first leaves an empty list.
  assert.deepEqual(memory.step(ID, ED, { ...bare, content: [] }, bare), {
    kind: "write",
    words,
  });
  assert.deepEqual(memory.step(ID, ED, { ...bare, content: [para(" ")] }, bare), {
    kind: "write",
    words,
  });
});

test("a mark mounted again with its words (the editor re-syncing) forgets them", () => {
  const memory = new NoteMemory<string>();
  memory.leave(ID, ED, full);
  assert.deepEqual(memory.step(ID, ED, full, full), { kind: "none" });
  assert.equal(memory.has(ID, ED), false);
});

test("a note emptied or removed in the document before its mark left keeps nothing", () => {
  const memory = new NoteMemory<string>();
  // Its author, or a collaborator, emptied it.
  memory.leave(ID, ED, { ...bare, content: [para("")] });
  assert.equal(memory.has(ID, ED), false);
  // A collaborator removed it.
  memory.leave(ID, ED, undefined);
  assert.equal(memory.has(ID, ED), false);
  assert.deepEqual(memory.step(ID, ED, bare, bare), { kind: "none" });
});

test("words go back only to the same note, in the same document, from the same editor", () => {
  const memory = new NoteMemory<string>();
  memory.leave(ID, ED, full);
  assert.deepEqual(memory.step("drafts.copy|b1/n1/c1/n2/c2/n3", ED, bare, bare), { kind: "none" });
  assert.deepEqual(memory.step("drafts.post|b1/n4", ED, bare, bare), { kind: "none" });
  assert.deepEqual(memory.step(ID, "another editor", bare, bare), { kind: "none" });
  assert.equal(memory.step(ID, ED, bare, bare).kind, "write");
});

test("an editor that closed keeps nothing, and the memory stays small", () => {
  const open = new Set(["a", "b"]);
  const memory = new NoteMemory<string>((e) => open.has(e), 2);
  memory.leave("d|x/1", "a", full);
  open.delete("a");
  memory.leave("d|x/2", "b", full);
  assert.equal(memory.has("d|x/1", "a"), false);
  memory.leave("d|x/3", "b", full);
  memory.leave("d|x/4", "b", full);
  assert.deepEqual(
    ["d|x/2", "d|x/3", "d|x/4"].map((id) => memory.has(id, "b")),
    [false, true, true],
  );
});

test("a note's id and patch path need a note's whole path", () => {
  const path = ["body", { _key: "p1" }, "children", { _key: "n1" }];
  assert.equal(noteId("drafts.a", path), "drafts.a|p1/n1");
  // Before the form holds a note, its path has no keys.
  assert.equal(noteId("drafts.a", []), undefined);
  assert.equal(noteId("drafts.a", ["body", { _key: "p1" }]), undefined);
  assert.equal(noteId(undefined, path), undefined);
  assert.equal(jsonPath(path), 'body[_key=="p1"].children[_key=="n1"]');
  assert.equal(jsonPath(["body", 0, "children"]), "body[0].children");
});

test("a note's own notes count as words", () => {
  const nested = {
    ...para(""),
    children: [
      { _type: "span", _key: "a", text: "", marks: [] },
      { _type: "footnote", _key: "f" },
    ],
  };
  assert.equal(hasWords([nested]), true);
  assert.equal(hasWords([para(" ")]), false);
  assert.equal(hasWords(undefined), false);
  assert.equal(hasWords([{ _type: "image", _key: "i" }]), true);
});
