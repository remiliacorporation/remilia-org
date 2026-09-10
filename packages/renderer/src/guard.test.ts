import { test } from "node:test";
import assert from "node:assert/strict";
import { readFailureMessage, refusalFor } from "./guard";

test("a tokenless read is refused before it can look empty", () => {
  const refusal = refusalFor({ token: undefined, postCount: 12, what: "updates" });
  assert.ok(refusal);
  assert.match(refusal, /SANITY_TOKEN/);
});

test("zero posts with a valid token is refused as an empty dataset", () => {
  const refusal = refusalFor({
    token: "sk-real",
    postCount: 0,
    what: "production",
  });
  assert.ok(refusal);
  assert.match(refusal, /production/);
  assert.match(refusal, /empty dataset/);
});

test("posts present with a token is publishable", () => {
  assert.equal(
    refusalFor({ token: "sk-real", postCount: 3, what: "updates" }),
    undefined,
  );
});

test("an expired token is reported as a credential fault, not an empty dataset", () => {
  const err = Object.assign(new Error("Unauthorized - Session not found"), {
    statusCode: 401,
  });
  const message = readFailureMessage(err);
  assert.match(message, /401/);
  assert.match(message, /expired/);
});

test("a forbidden read is also a credential fault", () => {
  const message = readFailureMessage(
    Object.assign(new Error("Forbidden"), { statusCode: 403 }),
  );
  assert.match(message, /403/);
  assert.match(message, /read access/);
});

test("other read failures keep their own cause", () => {
  const message = readFailureMessage(new Error("getaddrinfo ENOTFOUND"));
  assert.match(message, /ENOTFOUND/);
  assert.ok(!message.includes("expired"));
});

test("a non-error rejection still produces a message", () => {
  assert.match(readFailureMessage("socket hang up"), /socket hang up/);
});
