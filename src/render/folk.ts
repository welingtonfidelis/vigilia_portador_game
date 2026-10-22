/**
 * Moradores na cena da vila (docs/VIGILIA-PORTADOR.md §14.3, M2.2). Cada um é montado por partes no
 * mesmo esqueleto do herói: o corpo do Ranger ou do Rogue numa malha só, com a roupa recolorida nas
 * faixas de tecido do atlas, e a cabeça de um dos rostos. Quem é cada um, o que faz e onde vem de
 * townFolk.ts (puro); aqui só se anda, anima e mostra. Nada disso entra no save.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CHICK_YARD, OUTFITS, SPOTS, activeJob, doing, doors, lifeMarks, petDoing, pets, residentLabel, residents, route, strollPoint,
} from '../game/townFolk.ts';
import type { Doing, LifeMarks, PetDoing, PetKind, Resident, Spot } from '../game/townFolk.ts';
import { heightAt } from '../game/townPlan.ts';
import type { HeadId, World } from '../sim/index.ts';
import { Animator } from './animator.ts';
import { load } from './assets.ts';
import { paletteMaterial } from './palette.ts';
import { DONOR_FILES, HEAD_VISUALS, PREFIX } from './visuals.ts';

const BODY_PARTS = ['Body', 'ArmLeft', 'ArmRight', 'LegLeft', 'LegRight'];

/** Faixas de tecido do atlas 8 × 4 de cada corpo: túnica, lenço e calça (a pele e o couro ficam). */
const CLOTH: Record<'Ranger' | 'Rogue', { tunic: string; accent: string; trousers: string }> = {
  Ranger: { tunic: '0:7', accent: '1:0', trousers: '2:3' },
  Rogue: { tunic: '1:0', accent: '1:1', trousers: '2:3' },
};

interface Part {
  geo: THREE.BufferGeometry;
  /** A mesma malha simplificada (uns 22% dos triângulos) para a vista da ilha, de longe. */
  low: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  bindMatrix: THREE.Matrix4;
  bones: string[];
  inverses: THREE.Matrix4[];
  transform: THREE.Matrix4;
}

const partCache = new Map<string, Promise<Part[]>>();
const simplifier = new SimplifyModifier();

/** Versão leve de uma malha com esqueleto: o meshoptimizer só junta vértices que já existem, então os pesos dos ossos ficam. */
async function lighter(geo: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  if (!geo.index) return geo;
  const low = await simplifier.modify(geo, Math.floor(geo.attributes.position!.count * 0.78));
  low.computeBoundingSphere();
  return low;
}

/**
 * As malhas de um doador juntas numa só quando dividem esqueleto, bind e posição (é o caso do
 * KayKit); senão, uma malha por parte.
 */
function parts(donor: keyof typeof PREFIX, names: string[]): Promise<Part[]> {
  const key = `${donor}:${names.join(',')}`;
  let p = partCache.get(key);
  if (!p) {
    p = load(DONOR_FILES[donor]).then(async (g) => {
      const src = names
        .map((n) => g.scene.getObjectByName(`${PREFIX[donor]}_${n}`) as THREE.SkinnedMesh | undefined)
        .filter((m): m is THREE.SkinnedMesh => !!m?.isSkinnedMesh);
      const one = (m: THREE.SkinnedMesh): Part => ({
        geo: m.geometry, low: m.geometry, material: m.material as THREE.MeshStandardMaterial, bindMatrix: m.bindMatrix,
        bones: m.skeleton.bones.map((b) => b.name), inverses: m.skeleton.boneInverses, transform: m.matrix.clone(),
      });
      const first = src[0]!;
      const sameRig = src.every((m) => m.skeleton.bones.map((b) => b.name).join() === first.skeleton.bones.map((b) => b.name).join()
        && m.bindMatrix.equals(first.bindMatrix) && m.matrix.equals(first.matrix));
      let out: Part[];
      if (!sameRig || src.length === 1) out = src.map(one);
      else {
        const geos = src.map((m) => {
          const geo = m.geometry.clone();
          for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(a)) geo.deleteAttribute(a);
          return geo;
        });
        const merged = mergeGeometries(geos, false);
        out = merged ? [{ ...one(first), geo: merged }] : src.map(one);
      }
      for (const part of out) part.low = await lighter(part.geo);
      return out;
    });
    partCache.set(key, p);
  }
  return p;
}

