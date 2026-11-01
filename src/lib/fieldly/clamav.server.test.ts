import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClamAvStreamResponse } from "./clamav.server.ts";

test("accepts only an explicit clean ClamAV response", () => {
  assert.deepEqual(parseClamAvStreamResponse("stream: OK\0"), { clean: true });
});

test("rejects a file when ClamAV reports a threat", () => {
  assert.deepEqual(
    parseClamAvStreamResponse("stream: Eicar-Test-Signature FOUND\0"),
    { clean: false, signature: "Eicar-Test-Signature" },
  );
});

test("fails closed for errors and incomplete scanner responses", () => {
  assert.throws(() => parseClamAvStreamResponse("stream: ERROR"), /incomplete or invalid/);
});
