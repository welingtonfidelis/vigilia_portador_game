/**
 * Recolor da paleta dos packs do Kenney: cada pack tem uma textura de 512 × 512 com uma grade de
 * 16 × 4 faixas de cor (32 × 128 px cada), e as peças só apontam para faixas. Trocar a cor de uma
 * faixa troca a cor de tudo que a usa, mantendo o degradê dela. É assim que o mesmo telhado vira
 * palha, telha ou carvão, e o arenito do castelo vira pedra cinza (docs/VIGILIA-PORTADOR.md §14.3).
 */
import * as THREE from 'three';

/** Faixa "linha:coluna" (linha 0 no alto da imagem, como o v do glTF) → cor nova. */
export type Remap = Record<string, number>;

export interface PaletteSpec {
  remap: Remap;
  /** Colunas e linhas da grade de faixas: 16 × 4 no Kenney (o padrão), 8 × 4 nos aventureiros do KayKit. */
  grid?: [number, number];
  /** Multiplica as faixas que não estão no remap (para o carvão das ruínas queimadas). */
  rest?: number;
}

const made = new Map<string, THREE.MeshStandardMaterial>();

/** Material da paleta `base` recolorida (uma vez por nome; os lotes dividem o mesmo material). */
export function paletteMaterial(base: THREE.MeshStandardMaterial, name: string, spec: PaletteSpec): THREE.MeshStandardMaterial {
  const key = `${base.uuid}:${name}`;
  const have = made.get(key);
  if (have) return have;
  const mat = base.clone();
  mat.name = `${base.name}:${name}`;
  const img = base.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (img && base.map) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    recolor(data, spec);
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = base.map.flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = base.map.wrapS;
    tex.wrapT = base.map.wrapT;
    tex.magFilter = base.map.magFilter;
    tex.minFilter = base.map.minFilter;
    mat.map = tex;
  }
  made.set(key, mat);
  return mat;
}

function recolor(data: ImageData, spec: PaletteSpec): void {
  const { width: w, height: h, data: px } = data;
  const [cols, rows] = spec.grid ?? [16, 4];
  const cw = w / cols, ch = h / rows;
  const lum = (i: number) => 0.3 * px[i]! + 0.59 * px[i + 1]! + 0.11 * px[i + 2]!;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const target = spec.remap[`${r}:${c}`];
      if (target === undefined && spec.rest === undefined) continue;
      const x0 = c * cw, y0 = r * ch;
      if (target === undefined) {
        for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
          const i = (y * w + x) * 4;
          px[i] = px[i]! * spec.rest!;
          px[i + 1] = px[i + 1]! * spec.rest!;
          px[i + 2] = px[i + 2]! * spec.rest!;
        }
        continue;
      }
      // Mantém o degradê da faixa: cada pixel leva a cor nova na proporção do brilho dele à média.
      let sum = 0;
      for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) sum += lum((y * w + x) * 4);
      const mean = Math.max(1, sum / (cw * ch));
      const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
      for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
        const i = (y * w + x) * 4;
        const f = 0.55 + 0.45 * (lum(i) / mean);
        px[i] = Math.min(255, tr * f);
        px[i + 1] = Math.min(255, tg * f);
        px[i + 2] = Math.min(255, tb * f);
      }
    }
  }
}