function outfitMaterial(base: THREE.MeshStandardMaterial, donor: 'Ranger' | 'Rogue', outfit: number): THREE.MeshStandardMaterial {
  const o = OUTFITS[outfit]!, c = CLOTH[donor];
  return paletteMaterial(base, `adventurers:${donor}:roupa${outfit}`, { grid: [8, 4], remap: { [c.tunic]: o.tunic, [c.accent]: o.accent, [c.trousers]: o.trousers } });
}

type Prop = 'martelo' | 'machado' | 'violao' | 'caixa';
const PROP_FILES: Record<Prop, { file: string; bone: string; scale: number; pos?: [number, number, number]; rot?: [number, number, number] }> = {
  martelo: { file: 'tools/hammer.gltf', bone: 'handslot.r', scale: 1 },
  machado: { file: 'tools/axe.gltf', bone: 'handslot.r', scale: 1 },
  violao: { file: 'mixed/guitar_A.gltf', bone: 'chest', scale: 1.15, pos: [0.05, -0.2, 0.34], rot: [0.1, 0, -1.2] },
  caixa: { file: 'kenney-survival/box.glb', bone: 'chest', scale: 2.6, pos: [0, -0.35, 0.42] },
};

class Villager {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  animator!: Animator;
  visible = false;
  private bones = new Map<string, THREE.Bone>();
  private full: THREE.Object3D[] = [];
  private low: THREE.Object3D[] = [];
  private far = true;
  private props = new Map<Prop, THREE.Object3D>();
  private facing = 0;
  private path: [number, number][] | null = null;
  private leg = 0;
  private arrive: (() => void) | null = null;
  private key = '';
  private waitUntil = 0;
  private anim = 'Idle_A';
  private run = false;
  private carrying = false;
  private placed = false;
  private seq = 0;
  ready = false;
  readonly res: Resident;

  constructor(res: Resident) {
    this.res = res;
  }

