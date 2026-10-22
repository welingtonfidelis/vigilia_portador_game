/**
 * Inimigos: esqueletos do KayKit Skeletons (arma no osso da mão, animações da biblioteca do Rig_Medium)
 * e, nos Fungos, os monstros do Quaternius, que trazem as próprias animações. Crossfade nos dois.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EliteAffix, EnemyKind } from '../sim/index.ts';
import { Animator } from './animator.ts';
import { load } from './assets.ts';

interface EnemyLook {
  file: string;
  right?: string;
  left?: string;
  scale: number;
  attack: string;
  special?: string;
  /** Fase 2 do chefe (outra animação de golpe). */
  attack2?: string;
  special2?: string;
  /** Aura própria (o Senhor da Cripta, o lanterneiro). */
  aura?: number;
  /** Cor multiplicada no atlas (a ferrugem dos mineiros, o azul dos afogados, o ferro-negro do golem). */
  tint?: number;
  /** Peça presa ao osso da cabeça (o capacete de mineiro). */
  head?: string;
  /** Monstro com as animações no próprio arquivo (Quaternius): o clipe de cada papel. */
  own?: OwnClips;
  /** Altura em metros (monstros: a escala sai da medida do modelo, no lugar de `scale`). */
  height?: number;
}

interface OwnClips {
  idle: string;
  walk: string;
  hit: string;
  death: string;
  /** Ao entrar na sala e na troca de fase do chefe. */
  spawn?: string;
  taunt?: string;
}

/** Os clipes dos esqueletos, que vêm da biblioteca de animações (Rig_Medium). */
const SKELETON_CLIPS: OwnClips = {
  idle: 'Skeletons_Idle', walk: 'Skeletons_Walking', hit: 'Hit_A', death: 'Skeletons_Death',
  spawn: 'Skeletons_Awaken_Standing', taunt: 'Skeletons_Taunt_Longer',
};

const MONSTER: OwnClips = { idle: 'Idle', walk: 'Walk', hit: 'HitRecieve', death: 'Death', spawn: 'Jump', taunt: 'Yes' };

const LOOKS: Record<EnemyKind, EnemyLook> = {
  lacaio: { file: 'skeletons/Skeleton_Minion.glb', right: 'skeletons/Skeleton_Blade.gltf', scale: 1, attack: 'Melee_1H_Attack_Slice_Diagonal' },
  guerreiro: { file: 'skeletons/Skeleton_Warrior.glb', right: 'skeletons/Skeleton_Blade.gltf', left: 'skeletons/Skeleton_Shield_Small_A.gltf', scale: 1, attack: 'Melee_1H_Attack_Chop' },
  ladino: { file: 'skeletons/Skeleton_Rogue.glb', right: 'skeletons/Skeleton_Blade.gltf', scale: 0.95, attack: 'Melee_1H_Attack_Stab' },
  mago: { file: 'skeletons/Skeleton_Mage.glb', right: 'skeletons/Skeleton_Staff.gltf', scale: 1, attack: 'Ranged_Magic_Shoot' },
  capitao: { file: 'skeletons/Skeleton_Warrior.glb', right: 'skeletons/Skeleton_Axe.gltf', left: 'skeletons/Skeleton_Shield_Large_A.gltf', scale: 1.5, attack: 'Melee_1H_Attack_Chop', special: 'Melee_2H_Attack_Chop' },
  senhor: {
    file: 'skeletons/Skeleton_Mage.glb', right: 'skeletons/Skeleton_Staff.gltf', scale: 1.6, attack: 'Ranged_Magic_Spellcasting',
    special: 'Ranged_Magic_Summon', attack2: 'Melee_2H_Attack_Slice', special2: 'Melee_2H_Attack_Chop', aura: 0x9b6bff,
  },
  // Ato II: as Minas Inundadas (recolor dos esqueletos; a cara final vem na M3.2).
  mineiro: { file: 'skeletons/Skeleton_Minion.glb', right: 'tools/pickaxe.gltf', head: 'mixed/mining_helmet.gltf', scale: 1, attack: 'Melee_1H_Attack_Chop', tint: 0xd8a27a },
  afogado: { file: 'skeletons/Skeleton_Rogue.glb', right: 'skeletons/Skeleton_Blade.gltf', scale: 0.95, attack: 'Melee_1H_Attack_Stab', tint: 0x86c2c4 },
  golem: { file: 'skeletons/Skeleton_Warrior.glb', right: 'weapons/hammer_B.gltf', scale: 1.5, attack: 'Melee_2H_Attack_Chop', tint: 0xa8b2bf },
  lanterneiro: { file: 'skeletons/Skeleton_Mage.glb', right: 'tools/lantern.gltf', scale: 1, attack: 'Ranged_Magic_Shoot', tint: 0xc9b98a, aura: 0xffc27a },
  capataz: {
    file: 'skeletons/Skeleton_Warrior.glb', right: 'weapons/hammer_A.gltf', head: 'mixed/mining_helmet.gltf', scale: 1.6,
    attack: 'Melee_1H_Attack_Chop', special: 'Melee_2H_Attack_Chop', tint: 0xc0906a,
  },
  couraca: {
    file: 'skeletons/Skeleton_Warrior.glb', right: 'skeletons/Skeleton_Axe.gltf', left: 'skeletons/Skeleton_Shield_Large_A.gltf', scale: 2,
    attack: 'Melee_1H_Attack_Chop', special: 'Melee_2H_Attack_Chop', attack2: 'Melee_2H_Attack_Slice', tint: 0x86a0aa,
  },
  // Ato III: o Jardim de Fungos, com os monstros do Quaternius (Ultimate Monsters, CC0).
  esporento: { file: 'quaternius/Mushnub.glb', scale: 1, height: 1.6, own: MONSTER, attack: 'Bite_Front' },
  brotado: { file: 'quaternius/GreenBlob.glb', scale: 1, height: 0.9, own: MONSTER, attack: 'Bite_Front' },
  aranha: { file: 'quaternius/GreenSpikyBlob.glb', scale: 1, height: 1.15, own: MONSTER, attack: 'Bite_Front' },
  cuspidor: { file: 'quaternius/PinkSlime.glb', scale: 1, height: 1.2, own: MONSTER, attack: 'Bite_Front' },
  guardiao: { file: 'quaternius/Mushnub_Evolved.glb', scale: 1, height: 3, own: { ...MONSTER, taunt: 'Dance' }, attack: 'Bite_Front', special: 'Yes', aura: 0x8cff9a },
  mae: {
    file: 'quaternius/MushroomKing.glb', scale: 1, height: 3.6, own: { ...MONSTER, hit: 'HitReact', spawn: 'Wave', taunt: 'Wave' },
    attack: 'Punch', special: 'Weapon', attack2: 'Punch', aura: 0xc07aff,
  },
};

