/** Esqueletos inimigos: modelo do KayKit Skeletons, arma no osso da mão e animação com crossfade. */
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
}

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
};

const ELITE_COLOR: Record<EliteAffix, number> = { blindado: 0x8fb4ff, vampirico: 0xff4060, furioso: 0xff8a2a, veloz: 0x7dffb0 };

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

  constructor(kind: EnemyKind, elite: EliteAffix | null) {
    this.kind = kind;
    this.elite = elite;
    this.look = LOOKS[kind];
  }

  async init(clips: Map<string, THREE.AnimationClip>): Promise<void> {
    const g = await load(this.look.file);
    const model = cloneSkinned(g.scene);
    model.scale.setScalar(this.look.scale);
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
    this.animator.play({ name: 'Skeletons_Awaken_Standing', duration: 1.2, fade: 0 });
    this.animator.loop('Skeletons_Idle');
  }

  attack(special: boolean, duration: number, phase = 1): void {
    const l = this.look;
    const normal = phase === 2 && l.attack2 ? l.attack2 : l.attack;
    const strong = phase === 2 && l.special2 ? l.special2 : l.special;
    this.animator?.play({ name: special && strong ? strong : normal, duration });
  }

  /** Troca de fase do chefe: grita. */
  taunt(): void {
    this.animator?.play({ name: 'Skeletons_Taunt_Longer', duration: 1.5, fade: 0.1 });
  }

  /** Erguido dos mortos pelo Senhor. */
  rise(): void {
    if (!this.animator) return;
    this.restAt = null;
    this.animator.revive();
    this.animator.play({ name: 'Skeletons_Death_Resurrect', duration: 2, fade: 0.05 });
  }

  hit(): void {
    if (this.animator && !this.animator.busy) this.animator.play({ name: 'Hit_A', duration: 0.45 });
  }

  die(): void {
    this.animator?.die('Skeletons_Death');
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && this.elite) (m.material as THREE.Material).dispose();
    });
  }
}