  async init(clips: Map<string, THREE.AnimationClip>): Promise<void> {
    const knight = await load(DONOR_FILES.Knight);
    const rig = cloneSkinned(knight.scene);
    const meshes: THREE.Object3D[] = [];
    rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
    });
    for (const m of meshes) m.removeFromParent();
    const holder = rig.getObjectByName('Rig_Medium') ?? rig;
    const r = this.res;
    const head = HEAD_VISUALS[r.head as HeadId]!;
    // A cabeça do mesmo doador do corpo entra na mesma malha (uma chamada de desenho a menos).
    const sameDonor = head.donor === r.donor;
    const groups: [keyof typeof PREFIX, string[], boolean][] = sameDonor
      ? [[r.donor, [...BODY_PARTS, ...head.parts], true]]
      : [[r.donor, BODY_PARTS, true], [head.donor, head.parts, false]];
    for (const [donor, names, body] of groups) {
      for (const p of await parts(donor, names)) {
        const mat = body ? outfitMaterial(p.material, r.donor, r.outfit) : p.material;
        const bone = (n: string) => this.bones.get(n) ?? this.bones.get(THREE.PropertyBinding.sanitizeNodeName(n))!;
        const skeleton = new THREE.Skeleton(p.bones.map(bone), p.inverses);
        // Duas versões no mesmo esqueleto: a completa (de perto) e a leve (de longe).
        for (const [geo, list] of [[p.geo, this.full], [p.low, this.low]] as const) {
          const mesh = new THREE.SkinnedMesh(geo, mat);
          p.transform.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.frustumCulled = false;
          holder.add(mesh);
          mesh.bind(skeleton, p.bindMatrix);
          list.push(mesh);
        }
      }
      this.lod(true);
    }
    if (r.child) this.root.scale.setScalar(0.62);
    this.root.add(rig);
    this.root.visible = false;
    this.animator = new Animator(rig, clips);
    this.ready = true;
  }

  /** Longe (a vista da ilha), a malha leve; perto, a completa. */
  lod(far: boolean): void {
    if (far === this.far && this.full.length && this.full[0]!.visible === !far) return;
    this.far = far;
    for (const m of this.full) m.visible = !far;
    for (const m of this.low) m.visible = far;
  }

  private async prop(name: Prop | null): Promise<void> {
    for (const [k, o] of this.props) o.visible = k === name;
    if (!name || this.props.has(name)) return;
    const def = PROP_FILES[name];
    const g = await load(def.file);
    const bone = this.bones.get(THREE.PropertyBinding.sanitizeNodeName(def.bone)) ?? this.bones.get(def.bone);
    if (!bone || this.props.has(name)) return;
    const o = g.scene.clone();
    o.scale.setScalar(def.scale);
    if (def.pos) o.position.set(...def.pos);
    if (def.rot) o.rotation.set(...def.rot);
    o.traverse((m) => ((m as THREE.Mesh).castShadow = false));
    bone.add(o);
    this.props.set(name, o);
    for (const [k, p] of this.props) p.visible = k === name;
  }

  /** Anda pela rede até o ponto e, ao chegar, chama `then`. Se estava em casa, sai pela porta. */
  private go(to: [number, number], home: Spot, then: () => void, run = false): void {
    if (!this.visible) {
      this.pos.set(home.x, heightAt(home.x, home.z), home.z);
      this.show(true);
    }
    this.path = route([this.pos.x, this.pos.z], to);
    this.leg = 1;
    this.run = run;
    this.arrive = then;
  }

  private show(on: boolean): void {
    this.visible = on;
    this.root.visible = on;
  }

  private teleport(x: number, z: number): void {
    this.pos.set(x, heightAt(x, z), z);
    this.show(true);
  }

  private standAt(spot: Spot, anim: string, prop: Prop | null): void {
    this.path = null;
    this.facing = spot.face;
    this.anim = anim;
    void this.prop(prop);
  }

  private stroll(area: 'praca' | 'vila', home: Spot, run: boolean, cheer: boolean, pick: () => number): void {
    const to = strollPoint(area, pick);
    this.go(to, home, () => {
      this.anim = cheer ? (pick() < 0.5 ? 'Cheering' : 'Waving') : pick() < 0.15 && !this.res.child ? 'Waving' : this.res.child && pick() < 0.4 ? 'Jump_Full_Short' : 'Idle_A';
      this.waitUntil = this.clock + (cheer ? 4 + pick() * 5 : run ? 0.6 + pick() * 1.5 : 2 + pick() * 5);
    }, run);
  }

  private clock = 0;

  /** Decide (e replaneja quando a rotina muda) e anda. */
  update(dt: number, d: Doing, home: Spot, speed: number, pick: () => number): void {
    this.clock += dt;
    const key = d.at === 'ponto' ? `ponto:${d.spot.x},${d.spot.z}:${d.anim}` : d.at;
    if (key !== this.key) {
      this.key = key;
      this.waitUntil = 0;
      this.carrying = false;
      void this.prop(null);
      this.plan(d, home, pick);
    } else if (!this.path && this.clock >= this.waitUntil && this.waitUntil > 0) {
      this.waitUntil = 0;
      this.plan(d, home, pick);
    }
    this.placed = true;
    // Anda pelo trecho atual da rota.
    if (this.path) {
      const [tx, tz] = this.path[this.leg]!;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const gap = Math.hypot(dx, dz);
      const step = (this.run ? 3.2 : 1.5) * Math.min(2, Math.max(1, speed)) * dt;
      if (gap > 0.01) this.facing = turn(this.facing, Math.atan2(dx, dz), dt * 8);
      if (gap <= step) {
        this.pos.x = tx;
        this.pos.z = tz;
        this.leg++;
        if (this.leg >= this.path.length) {
          this.path = null;
          const then = this.arrive;
          this.arrive = null;
          then?.();
        }
      } else {
        this.pos.x += (dx / gap) * step;
        this.pos.z += (dz / gap) * step;
      }
      this.pos.y = heightAt(this.pos.x, this.pos.z);
    }
    const moving = !!this.path;
    this.animator.loop(moving ? (this.run ? 'Running_A' : this.carrying ? 'Walking_B' : 'Walking_A') : this.anim, moving ? Math.min(1.6, Math.max(1, speed)) : 1);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  private plan(d: Doing, home: Spot, pick: () => number): void {
    const first = !this.placed;
    const seq = ++this.seq;
    switch (d.at) {
      case 'casa':
        if (first || !this.visible) return this.show(false);
        this.go([home.x, home.z], home, () => this.show(false));
        return;
      case 'ponto': {
        const s = d.spot;
        const prop = d.prop ?? null;
        if (first) {
          this.teleport(s.x, s.z);
          return this.standAt(s, d.anim, prop);
        }
        this.go([s.x, s.z], home, () => seq === this.seq && this.standAt(s, d.anim, prop));
        return;
      }
      case 'carrega': {
        // Vai às caixas do carroceiro, pega uma, leva até a primeira barraca da feira e volta.
        const depot = SPOTS.deposito, stall = SPOTS.barraca[0]!;
        if (first) this.teleport(depot.x, depot.z);
        const toStall = () => {
          this.carrying = true;
          void this.prop('caixa');
          this.go([stall.x + 0.8, stall.z + 0.8], home, () => {
            this.carrying = false;
            void this.prop(null);
            this.animator.play({ name: 'Interact', duration: 1 });
            this.waitUntil = this.clock + 1.2;
            this.anim = 'Idle_A';
          });
        };
        this.go([depot.x, depot.z], home, () => {
          this.animator.play({ name: 'PickUp', duration: 1 });
          this.anim = 'Holding_A';
          this.waitUntil = 0;
          setTimeout(() => seq === this.seq && toStall(), 900);
        });
        return;
      }
      case 'passeio':
      case 'festa': {
        const area = d.at === 'festa' ? 'praca' : d.area;
        if (first) {
          const [x, z] = strollPoint(area, pick);
          this.teleport(x, z);
        }
        this.stroll(area, home, d.at === 'passeio' && d.run, d.at === 'festa', pick);
        return;
      }
    }
  }
}

