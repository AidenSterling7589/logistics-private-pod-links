export type Shipment = {
  id: string;
  allowedSessionId: string;
  podKey: string;
  events: Array<{ type: "picked_up" | "delivered" | "exception" | "exception_resolved"; at: string }>;
};

export function mayDownloadPod(shipment: Shipment, sessionId: string): boolean {
  if (shipment.allowedSessionId !== sessionId) return false;
  let delivered = false;
  let openException = false;
  for (const event of shipment.events) {
    if (event.type === "delivered") delivered = true;
    if (event.type === "exception") openException = true;
    if (event.type === "exception_resolved") openException = false;
  }
  return delivered && !openException;
}
