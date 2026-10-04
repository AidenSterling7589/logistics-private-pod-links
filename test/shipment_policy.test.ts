import test from "node:test";
import assert from "node:assert/strict";
import { mayDownloadPod, type Shipment } from "../src/shipment_policy.ts";

test("POD is released only after delivery and exception resolution to the assigned session", () => {
  const shipment: Shipment = {
    id: "SHP-1042", allowedSessionId: "session-42", podKey: "pod/SHP-1042.pdf",
    events: [{ type: "delivered", at: "2026-09-19T15:00:00Z" }, { type: "exception", at: "2026-09-19T16:00:00Z" }],
  };
  assert.equal(mayDownloadPod(shipment, "session-42"), false);
  shipment.events.push({ type: "exception_resolved", at: "2026-09-19T17:00:00Z" });
  assert.equal(mayDownloadPod(shipment, "another-session"), false);
  assert.equal(mayDownloadPod(shipment, "session-42"), true);
});
