import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { infraiCall, InfraiError } from "./infrai_rest.ts";
import { mayDownloadPod, type Shipment } from "./shipment_policy.ts";

const bucket = process.env.POD_BUCKET ?? "logistics-pod-demo";
const sessionId = process.env.DEMO_SESSION_ID;
if (!sessionId) throw new Error("Set DEMO_SESSION_ID to a session allowed to read the sample shipment");

// In an application, load these server-owned records from your shipment database.
const shipments = new Map<string, Shipment>([["SHP-1042", {
  id: "SHP-1042", allowedSessionId: sessionId, podKey: "pod/SHP-1042.pdf",
  events: [
    { type: "picked_up", at: "2026-09-18T09:00:00Z" },
    { type: "exception", at: "2026-09-18T11:00:00Z" },
    { type: "exception_resolved", at: "2026-09-18T12:00:00Z" },
    { type: "delivered", at: "2026-09-19T15:00:00Z" },
  ],
}]]);

const requestBody = z.object({ shipmentId: z.string().min(1), sessionId: z.string().min(1) }).strict();
const segment = (value: string) => encodeURIComponent(value);

async function ensureBucket(): Promise<void> {
  try {
    await infraiCall("GET", `/v1/storage/bucket/get/${segment(bucket)}`);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infraiCall("POST", "/v1/storage/bucket/create", { name: bucket });
  }
}

await ensureBucket();
createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (req.method !== "POST" || req.url !== "/pod/download") return send(404, { error: "Route not found" });
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 8192) return send(413, { error: "Request body too large" });
    }
    const input = requestBody.parse(JSON.parse(raw));
    const shipment = shipments.get(input.shipmentId);
    if (!shipment) return send(404, { error: "Shipment not found" });
    if (shipment.allowedSessionId !== input.sessionId) return send(403, { error: "Access denied" });
    await infraiCall("GET", `/v1/auth/session/verify/${segment(input.sessionId)}`);
    if (!mayDownloadPod(shipment, input.sessionId)) return send(409, { error: "POD not available for this shipment state" });
    const key = shipment.podKey.split("/").map(segment).join("/");
    const head = await infraiCall<{ found: boolean }>("GET", `/v1/storage/object/head/${segment(bucket)}/${key}`);
    if (!head.found) return send(404, { error: "POD not uploaded" });
    const signed = await infraiCall<{ url: string }>("POST", `/v1/storage/object/presign/${segment(bucket)}/${key}`, {
      op: "get", expires_seconds: 300,
      response_disposition: `attachment; filename="${shipment.id}.pdf"`,
      idempotency_key: randomUUID(),
    });
    return send(200, { shipmentId: shipment.id, downloadUrl: signed.url, expiresSeconds: 300 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return send(400, { error: "Invalid request body" });
    if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
    console.error(error);
    return send(502, { error: "Download request failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("POD download route listening"));
