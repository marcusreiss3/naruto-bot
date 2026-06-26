import { log } from "../../utils/logger.js";

export const MAX_APPEARANCE_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export async function downloadImageBuffer(
  url: string,
  label: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    log.warn(`[${label}] download falhou:`, (err as Error).message);
    clearTimeout(timeout);
    return null;
  }

  try {
    if (!res.ok) {
      log.warn(`[${label}] download falhou HTTP ${res.status}`);
      return null;
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_APPEARANCE_IMAGE_BYTES) {
      log.warn(`[${label}] imagem grande demais: ${contentLength} bytes`);
      return null;
    }

    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const reader = res.body?.getReader();
    if (!reader) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_APPEARANCE_IMAGE_BYTES) {
        log.warn(`[${label}] imagem grande demais: ${buffer.length} bytes`);
        return null;
      }
      return { buffer, mime };
    }

    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_APPEARANCE_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        log.warn(`[${label}] imagem grande demais: ${total} bytes`);
        return null;
      }
      chunks.push(Buffer.from(value));
    }

    return { buffer: Buffer.concat(chunks, total), mime };
  } finally {
    clearTimeout(timeout);
  }
}
