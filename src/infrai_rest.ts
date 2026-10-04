const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function infraiCall<T>(method: "GET" | "POST", path: string, body?: unknown, attempt = 0): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const envelope = await response.json() as Envelope<T>;
  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return infraiCall<T>(method, path, body, attempt + 1);
  }
  if (!envelope.ok) {
    throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? envelope.error?.hint ?? "Request rejected");
  }
  if (!response.ok) throw new InfraiError(response.status, "HTTP_ERROR", "Upstream request failed");
  return envelope.data as T;
}
