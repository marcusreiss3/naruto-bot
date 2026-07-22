// Redimensiona os PNG de public/assets/icons (e subpastas) para ~200px (bolinha 66px
// + modal 88px com folga retina), sobrescrevendo no lugar. O original de cada arquivo
// fica espelhado em public/assets/icons/_orig para o resize ser idempotente.
//
// Uso: npm run icons   (rode depois de jogar PNG novo na pasta ou subpasta)
import sharp from "sharp";
import { readdir, mkdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public/assets/icons");
const ORIG = path.join(DIR, "_orig");
const SIZE = 200;

// lista todos os .png recursivamente, ignorando a pasta de backup _orig
async function pngs(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full === ORIG) continue;
      out.push(...(await pngs(full)));
    } else if (/\.png$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = await pngs(DIR);
for (const src of files) {
  const rel = path.relative(DIR, src);          // ex: fogo/pavio.png
  const bak = path.join(ORIG, rel);             // ex: _orig/fogo/pavio.png
  const before = (await stat(src)).size;
  await mkdir(path.dirname(bak), { recursive: true });
  // backup do original (so na 1a vez); nas proximas, resize parte do backup
  try { await stat(bak); } catch { await copyFile(src, bak); }
  const out = await sharp(bak)
    .resize(SIZE, SIZE, { fit: "cover" })
    .png({ compressionLevel: 9, quality: 82 })
    .toBuffer();
  await sharp(out).toFile(src);
  const after = (await stat(src)).size;
  console.log(`${rel}: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB`);
}
console.log(`\nOK. ${files.length} icons. Originais em ${ORIG}`);
