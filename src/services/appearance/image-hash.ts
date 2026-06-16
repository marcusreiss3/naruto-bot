import sharp from "sharp";
import { log } from "../../utils/logger.js";

// dHash perceptual: redimensiona p/ 9x8 cinza, compara pixels adjacentes em
// cada linha (8 comparações x 8 linhas = 64 bits). Robusto a resize/recompressão.
export async function perceptualHashFromUrl(url: string): Promise<string | null> {
  let buf: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn(`[hash] download falhou HTTP ${res.status}`);
      return null;
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    log.warn("[hash] download falhou:", (err as Error).message);
    return null;
  }

  try {
    const W = 9;
    const H = 8;
    const raw = await sharp(buf)
      .grayscale()
      .resize(W, H, { fit: "fill" })
      .raw()
      .toBuffer();

    const bits: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const left = raw[y * W + x]!;
        const right = raw[y * W + x + 1]!;
        bits.push(left > right ? 1 : 0);
      }
    }
    // 64 bits -> 16 chars hex
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      const nibble = (bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!;
      hex += nibble.toString(16);
    }
    return hex;
  } catch (err) {
    log.warn("[hash] sharp falhou:", (err as Error).message);
    return null;
  }
}

// Distância de Hamming entre dois hashes hex de mesmo tamanho.
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}