/** Clipes de um monstro, sem o prefixo da armadura ("CharacterArmature|Idle" vira "Idle"). */
const ownClipCache = new Map<string, Map<string, THREE.AnimationClip>>();
function ownClips(file: string, list: THREE.AnimationClip[]): Map<string, THREE.AnimationClip> {
  let m = ownClipCache.get(file);
  if (!m) ownClipCache.set(file, (m = new Map(list.map((c) => [c.name.split('|').pop()!, c]))));
  return m;
}

/**
 * Os materiais do Quaternius vêm escuros (as cores parecem ter passado duas vezes para o espaço
 * linear na conversão para GLB) e com 40% de metal, que sem mapa de ambiente sai quase preto. Cada
 * material ganha a cor pelo nome, na paleta dos Fungos, e o metal vai a zero (uma vez por arquivo,
 * nos materiais originais que os clones dividem). O chapéu do rei-cogumelo é violeta, para a Mãe-Bolor.
 */
const MONSTER_COLORS: Record<string, number> = {
  Green_Main: 0x74b84a, Pink_Main: 0xd86a96, Pink_Secondary: 0x9c3f6c,
  MushroomKing_Main: 0xe6d2ac, MushroomKing_Secondary: 0xb8573c, Spikes: 0xd9a441, Orc_Main: 0x7da352,
  Eye_White: 0xf3f1ea, Eye_Black: 0x141414, Tongue: 0x9a3352, Teeth: 0xf1e7c9,
};
const KING_CAP = 0x8a55c8;
const matteDone = new Set<string>();
function matte(file: string, scene: THREE.Object3D): void {
  if (matteDone.has(file)) return;
  matteDone.add(file);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of [m.material].flat() as THREE.MeshStandardMaterial[]) {
      const c = file.includes('MushroomKing') && mat.name === 'MushroomKing_Secondary' ? KING_CAP : MONSTER_COLORS[mat.name];
      if (c !== undefined) mat.color.set(c);
      else mat.color.convertLinearToSRGB();
      mat.metalness = 0;
      mat.roughness = Math.max(mat.roughness, 0.75);
    }
  });
}

/** Altura de um modelo com pele, na pose de descanso (os monstros vêm em escalas diferentes). */
const heightCache = new Map<string, number>();
function modelHeight(file: string, model: THREE.Object3D): number {
  let h = heightCache.get(file);
  if (h === undefined) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.computeBoundingBox();
      box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
    heightCache.set(file, (h = Math.max(1e-3, box.max.y - box.min.y)));
  }
  return h;
}

const ELITE_COLOR: Record<EliteAffix, number> = { blindado: 0x8fb4ff, vampirico: 0xff4060, furioso: 0xff8a2a, veloz: 0x7dffb0 };

