/**
 * Como cada base de item aparece no personagem (docs/VIGILIA-PORTADOR.md §3.3): partes dos aventureiros
 * no mesmo esqueleto (peitoral, perneiras, elmo, capa), peças rígidas presas a ossos (armas,
 * escudos, elmo de osso) e a cabeça fixa do herói.
 */
import type { HeadId } from '../sim/index.ts';

export type Donor = 'Knight' | 'Barbarian' | 'Mage' | 'Ranger' | 'Rogue' | 'Rogue_Hooded';

export const DONOR_FILES: Record<Donor, string> = {
  Knight: 'adventurers/Knight.glb',
  Barbarian: 'adventurers/Barbarian.glb',
  Mage: 'adventurers/Mage.glb',
  Ranger: 'adventurers/Ranger.glb',
  Rogue: 'adventurers/Rogue.glb',
  Rogue_Hooded: 'adventurers/Rogue_Hooded.glb',
};

/** Prefixo das malhas dentro de cada arquivo. */
export const PREFIX: Record<Donor, string> = {
  Knight: 'Knight', Barbarian: 'Barbarian', Mage: 'Mage', Ranger: 'Ranger', Rogue: 'Rogue', Rogue_Hooded: 'RogueHooded',
};

export interface SkinnedVisual {
  kind: 'skinned';
  donor: Donor;
  /** Sufixos: Body, ArmLeft… (ficam `${PREFIX}_${sufixo}`). */
  parts: string[];
}

export interface RigidVisual {
  kind: 'rigid';
  /** glTF com a peça inteira (armas, escudos) ou nó dentro de um glb (elmo de osso). */
  file: string;
  node?: string;
  bone: 'handslot.r' | 'handslot.l' | 'head';
  scale?: number;
}

export type Visual = SkinnedVisual | RigidVisual;

const torso = (donor: Donor): SkinnedVisual => ({ kind: 'skinned', donor, parts: ['Body', 'ArmLeft', 'ArmRight'] });
const legs = (donor: Donor): SkinnedVisual => ({ kind: 'skinned', donor, parts: ['LegLeft', 'LegRight'] });

export const BASE_VISUALS: Record<string, Visual | null> = {
  espada: { kind: 'rigid', file: 'adventurers/sword_1handed.gltf', bone: 'handslot.r' },
  machado: { kind: 'rigid', file: 'adventurers/axe_1handed.gltf', bone: 'handslot.r' },
  adaga: { kind: 'rigid', file: 'adventurers/dagger.gltf', bone: 'handslot.r' },
  espadao: { kind: 'rigid', file: 'adventurers/sword_2handed.gltf', bone: 'handslot.r' },
  machado_grande: { kind: 'rigid', file: 'adventurers/axe_2handed.gltf', bone: 'handslot.r' },
  // Ato II (Fantasy Weapons Bits).
  martelo: { kind: 'rigid', file: 'weapons/hammer_A.gltf', bone: 'handslot.r' },
  lanca: { kind: 'rigid', file: 'weapons/spear_A.gltf', bone: 'handslot.r' },
  alabarda: { kind: 'rigid', file: 'weapons/halberd.gltf', bone: 'handslot.r' },
  escudo_redondo: { kind: 'rigid', file: 'adventurers/shield_round.gltf', bone: 'handslot.l' },
  escudo_torre: { kind: 'rigid', file: 'adventurers/shield_square.gltf', bone: 'handslot.l' },
  escudo_espinhos: { kind: 'rigid', file: 'adventurers/shield_spikes.gltf', bone: 'handslot.l' },
  elmo_placas: { kind: 'skinned', donor: 'Knight', parts: ['Helmet'] },
  chapeu_urso: { kind: 'skinned', donor: 'Barbarian', parts: ['BearHat'] },
  chapeu_mago: { kind: 'skinned', donor: 'Mage', parts: ['Hat'] },
  elmo_osso: { kind: 'rigid', file: 'skeletons/Skeleton_Warrior.glb', node: 'Skeleton_Warrior_Helmet', bone: 'head' },
  couraca_placas: torso('Knight'),
  gibao_couro: torso('Ranger'),
  colete_ladino: torso('Rogue'),
  tunica: torso('Mage'),
  grevas_placas: legs('Knight'),
  calcas_couro: legs('Ranger'),
  botas_leves: legs('Rogue'),
  capa_cavaleiro: { kind: 'skinned', donor: 'Knight', parts: ['Cape'] },
  capa_patrulheiro: { kind: 'skinned', donor: 'Ranger', parts: ['Cape'] },
  manto: { kind: 'skinned', donor: 'Mage', parts: ['Cape'] },
  amuleto: null,
};

