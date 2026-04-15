const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export async function apiJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, body: bodyInit, ...rest } = init;
  const h = new Headers(headers);
  if (json !== undefined) {
    Object.entries(JSON_HEADERS).forEach(([k, v]) => h.set(k, v));
  }
  const res = await fetch(path, {
    ...rest,
    headers: h,
    credentials: "include",
    body: json !== undefined ? JSON.stringify(json) : bodyInit,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number; body: T };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
