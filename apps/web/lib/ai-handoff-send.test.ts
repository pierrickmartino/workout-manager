import { test } from "node:test";
import assert from "node:assert/strict";

import {
  copyHandoff,
  handoffResultMessage,
  sendHandoff,
  type HandoffDevice,
} from "./ai-handoff-send.ts";

// Send prefers the device's share sheet and falls back to the clipboard; Copy always copies. The
// device is injected, so the rules are pinned without a browser. What a real share sheet and a
// real clipboard do is verified in the browser.

function device(overrides: Partial<HandoffDevice> = {}): HandoffDevice & { copied: string[] } {
  const copied: string[] = [];
  return {
    copied,
    clipboard: {
      writeText: async (text: string) => {
        copied.push(text);
      },
    },
    ...overrides,
  };
}

function abortError(): Error {
  return Object.assign(new Error("Share canceled"), { name: "AbortError" });
}

test("Send opens the share sheet when the device has one, and copies nothing", async () => {
  const shared: string[] = [];
  const target = device({ share: async ({ text }) => void shared.push(text) });

  const result = await sendHandoff("hand-off text", target);

  assert.equal(result, "shared");
  assert.deepEqual(shared, ["hand-off text"]);
  assert.deepEqual(target.copied, []);
});

test("Send copies to the clipboard when the device has no share sheet", async () => {
  const target = device();

  const result = await sendHandoff("hand-off text", target);

  assert.equal(result, "copied");
  assert.deepEqual(target.copied, ["hand-off text"]);
});

test("Send copies when the share sheet cannot share this text", async () => {
  const target = device({ share: async () => undefined, canShare: () => false });

  const result = await sendHandoff("hand-off text", target);

  assert.equal(result, "copied");
});

test("a cancelled share sends nothing and copies nothing", async () => {
  const target = device({
    share: async () => {
      throw abortError();
    },
  });

  const result = await sendHandoff("hand-off text", target);

  assert.equal(result, "cancelled");
  assert.deepEqual(target.copied, []);
});

test("a share that fails for another reason falls back to the clipboard", async () => {
  const target = device({
    share: async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    },
  });

  const result = await sendHandoff("hand-off text", target);

  assert.equal(result, "copied");
  assert.deepEqual(target.copied, ["hand-off text"]);
});

test("Copy always copies, even where a share sheet exists", async () => {
  const target = device({ share: async () => assert.fail("Copy must not share") });

  const result = await copyHandoff("hand-off text", target);

  assert.equal(result, "copied");
  assert.deepEqual(target.copied, ["hand-off text"]);
});

test("a denied clipboard reports a failed copy", async () => {
  const target = device({
    clipboard: {
      writeText: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    },
  });

  assert.equal(await copyHandoff("hand-off text", target), "copy-failed");
  assert.equal(await sendHandoff("hand-off text", target), "copy-failed");
});

test("a device without a clipboard reports a failed copy", async () => {
  assert.equal(await copyHandoff("hand-off text", {}), "copy-failed");
});

test("the sheet confirms a copy, explains a failed one, and says nothing after a cancelled share", () => {
  assert.match(handoffResultMessage("copied") ?? "", /^Copied/);
  assert.match(handoffResultMessage("copy-failed") ?? "", /copy it by hand/);
  assert.equal(handoffResultMessage("cancelled"), null);
  assert.equal(handoffResultMessage(null), null);
});
