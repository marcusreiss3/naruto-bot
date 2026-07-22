// Otimiza os fundos de public/assets/bg: reduz p/ <=1920px de largura e reencoda
// em webp q72. Os fundos aparecem a opacity .13 no site -> qualidade alta e' desperdicio.
// O PNG/JPG original vai p/ public/assets/bg/_orig (git-ignored) -> reversivel/idempotente.
//
// Uso: npm run bg   (rode depois de jogar um fundo novo na pasta)
import sharp from "sharp";
import { readdir, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public/assets/bg");
const ORIG = path.join(DIR, "_orig");
const MAXW = 1920;

await mkdir(ORIG, { recursive: true });
const files = (await readdir(DIR)).filter((f) => /\.(png|jpe?g)$/i.test(f));

for (const f of files) {
  const src = path.join(DIR, f);
  const base = f.replace(/\.(png|jpe?g)$/i, "");
  const webp = path.join(DIR, `${base}.webp`);
  const before = (await stat(src)).size;
  const out = await sharp(src)
    .resize({ width: MAXW, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  await sharp(out).toFile(webp);
  const after = (await stat(webp)).size;
  // move o original pesado p/ _orig (sai da pasta servida e do git)
  await rename(src, path.join(ORIG, f));
  console.log(`${f} -> ${base}.webp: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB`);
}
console.log(`\nOK. ${files.length} fundos. Originais em ${ORIG}`);
