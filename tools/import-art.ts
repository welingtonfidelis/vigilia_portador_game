/**
 * Copia do pack KayKit baixado (dado não confiável) só o que está em art-manifest.ts,
 * validando cada arquivo. Nada do pack é executado: os arquivos só são lidos como bytes/JSON.
 *
 *   npm run art -- [--src ~/Downloads/vigilia-portador-kaykit/packs]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { ALLOWED_EXT, MAX_BYTES, PACKS } from './art-manifest.ts';

interface Copied { path: string; bytes: number; sha256: string }

const args = process.argv.slice(2);
const srcIdx = args.indexOf('--src');
const SRC = resolve(srcIdx >= 0 && args[srcIdx + 1] ? args[srcIdx + 1]!.replace(/^~/, homedir()) : join(homedir(), 'Downloads/vigilia-portador-kaykit/packs'));
const OUT = resolve(import.meta.dirname, '../public/assets/kaykit');

const errors: string[] = [];
const copied: Copied[] = [];
/** Texturas citadas pelos .gltf, copiadas depois de cada pack (sem repetir). */
const pendingTextures: [string, string][] = [];

/** URIs externas de um .gltf (buffers e imagens); data: URIs não contam. */
function gltfUris(json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] }): string[] {
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((b) => b.uri).filter((u): u is string => !!u);
  return uris.filter((u) => !u.startsWith('data:'));
}

/** JSON do primeiro chunk de um .glb, conferindo o cabeçalho. */
function glbJson(buf: Buffer): { buffers?: { uri?: string }[]; images?: { uri?: string }[] } {
  if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error('cabeçalho glTF ausente');
  const len = buf.readUInt32LE(12);
  if (buf.toString('latin1', 16, 20) !== 'JSON') throw new Error('primeiro chunk não é JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + len));
}

/** Nome de arquivo simples; o Kenney aponta para uma subpasta (Textures/colormap.png), aceita sem "..". */
function isSimpleName(u: string): boolean {
  return /^([A-Za-z0-9_-]+\/)?[A-Za-z0-9_.-]+$/.test(u) && !u.split('/').some((part) => part.startsWith('.'));
}

function copyChecked(from: string, outDir: string, allowedSiblings: Set<string>, keepPath?: string): void {
  const name = basename(from);
  const ext = extname(name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return void errors.push(`${name}: extensão não permitida`);
  if (!existsSync(from)) return void errors.push(`${from}: não existe`);
  const st = statSync(from);
  if (!st.isFile()) return void errors.push(`${name}: não é arquivo comum`);
  if (st.size > MAX_BYTES) return void errors.push(`${name}: ${st.size} B passa do limite`);
  const buf = readFileSync(from);
  if (ext === '.png' && buf.toString('latin1', 1, 4) !== 'PNG') return void errors.push(`${name}: não é PNG`);
  if (ext === '.gltf' || ext === '.glb') {
    try {
      const json = ext === '.gltf' ? JSON.parse(buf.toString('utf8')) : glbJson(buf);
      for (const u of gltfUris(json)) {
        if (!isSimpleName(u)) {
          errors.push(`${name}: URI suspeita "${u}"`);
          continue;
        }
        // Textura citada na mesma pasta: vem junto (nome simples, .png, passa pela mesma validação).
        if (!allowedSiblings.has(u) && ext === '.gltf' && u.endsWith('.png') && !u.includes('/') && existsSync(join(dirname(from), u))) {
          allowedSiblings.add(u);
          pendingTextures.push([join(dirname(from), u), outDir]);
        } else if (!allowedSiblings.has(u)) errors.push(`${name}: URI "${u}" fora do manifesto`);
      }
    } catch (e) {
      return void errors.push(`${name}: glTF inválido (${(e as Error).message})`);
    }
  }
  const dest = keepPath ? join(outDir, keepPath) : outDir;
  mkdirSync(dest, { recursive: true });
  const to = join(dest, name);
  copyFileSync(from, to);
  copied.push({ path: to.slice(OUT.length + 1), bytes: st.size, sha256: createHash('sha256').update(buf).digest('hex') });
}

if (!existsSync(SRC)) {
  console.error(`Pasta dos packs não encontrada: ${SRC}\nBaixe os packs (docs/VIGILIA-PORTADOR.md §3.4) ou passe --src.`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
for (const pack of PACKS) {
  const outDir = join(OUT, pack.out);
  mkdirSync(outDir, { recursive: true });
  // Nomes que um .gltf deste pack pode citar: os .bin e .png listados.
  const siblings = new Set<string>();
  for (const g of pack.groups) {
    for (const f of g.files) {
      if (g.ext === '.gltf') siblings.add(`${f}.bin`);
      if (g.ext === '.png') siblings.add(g.keepPath ? `${g.keepPath}/${f}.png` : `${f}.png`);
    }
  }
  for (const g of pack.groups) {
    const base = join(SRC, pack.dir, pack.root, g.path);
    for (const f of g.files) {
      copyChecked(join(base, f + g.ext), outDir, siblings, g.keepPath);
      if (g.ext === '.gltf') copyChecked(join(base, `${f}.bin`), outDir, siblings);
    }
  }
  const seen = new Set<string>();
  for (const [from, dir] of pendingTextures.splice(0)) {
    if (seen.has(from) || existsSync(join(dir, basename(from)))) continue;
    seen.add(from);
    copyChecked(from, dir, siblings);
  }
}

const total = copied.reduce((s, c) => s + c.bytes, 0);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ source: 'KayKit (Kay Lousberg), CC0 1.0 — ver LICENSES.md', files: copied }, null, 2));
console.log(`${copied.length} arquivos, ${(total / 1024 / 1024).toFixed(2)} MB em ${OUT}`);
if (errors.length) {
  console.error(`\n${errors.length} problema(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
