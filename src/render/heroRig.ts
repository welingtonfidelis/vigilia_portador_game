/**
 * Herói montado por partes: um Rig_Medium só (clonado do cavaleiro, sem malhas), e cada encaixe
 * pendura malhas dos aventureiros nesse esqueleto ou peças rígidas nos ossos. Um mixer anima tudo.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASES, tierBand } from '../sim/index.ts';
import type { HeadId, Item, Slot } from '../sim/index.ts';
import { Animator } from './animator.ts';
import { bandMaterial, legendaryMaterial, load, releaseLegendary } from './assets.ts';
import { BARE_LEGS, BARE_TORSO, BASE_VISUALS, DONOR_FILES, HEAD_VISUALS, PREFIX } from './visuals.ts';
import type { RigidVisual, SkinnedVisual } from './visuals.ts';

type Equip = Partial<Record<Slot, Item>>;

interface Piece {
  objects: THREE.Object3D[];
  materials: THREE.Material[];
  light: THREE.PointLight | null;
}

export class HeroRig {
  readonly root = new THREE.Group();
  private rig!: THREE.Object3D;
  private bones = new Map<string, THREE.Bone>();
  /** Um esqueleto por ordem de ossos (todos os aventureiros têm a mesma). */
  private skeletons = new Map<string, THREE.Skeleton>();
  private pieces = new Map<string, Piece>();
  private signature = '';
  animator!: Animator;

  async init(clips: Map<string, THREE.AnimationClip>): Promise<void> {
    const knight = await load(DONOR_FILES.Knight);
    const scene = cloneSkinned(knight.scene);
    // Fica só a hierarquia de ossos; as malhas vêm dos encaixes.
    const meshes: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
    });
    for (const m of meshes) m.removeFromParent();
    this.rig = scene;
    this.root.add(scene);
    this.animator = new Animator(scene, clips);
  }

  /** O GLTFLoader limpa os nomes (handslot.r vira handslotr); aqui aceita os dois. */
  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(THREE.PropertyBinding.sanitizeNodeName(name));
  }

  private skeletonFor(src: THREE.SkinnedMesh): THREE.Skeleton {
    const key = src.skeleton.bones.map((b) => b.name).join(',');
    let s = this.skeletons.get(key);
    if (!s) {
      s = new THREE.Skeleton(src.skeleton.bones.map((b) => this.bone(b.name)!), src.skeleton.boneInverses);
      this.skeletons.set(key, s);
    }
    return s;
  }

  private async skinned(v: SkinnedVisual, band: number, legend: boolean, piece: Piece): Promise<void> {
    const donor = await load(DONOR_FILES[v.donor]);
    const holder = this.rig.getObjectByName('Rig_Medium') ?? this.rig;
    for (const part of v.parts) {
      const src = donor.scene.getObjectByName(`${PREFIX[v.donor]}_${part}`) as THREE.SkinnedMesh | undefined;
      if (!src?.isSkinnedMesh) continue;
      const base = src.material as THREE.MeshStandardMaterial;
      let mat = bandMaterial(base, band);
      if (legend) {
        mat = legendaryMaterial(mat);
        piece.materials.push(mat);
      }
      const mesh = new THREE.SkinnedMesh(src.geometry, mat);
      mesh.name = src.name;
      mesh.position.copy(src.position);
      mesh.quaternion.copy(src.quaternion);
      mesh.scale.copy(src.scale);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      holder.add(mesh);
      mesh.bind(this.skeletonFor(src), src.bindMatrix);
      piece.objects.push(mesh);
    }
  }

  private async rigid(v: RigidVisual, band: number, legend: boolean, piece: Piece): Promise<void> {
    const g = await load(v.file);
    const bone = this.bone(v.bone);
    if (!bone) return;
    let obj: THREE.Object3D;
    if (v.node) {
      const src = g.scene.getObjectByName(v.node);
      if (!src) return;
      obj = src.clone();
      obj.position.copy(src.position);
      obj.quaternion.copy(src.quaternion);
    } else {
      obj = g.scene.clone();
    }
    if (v.scale) obj.scale.setScalar(v.scale);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      let mat = bandMaterial(m.material as THREE.MeshStandardMaterial, band);
      if (legend) {
        mat = legendaryMaterial(mat);
        piece.materials.push(mat);
      }
      m.material = mat;
    });
    bone.add(obj);
    piece.objects.push(obj);
    if (legend && v.bone === 'handslot.r') {
      const light = new THREE.PointLight(0xffa040, 2.2, 3.5, 1.6);
      light.position.set(0, 0.7, 0);
      obj.add(light);
      piece.light = light;
    }
  }

  private clear(key: string): void {
    const p = this.pieces.get(key);
    if (!p) return;
    for (const o of p.objects) o.removeFromParent();
    for (const m of p.materials) releaseLegendary(m);
    p.light?.removeFromParent();
    this.pieces.delete(key);
  }

  /** Troca só os encaixes que mudaram. */
  async setEquip(head: HeadId, equip: Equip): Promise<void> {
    const want = new Map<string, { sig: string; build: (p: Piece) => Promise<void> }>();
    const add = (key: string, v: SkinnedVisual | RigidVisual | null, item: Item | undefined) => {
      if (!v) return;
      const band = item ? tierBand(item.tier) : 0;
      const legend = !!item?.legend;
      const sig = `${key}:${item?.base ?? 'nu'}:${band}:${legend}`;
      want.set(key, {
        sig,
        build: (p) => (v.kind === 'skinned' ? this.skinned(v, band, legend, p) : this.rigid(v, band, legend, p)),
      });
    };
    add('cabeca', HEAD_VISUALS[head], undefined);
    add('peitoral', equip.peitoral ? BASE_VISUALS[equip.peitoral.base] ?? null : BARE_TORSO, equip.peitoral);
    add('perneiras', equip.perneiras ? BASE_VISUALS[equip.perneiras.base] ?? null : BARE_LEGS, equip.perneiras);
    for (const slot of ['arma', 'secundaria', 'elmo', 'capa'] as Slot[]) {
      const item = equip[slot];
      if (item && BASES[item.base]) add(slot, BASE_VISUALS[item.base] ?? null, item);
    }
    const sig = [...want.values()].map((x) => x.sig).join('|');
    if (sig === this.signature) return;
    this.signature = sig;
    for (const key of [...this.pieces.keys()]) {
      const p = this.pieces.get(key) as Piece & { sig?: string };
      if (want.get(key)?.sig !== p.sig) this.clear(key);
    }
    for (const [key, w] of want) {
      if (this.pieces.has(key)) continue;
      const piece: Piece & { sig?: string } = { objects: [], materials: [], light: null, sig: w.sig };
      this.pieces.set(key, piece);
      await w.build(piece);
    }
  }

  private queue: Promise<void> = Promise.resolve();
  private wanted = '';

  /** Pede uma troca; as trocas rodam em fila (uma por vez), sempre para o pedido mais recente. */
  request(head: HeadId, equip: Equip): void {
    const key = JSON.stringify([head, Object.entries(equip).map(([k, i]) => [k, i?.base, i?.tier, i?.legend])]);
    if (key === this.wanted) return;
    this.wanted = key;
    const snapshot = { ...equip };
    this.queue = this.queue.then(() => (this.wanted === key ? this.setEquip(head, snapshot) : undefined)).catch((e) => console.error(e));
  }
}
