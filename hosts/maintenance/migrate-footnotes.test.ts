import { test } from "node:test";
import assert from "node:assert/strict";
import { hasOldFootnotes } from "@remilia/renderer";
import { planDoc, type NoteDoc } from "./migrate-footnotes";

const oldBody = (n?: number) => [
  {
    _type: "block",
    _key: "b1",
    style: "normal",
    children: [
      { _type: "span", _key: "s1", text: "Claim", marks: [] },
      { _type: "span", _key: "s2", text: "", marks: ["f1"] },
      { _type: "span", _key: "s3", text: ".", marks: [] },
    ],
    markDefs: [{ _key: "f1", _type: "footnote", text: "Source.", ...(n ? { n } : {}) }],
  },
];

const doc = (over: Partial<NoteDoc>): NoteDoc => ({
  _id: "post-a",
  _rev: "rev1",
  _type: "post",
  ...over,
});

test("a post with old notes is planned: notes moved, revision recorded, page unchanged", () => {
  const plan = planDoc(doc({ body: oldBody(1) }));
  assert.ok(plan);
  assert.equal(plan.rev, "rev1");
  assert.deepEqual(Object.keys(plan.set), ["body"]);
  assert.equal(hasOldFootnotes(plan.set.body), false);
  assert.match(plan.lines[0], /1 notes, 1 moved, 1 stored numbers removed, page unchanged/);
});

test("a post with nothing to move is left out", () => {
  assert.equal(planDoc(doc({ body: [{ _type: "block", children: [] }] })), undefined);
  const migrated = planDoc(doc({ body: oldBody() }))!.set.body;
  assert.equal(planDoc(doc({ body: migrated })), undefined);
});

test("a number that differs from the reading order is kept, and removed only on request", () => {
  const kept = planDoc(doc({ body: oldBody(2) }))!;
  assert.match(kept.lines[0], /stored numbers 2 kept, page unchanged/);
  assert.ok(JSON.stringify(kept.set.body).includes('"n":2'));
  const renumbered = planDoc(doc({ body: oldBody(2) }), { renumber: true })!;
  assert.match(renumbered.lines[0], /renumbered from 2 \(the page changes\)/);
  assert.equal(JSON.stringify(renumbered.set.body).includes('"n"'), false);
});

test("commentary is migrated as the body is", () => {
  const plan = planDoc(doc({ commentary: oldBody() }))!;
  assert.deepEqual(Object.keys(plan.set), ["commentary"]);
});
