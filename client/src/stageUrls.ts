/** URL другого этапа: env → тот же хост с портом деплоя → localhost для dev. */
export function resolveStageAppUrl(
  envValue: string | undefined,
  deployPort: number,
  devPort: number,
): string {
  if (envValue?.trim()) return envValue.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const port = hostname === "localhost" || hostname === "127.0.0.1" ? devPort : deployPort;
    return `${protocol}//${hostname}:${port}`;
  }
  return `http://192.168.1.184:${deployPort}`;
}

export const STAGE2_APP_URL = resolveStageAppUrl(import.meta.env.VITE_STAGE2_APP_URL, 1002, 5174);