/**
 * A arma muda de cara com o tier (M3.2): do tier 6 em diante, as bases do Ato I usam as malhas do
 * Fantasy Weapons Bits, e algumas trocam de novo no 11 (o Ato III). A cor do metal vem da faixa do tier.
 */
const TIER_MESHES: Record<string, [number, string][]> = {
  espada: [[6, 'weapons/sword_B.gltf'], [11, 'weapons/sword_C.gltf']],
  espadao: [[6, 'weapons/sword_E.gltf']],
  machado: [[6, 'weapons/axe_A.gltf'], [11, 'weapons/axe_C.gltf']],
  machado_grande: [[6, 'weapons/axe_B.gltf']],
  adaga: [[6, 'weapons/dagger_A.gltf'], [11, 'weapons/dagger_B.gltf']],
  escudo_redondo: [[6, 'weapons/shield_B.gltf']],
  escudo_espinhos: [[6, 'weapons/shield_C.gltf']],
};

/**
 * Armas de um gume só que vêm com o gume em −X: no osso da mão, ele fica para trás, e no golpe de
 * corte ele aponta para cima. Meia volta no cabo põe o gume para a frente (e para baixo no corte).
 * Medido no glTF e no meio do Melee_1H_Attack_Chop.
 */
export const GRIP_TURN: Record<string, number> = {
  'adventurers/axe_1handed.gltf': Math.PI,
  'weapons/axe_C.gltf': Math.PI,
  'weapons/halberd.gltf': Math.PI,
  // O machado do lenhador, no Chopping.
  'tools/axe.gltf': Math.PI,
};

/** O visual de uma peça: o da base, com a malha do tier quando houver. */
export function itemVisual(base: string, tier: number): Visual | null {
  const v = BASE_VISUALS[base] ?? null;
  const steps = TIER_MESHES[base];
  if (!v || v.kind !== 'rigid' || !steps) return v;
  let file = v.file;
  for (const [t, f] of steps) if (tier >= t) file = f;
  return file === v.file ? v : { ...v, file };
}

/** Sem peitoral ou perneiras, o corpo é o do bárbaro (peito nu, calça de pele). */
export const BARE_TORSO = torso('Barbarian');
export const BARE_LEGS = legs('Barbarian');

export const HEAD_VISUALS: Record<HeadId, SkinnedVisual> = {
  Knight: { kind: 'skinned', donor: 'Knight', parts: ['Head'] },
  Barbarian: { kind: 'skinned', donor: 'Barbarian', parts: ['Head'] },
  Mage: { kind: 'skinned', donor: 'Mage', parts: ['Head'] },
  Ranger: { kind: 'skinned', donor: 'Ranger', parts: ['Head'] },
  Rogue: { kind: 'skinned', donor: 'Rogue', parts: ['Head'] },
  Rogue_Hooded: { kind: 'skinned', donor: 'Rogue_Hooded', parts: ['Head', 'Mask'] },
};

/**
 * Ajuste de cada elmo por cabeça, medido na grade 6 × 4 (docs/img/cabelo-elmo.png): escala em
 * volta do osso da cabeça e altura extra, para o cabelo e o capuz não atravessarem.
 */
export interface HelmFit {
  scale: number;
  y: number;
}

export const HELM_FIT: Record<string, Partial<Record<HeadId, HelmFit>>> = {
  elmo_placas: { Ranger: { scale: 1.08, y: 0.02 }, Rogue: { scale: 1.08, y: 0.02 }, Mage: { scale: 1.04, y: 0 }, Rogue_Hooded: { scale: 1.08, y: 0.01 } },
  chapeu_urso: { Knight: { scale: 1.06, y: 0.03 }, Rogue_Hooded: { scale: 1.05, y: 0 } },
  chapeu_mago: { Knight: { scale: 1.06, y: 0.05 }, Rogue_Hooded: { scale: 1.04, y: 0.02 } },
  elmo_osso: {
    Knight: { scale: 1.14, y: 0.07 }, Ranger: { scale: 1.06, y: 0.02 }, Rogue: { scale: 1.06, y: 0.02 }, Mage: { scale: 1.06, y: 0.02 },
    Rogue_Hooded: { scale: 1.08, y: 0.02 },
  },
};

export function visualFiles(): string[] {
  const files = new Set<string>(Object.values(DONOR_FILES));
  for (const v of Object.values(BASE_VISUALS)) if (v?.kind === 'rigid') files.add(v.file);
  for (const steps of Object.values(TIER_MESHES)) for (const [, f] of steps) files.add(f);
  return [...files];
}
