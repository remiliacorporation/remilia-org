// A note's words are written in its own editor (its dialog or margin box),
// apart from the editor its mark stands in. Undo then redo in that editor
// put the note back as it was inserted, with no words: AI 2084's notes 3, 6,
// 23 and 24 (2026-11-13). The Studio keeps a note's words while its mark is
// out of the editor and writes them back (studio/noteMemory.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasWords, NoteMemory } from "../../../studio/noteMemory";

const para = (text: string, key = "b1") => ({
  _type: "block",
  _key: key,
  style: "normal",
  markDefs: [],
  children: [{ _type: "span", _key: `${key}s`, text, marks: [] }],
});

test("a note that comes back with no words gets back the words it left with", () => {
  const memory = new NoteMemory();
  const words = [para("Third level text.")];
  // Undo takes the note's mark out of its parent's editor.
  memory.leave("n3", words);
  // Redo puts back the note as it was inserted: no content field at all.
  assert.deepEqual(memory.back("n3", undefined), words);
  // Opening its dialog first would have left an empty list.
  memory.leave("n3", words);
  assert.deepEqual(memory.back("n3", []), words);
  memory.leave("n3", words);
  assert.deepEqual(memory.back("n3", [para("")]), words);
});

test("a note that comes back with words keeps its own", () => {
  const memory = new NoteMemory();
  memory.leave("n3", [para("Old words.")]);
  assert.equal(memory.back("n3", [para("New words.")]), undefined);
});

test("a note its author emptied stays empty", () => {
  const memory = new NoteMemory();
  memory.leave("n3", [para("Words.")]);
  memory.back("n3", [para("Words.")]);
  // Emptied while its mark was in the editor, then its dialog closed.
  memory.leave("n3", []);
  assert.equal(memory.back("n3", undefined), undefined);
});

test("words are given back once, and only to the same note", () => {
  const memory = new NoteMemory();
  memory.leave("n3", [para("Words.")]);
  assert.equal(memory.back("n4", undefined), undefined);
  assert.ok(memory.back("n3", undefined));
  assert.equal(memory.back("n3", undefined), undefined);
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
