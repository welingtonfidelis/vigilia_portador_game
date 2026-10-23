import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enemyFiles } from '../src/render/actors.ts';
import { FOLK_FILES } from '../src/render/folk.ts';
import { GRIP_TURN, visualFiles } from '../src/render/visuals.ts';

/** Até onde a malha vai em x (o gume de um machado de um lado só fica num dos lados). */
function xBounds(file: string): [number, number] {
  const g = JSON.parse(readFileSync(`public/assets/kaykit/${file}`, 'utf8')) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  let lo = Infinity, hi = -Infinity;
  for (const m of g.meshes) {
    for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION]!;
      lo = Math.min(lo, a.min[0]!);
      hi = Math.max(hi, a.max[0]!);
    }
  }
  return [lo, hi];
}

describe('armas na mão', () => {
  // As peças de corte e de bater presas na mão (o cajado e a lanterna não têm gume).
  const held = [...new Set([...visualFiles(), ...enemyFiles(), ...FOLK_FILES])].filter((f) => f.endsWith('.gltf') && /axe|halberd|sword|dagger|blade|pick|hammer|spear/i.test(f));

  it('as de um gume só (o gume em −X) giram meia volta no cabo; as simétricas, não', () => {
    const oneSided: string[] = [];
    for (const f of held) {
      const [lo, hi] = xBounds(f);
      const single = -lo > 1.5 * Math.max(hi, 0.05);
      if (single) oneSided.push(f);
      expect(GRIP_TURN[f] ?? 0, f).toBe(single ? Math.PI : 0);
    }
    expect(oneSided.sort()).toEqual(['adventurers/axe_1handed.gltf', 'tools/axe.gltf', 'weapons/axe_C.gltf', 'weapons/halberd.gltf']);
  });
});