/** Para os testes: cada monstro e os clipes que o jogo pede ao arquivo dele. */
export function ownClipNeeds(): { file: string; clips: string[] }[] {
  return Object.values(LOOKS)
    .filter((l) => l.own)
    .map((l) => {
      const o = l.own!;
      const clips = [o.idle, o.walk, o.hit, o.death, o.spawn, o.taunt, l.attack, l.special, l.attack2, l.special2];
      return { file: l.file, clips: [...new Set(clips.filter((c): c is string => !!c))] };
    });
}

export function enemyFiles(): string[] {
  const s = new Set<string>();
  for (const l of Object.values(LOOKS)) {
    s.add(l.file);
    if (l.right) s.add(l.right);
    if (l.left) s.add(l.left);
    if (l.head) s.add(l.head);
  }
  return [...s];
}

export class EnemyActor {
  readonly root = new THREE.Group();
  animator!: Animator;
  /** Posição desenhada (persegue o alvo vindo do estado). */
  readonly pos = new THREE.Vector3();
  readonly kind: EnemyKind;
  diedAt = -1;
  /** Onde o corpo fica depois de cair (longe dos outros corpos); null enquanto vivo. */
  restAt: THREE.Vector3 | null = null;
  private look: EnemyLook;
  private elite: EliteAffix | null;
  private names: OwnClips;

  constructor(kind: EnemyKind, elite: EliteAffix | null) {
    this.kind = kind;
    this.elite = elite;
    this.look = LOOKS[kind];
    this.names = this.look.own ?? SKELETON_CLIPS;
  }

  async init(clips: Map<string, THREE.AnimationClip>): Promise<void> {
    const g = await load(this.look.file);
    if (this.look.own) matte(this.look.file, g.scene);
    const model = cloneSkinned(g.scene);
    if (this.look.own) {
      clips = ownClips(this.look.file, g.animations);
      model.scale.setScalar(this.look.height! / modelHeight(this.look.file, model));
    } else {
      model.scale.setScalar(this.look.scale);
    }
    const bones = new Map<string, THREE.Object3D>();
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    // O capitão usa o elmo; os guerreiros comuns, não (assim o elmo de osso é troféu do chefe).
    if (this.kind === 'guerreiro' || this.kind === 'golem' || this.look.head) model.getObjectByName('Skeleton_Warrior_Helmet')?.removeFromParent();
    if (this.look.tint) {
      const tint = new THREE.Color(this.look.tint);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(tint);
        m.material = mat;
      });
    }
    if (this.look.head) {
      const helmet = (await load(this.look.head)).scene.clone();
      bones.get('head')?.add(helmet);
    }
    for (const [side, file] of [['handslot.r', this.look.right], ['handslot.l', this.look.left]] as const) {
      if (!file) continue;
      const w = await load(file);
      bones.get(THREE.PropertyBinding.sanitizeNodeName(side))?.add(w.scene.clone());
    }
    if (this.elite) {
      const color = ELITE_COLOR[this.elite];
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = 0.35;
        m.material = mat;
      });
      const light = new THREE.PointLight(color, 1.5, 3, 2);
      light.position.set(0, 1.4, 0);
      this.root.add(light);
    }
    if (this.look.aura) {
      const light = new THREE.PointLight(this.look.aura, 3, 5, 1.8);
      light.position.set(0, 2.2, 0);
      this.root.add(light);
    }
    this.root.add(model);
    this.animator = new Animator(model, clips);
    if (this.names.spawn) this.animator.play({ name: this.names.spawn, duration: 1.2, fade: 0 });
    this.animator.loop(this.names.idle);
  }

  /** Laço de base: parado ou andando para o lugar dele. */
  move(walking: boolean, rate: number): void {
    this.animator?.loop(walking ? this.names.walk : this.names.idle, rate);
  }

  attack(special: boolean, duration: number, phase = 1): void {
    const l = this.look;
    const normal = phase === 2 && l.attack2 ? l.attack2 : l.attack;
    const strong = phase === 2 && l.special2 ? l.special2 : l.special;
    this.animator?.play({ name: special && strong ? strong : normal, duration });
  }

  /** Troca de fase do chefe: grita. */
  taunt(): void {
    if (this.names.taunt) this.animator?.play({ name: this.names.taunt, duration: 1.5, fade: 0.1 });
  }

  /** Erguido dos mortos pelo Senhor. */
  rise(): void {
    if (!this.animator) return;
    this.restAt = null;
    this.animator.revive();
    this.animator.play({ name: 'Skeletons_Death_Resurrect', duration: 2, fade: 0.05 });
  }

  hit(): void {
    if (this.animator && !this.animator.busy) this.animator.play({ name: this.names.hit, duration: 0.45 });
  }

  die(): void {
    this.animator?.die(this.names.death);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && this.elite) (m.material as THREE.Material).dispose();
    });
  }
}
