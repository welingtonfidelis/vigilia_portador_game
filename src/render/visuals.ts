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

export function visualFiles(): string[] {
  const files = new Set<string>(Object.values(DONOR_FILES));
  for (const v of Object.values(BASE_VISUALS)) if (v?.kind === 'rigid') files.add(v.file);
  return [...files];
}