/** Bichos de casa (Kenney Cube Pets): tamanho, passo, nome e o arquivo de cada um. */
const PET_DEFS: Record<PetKind, { file: string; scale: number; walk: number; run: number; name: string }> = {
  cachorro: { file: 'kenney-cube-pets/animal-dog.glb', scale: 0.42, walk: 1.5, run: 3.6, name: 'Pipoca, o cachorro' },
  gato: { file: 'kenney-cube-pets/animal-cat.glb', scale: 0.32, walk: 1.1, run: 2.6, name: 'Bigode, o gato' },
  pintinho: { file: 'kenney-cube-pets/animal-chick.glb', scale: 0.22, walk: 0.7, run: 1.4, name: 'Pitoco, o pintinho' },
};

/** Um bicho: anda pela rede (o pintinho só no cercadinho) e toca as animações do próprio glb. */
class Pet {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly kind: PetKind;
  visible = false;
  ready = false;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private path: [number, number][] | null = null;
  private leg = 0;
  private run = false;
  private arrive: (() => void) | null = null;
  private key = '';
  private anim = 'idle';
  private waitUntil = 0;
  private clock = 0;
  private placed = false;
  private facing = 0;

  constructor(kind: PetKind) {
    this.kind = kind;
  }

  async init(): Promise<void> {
    const def = PET_DEFS[this.kind];
    const g = await load(def.file);
    const obj = g.scene.clone();
    obj.scale.setScalar(def.scale);
    obj.traverse((o) => ((o as THREE.Mesh).castShadow = false));
    this.root.add(obj);
    this.root.visible = false;
    this.mixer = new THREE.AnimationMixer(obj);
    for (const clip of g.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.ready = true;
  }

  private play(name: string): void {
    const a = this.actions.get(name) ?? this.actions.get('idle');
    if (!a || a === this.current) return;
    a.reset().play();
    if (this.current) this.current.crossFadeTo(a, 0.2, false);
    this.current = a;
  }

  private show(on: boolean): void {
    this.visible = on;
    this.root.visible = on;
  }

  private go(to: [number, number], from: Spot, then: () => void, run: boolean, direct = false): void {
    if (!this.visible) {
      this.pos.set(from.x, heightAt(from.x, from.z), from.z);
      this.show(true);
    }
    this.path = direct ? [[this.pos.x, this.pos.z], to] : route([this.pos.x, this.pos.z], to);
    this.leg = 1;
    this.run = run;
    this.arrive = then;
  }

  private plan(d: PetDoing, home: Spot, pick: () => number): void {
    const first = !this.placed;
    switch (d.at) {
      case 'casa':
        return this.show(false);
      case 'ponto':
        if (first || !this.visible) {
          this.pos.set(d.spot.x, heightAt(d.spot.x, d.spot.z), d.spot.z);
          this.show(true);
          this.path = null;
          this.facing = d.spot.face;
          this.anim = d.anim;
          return;
        }
        this.go([d.spot.x, d.spot.z], home, () => {
          this.facing = d.spot.face;
          this.anim = d.anim;
        }, false);
        return;
      case 'cisca': {
        // Um ponto qualquer do cercadinho; chegando, cisca (come) um tempo.
        const a = pick() * Math.PI * 2, r = pick() * CHICK_YARD.r;
        const to: [number, number] = [CHICK_YARD.x + Math.cos(a) * r, CHICK_YARD.z + Math.sin(a) * r];
        const yard = { x: CHICK_YARD.x, z: CHICK_YARD.z, face: 0 };
        if (first || !this.visible) {
          this.pos.set(to[0], 0, to[1]);
          this.show(true);
        }
        this.go(to, yard, () => {
          this.anim = pick() < 0.7 ? 'eat' : 'idle';
          this.waitUntil = this.clock + 1.5 + pick() * 3;
        }, false, true);
        return;
      }
      case 'passeio': {
        const to = strollPoint(d.area, pick);
        if (first || !this.visible) {
          this.pos.set(to[0], 0, to[1]);
          this.show(true);
        }
        this.go(to, home, () => {
          this.anim = pick() < 0.3 ? 'eat' : 'idle';
          this.waitUntil = this.clock + 2 + pick() * 5;
        }, d.run);
        return;
      }
    }
  }

  update(dt: number, d: PetDoing, home: Spot, speed: number, pick: () => number): void {
    this.clock += dt;
    const key = d.at === 'ponto' ? `ponto:${d.spot.x},${d.spot.z}` : d.at;
    if (key !== this.key) {
      this.key = key;
      this.waitUntil = 0;
      this.plan(d, home, pick);
    } else if (!this.path && this.waitUntil > 0 && this.clock >= this.waitUntil) {
      this.waitUntil = 0;
      this.plan(d, home, pick);
    }
    this.placed = true;
    if (this.path) {
      const def = PET_DEFS[this.kind];
      const [tx, tz] = this.path[this.leg]!;
      const dx = tx - this.pos.x, dz = tz - this.pos.z, gap = Math.hypot(dx, dz);
      const step = (this.run ? def.run : def.walk) * Math.min(2, Math.max(1, speed)) * dt;
      if (gap > 0.01) this.facing = turn(this.facing, Math.atan2(dx, dz), dt * 8);
      if (gap <= step) {
        this.pos.x = tx;
        this.pos.z = tz;
        if (++this.leg >= this.path.length) {
          this.path = null;
          const then = this.arrive;
          this.arrive = null;
          then?.();
        }
      } else {
        this.pos.x += (dx / gap) * step;
        this.pos.z += (dz / gap) * step;
      }
      this.pos.y = heightAt(this.pos.x, this.pos.z);
    }
    this.play(this.path ? (this.run ? 'run' : 'walk') : this.anim);
    this.mixer.update(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  get label(): string {
    return PET_DEFS[this.kind].name;
  }
}

function turn(from: number, to: number, k: number): number {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d * Math.min(1, k);
}

export class Folk {
  readonly group = new THREE.Group();
  private villagers = new Map<number, Villager>();
  private pets = new Map<PetKind, Pet>();
  private clips!: Map<string, THREE.AnimationClip>;
  private blobs!: THREE.InstancedMesh;
  private cap: number;
  private marks: LifeMarks | null = null;
  private think = 0;
  private frame = 0;
  private rand = 1;

  constructor(cap: number) {
    this.cap = cap;
  }

  init(clips: Map<string, THREE.AnimationClip>): void {
    this.clips = clips;
    // Sombra redonda embaixo de cada um (mais barata que a sombra de verdade dos bonecos).
    const blob = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), this.cap + 3);
    this.blobs.frustumCulled = false;
    this.group.add(this.blobs);
  }

  private pick = (): number => {
    this.rand = (this.rand * 1664525 + 1013904223) >>> 0;
    return this.rand / 4294967296;
  };

  /** Cria quem chegou (e tira quem saiu) conforme os moradores do núcleo. */
  sync(w: World): void {
    const list = residents(w, this.cap);
    for (const r of list) {
      if (this.villagers.has(r.n)) continue;
      const v = new Villager(r);
      this.villagers.set(r.n, v);
      void v.init(this.clips).then(() => this.group.add(v.root));
    }
    for (const [n, v] of this.villagers) {
      if (n < list.length) continue;
      v.root.removeFromParent();
      this.villagers.delete(n);
    }
    // Bichos de casa (no máximo 3).
    for (const kind of pets(w)) {
      if (this.pets.has(kind)) continue;
      const p = new Pet(kind);
      this.pets.set(kind, p);
      void p.init().then(() => this.group.add(p.root));
    }
  }

  update(w: World, hour: number, dt: number, speed: number, far: boolean, stage: number): void {
    this.think -= dt;
    if (!this.marks || this.think <= 0) {
      this.marks = lifeMarks(w);
      this.think = 1;
    }
    const m = this.marks;
    const homes = doors(w);
    this.frame++;
    let k = 0;
    const mat = new THREE.Matrix4();
    for (const v of this.villagers.values()) {
      if (!v.ready) continue;
      const home = homes[v.res.n % Math.max(1, homes.length)] ?? SPOTS.bigorna;
      v.lod(far);
      v.update(dt, doing(v.res, hour, m), home, speed, this.pick);
      // De longe, a animação anda em meio ritmo (quadro sim, quadro não).
      if (!far || (this.frame + v.res.n) % 2 === 0) v.animator.update(far ? dt * 2 : dt);
      const s = v.visible ? (v.res.child ? 0.65 : 1) : 0;
      mat.compose(new THREE.Vector3(v.pos.x, v.pos.y + 0.04, v.pos.z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
      this.blobs.setMatrixAt(k++, mat);
    }
    for (const p of this.pets.values()) {
      if (!p.ready) continue;
      p.update(dt, petDoing(p.kind, hour, stage), homes[0] ?? SPOTS.bigorna, speed, this.pick);
      const s = p.visible ? (p.kind === 'pintinho' ? 0.35 : 0.55) : 0;
      mat.compose(new THREE.Vector3(p.pos.x, p.pos.y + 0.04, p.pos.z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
      this.blobs.setMatrixAt(k++, mat);
    }
    // Quem está parado no mesmo lugar abre espaço (empurrão leve entre os que estão na rua).
    const all = [...this.villagers.values()].filter((v) => v.ready && v.visible);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!.pos, b = all[j]!.pos;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.85 || d < 1e-4) continue;
        const push = ((0.85 - d) / d) * 0.5 * Math.min(1, dt * 6);
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
    for (; k < this.cap + 3; k++) this.blobs.setMatrixAt(k, mat.makeScale(0, 0, 0));
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  /** Morador sob o raio (para mostrar nome e ofício): o mais perto do raio, a até 1,1 m dele. */
  pick3d(ray: THREE.Raycaster, w: World): { label: string; target: THREE.Object3D } | null {
    let best: Villager | null = null, bd = 1.1 * 1.1;
    const c = new THREE.Vector3();
    for (const v of this.villagers.values()) {
      if (!v.visible) continue;
      c.copy(v.pos).add(new THREE.Vector3(0, v.res.child ? 0.8 : 1.2, 0));
      const d = ray.ray.distanceSqToPoint(c);
      if (d < bd) [best, bd] = [v, d];
    }
    let pet: Pet | null = null;
    for (const p of this.pets.values()) {
      if (!p.visible) continue;
      c.copy(p.pos).add(new THREE.Vector3(0, 0.4, 0));
      const d = ray.ray.distanceSqToPoint(c);
      if (d < bd) [pet, bd] = [p, d];
    }
    const petFound = pet as Pet | null;
    if (petFound) return { label: petFound.label, target: petFound.root };
    const found = best as Villager | null;
    if (!found) return null;
    return { label: residentLabel(found.res, this.marks ?? lifeMarks(w)), target: found.root };
  }

  /** Quantos estão na rua (para o medidor) e o ofício de cada um (depuração). */
  get count(): number {
    let n = 0;
    for (const v of this.villagers.values()) if (v.visible) n++;
    return n;
  }

  debugJobs(w: World): string[] {
    const m = lifeMarks(w);
    return [...this.villagers.values()].map((v) => `${residentLabel(v.res, m)} ${v.visible ? '' : '(em casa)'} ${activeJob(v.res, m)}`);
  }
}

export const FOLK_FILES = [
  ...Object.values(PET_DEFS).map((d) => d.file),
  'tools/hammer.gltf', 'tools/axe.gltf', 'mixed/guitar_A.gltf', 'kenney-survival/box.glb',
  'adventurers/Ranger.glb', 'adventurers/Rogue.glb',
];
