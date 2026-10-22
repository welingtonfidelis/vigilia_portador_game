/**
 * Cena 3D: só lê o estado e os eventos da simulação e anima. Nada aqui decide a luta.
 */
import * as THREE from 'three';
import { BALANCE, BASES } from '../sim/index.ts';
import type { Enemy, SimEvent, World } from '../sim/index.ts';
import { EnemyActor, enemyFiles } from './actors.ts';
import { clips, load, pulseLegendary } from './assets.ts';
import { buildRoom, DUNGEON_PIECES, ENEMY_DOOR, HERO_DOOR } from './dungeon.ts';
import type { BuiltRoom } from './dungeon.ts';
import { HeroRig } from './heroRig.ts';
import { PerfMeter } from './perf.ts';
import { visualFiles } from './visuals.ts';

/** Vagas do anel, girado para a direita da porta: assim o herói aparece de três quartos para a câmera. */
const RING_ANGLES = [-0.6, 0.55, 1.7];
const BACK_SPOTS = [new THREE.Vector3(-5, 0, -4.4), new THREE.Vector3(5.4, 0, -3), new THREE.Vector3(-5.6, 0, 0.6), new THREE.Vector3(5.8, 0, 1.2)];

export interface Quality {
  dpr: number;
  shadows: boolean;
  antialias: boolean;
}

export function pickQuality(): Quality {
  const params = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (params.get('q') === 'low') return { dpr: 1, shadows: false, antialias: false };
  return { dpr: Math.min(devicePixelRatio, coarse ? 1.75 : 2), shadows: true, antialias: !coarse };
}

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  born: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  readonly hero = new HeroRig();
  readonly perf: PerfMeter;
  private enemies = new Map<number, EnemyActor>();
  private room: BuiltRoom | null = null;
  private roomKey = '';
  private building = false;
  private heroClips = new Map<string, THREE.AnimationClip>();
  private enemyClips = new Map<string, THREE.AnimationClip>();
  private focus = new THREE.Vector3();
  private heroPos = new THREE.Vector3();
  private heroFacing = 0;
  private time = 0;
  private floaters: Floater[] = [];
  private swing = 0;
  private sun: THREE.DirectionalLight;
  ready = false;

  private canvas: HTMLCanvasElement;
  private overlay: HTMLElement;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, quality: Quality) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(quality.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x0a0c11);
    this.scene.fog = new THREE.Fog(0x0a0c11, 20, 44);
    this.scene.add(new THREE.HemisphereLight(0x8a9cc4, 0x2a1d14, 1.1));
    this.sun = new THREE.DirectionalLight(0xc8d6ff, 1.6);
    this.sun.position.set(-7, 16, 9);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.hero.root);
    this.perf = new PerfMeter(this.renderer);
  }

  /** Carrega tudo que o protótipo usa (cerca de 8 MB) antes de mostrar a cena. */
  async init(onProgress?: (done: number, total: number) => void): Promise<void> {
    const files = [...visualFiles(), ...enemyFiles(), ...DUNGEON_PIECES];
    const anims = ['animations/Rig_Medium_General.glb', 'animations/Rig_Medium_MovementBasic.glb', 'animations/Rig_Medium_CombatMelee.glb', 'animations/Rig_Medium_Special.glb'];
    const total = files.length + anims.length;
    let done = 0;
    const tick = () => onProgress?.(++done, total);
    const sets = await Promise.all(anims.map((a) => clips(a).then((c) => (tick(), c))));
    await Promise.all(files.map((f) => load(f).then(tick)));
    for (const set of sets) for (const [k, v] of set) {
      this.heroClips.set(k, v);
      this.enemyClips.set(k, v);
    }
    await this.hero.init(this.heroClips);
    this.ready = true;
  }

  private size = { w: 1, h: 1 };
  private inset = { x: 0, y: 0 };
  private insetNow = { x: 0, y: 0 };

  resize(w: number, h: number): void {
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Painel aberto: desloca a imagem para o herói não ficar atrás dele (x à direita, y embaixo, em px). */
  setInset(x: number, y: number, closeUp = false): void {
    this.inset = { x, y };
    this.closeUp = closeUp;
  }

  /** Tela de equipamento: a câmera chega perto do herói. */
  private closeUp = false;
  private zoom = 1;

  private applyInset(dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.insetNow.x += (this.inset.x - this.insetNow.x) * k;
    this.insetNow.y += (this.inset.y - this.insetNow.y) * k;
    const { w, h } = this.size;
    if (Math.abs(this.insetNow.x) < 0.5 && Math.abs(this.insetNow.y) < 0.5) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(w, h, this.insetNow.x / 2, this.insetNow.y / 2, w, h);
  }

  private wantedRoom(w: World): { key: string; kind: Parameters<typeof buildRoom>[1]; look: number; remains: boolean } {
    if (w.room && (w.phase === 'sala' || w.phase === 'voltando')) {
      const remains = w.remains.some((r) => r.floor === w.room!.floor && r.room === w.room!.index);
      return { key: `${w.room.floor}:${w.room.index}:${w.room.look}:${remains}`, kind: w.room.kind, look: w.room.look, remains };
    }
    return { key: 'vila', kind: 'vila', look: 7, remains: false };
  }

  private async swapRoom(w: World): Promise<void> {
    const want = this.wantedRoom(w);
    if (want.key === this.roomKey || this.building) return;
    this.building = true;
    const built = await buildRoom(want.look, want.kind, want.remains);
    this.room?.group.removeFromParent();
    for (const a of this.enemies.values()) a.dispose();
    this.enemies.clear();
    this.room = built;
    this.scene.add(built.group);
    this.roomKey = want.key;
    this.building = false;
  }

  private ringPos(e: Enemy): THREE.Vector3 {
    const big = e.kind === 'capitao';
    const a = big ? (RING_ANGLES[e.slot]! + RING_ANGLES[e.slot + 1]!) / 2 : RING_ANGLES[e.slot]!;
    const r = big ? 3.0 : 2.35;
    return new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r).add(this.heroPos);
  }

  private queuePos(i: number): THREE.Vector3 {
    return new THREE.Vector3(ENEMY_DOOR.x + ((i % 3) - 1) * 1.4, 0, ENEMY_DOOR.z + 1.6 + Math.floor(i / 3) * 1.3);
  }

  private enemyTarget(w: World, e: Enemy, queueIndex: number, backIndex: number): THREE.Vector3 {
    if (e.state === 'anel' || e.state === 'chegando') return this.ringPos(e);
    if (e.state === 'fundo') return BACK_SPOTS[backIndex % BACK_SPOTS.length]!.clone();
    if (e.state === 'fila') return this.queuePos(queueIndex);
    void w;
    return new THREE.Vector3();
  }

  private float(text: string, pos: THREE.Vector3, cls: string): void {
    if (this.floaters.length > 24) this.floaters.shift()?.el.remove();
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floaters.push({ el, pos: pos.clone().add(new THREE.Vector3(0, 2.6, 0)), born: this.time });
  }

  private heroAttack(w: World, ev: Extract<SimEvent, { t: 'golpe' }>, speed: number): void {
    const dur = Math.max(0.25, (ev.end - ev.tick) / BALANCE.ticksPerSecond / speed);
    const weapon = w.hero.equip.arma ? BASES[w.hero.equip.arma.base] : undefined;
    const two = weapon?.hands === 2;
    let name: string;
    if (ev.skill === 'golpe_amplo') name = two ? 'Melee_2H_Attack_Spinning' : 'Melee_1H_Attack_Slice_Horizontal';
    else if (ev.skill === 'investida') name = 'Melee_1H_Attack_Jump_Chop';
    else if (ev.skill === 'segundo_folego') name = 'Use_Item';
    else if (ev.skill === 'grito') name = 'Melee_Block_Attack';
    else if (weapon?.id === 'adaga') name = 'Melee_1H_Attack_Stab';
    else if (two) name = this.swing++ % 2 ? 'Melee_2H_Attack_Slice' : 'Melee_2H_Attack_Chop';
    else name = (['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Attack_Slice_Horizontal'] as const)[this.swing++ % 3]!;
    this.hero.animator.play({ name, duration: dur });
  }

  private onEvents(w: World, events: SimEvent[], speed: number): void {
    for (const ev of events) {
      const actor = 'enemy' in ev ? this.enemies.get(ev.enemy) : 'target' in ev ? this.enemies.get(ev.target) : undefined;
      switch (ev.t) {
        case 'golpe':
          this.heroAttack(w, ev, speed);
          break;
        case 'acerto':
          actor?.hit();
          if (actor) this.float(String(ev.dmg), actor.pos, ev.crit ? 'crit' : ev.blocked ? 'blocked' : 'dmg');
          break;
        case 'inimigoGolpe': {
          const e = w.room?.enemies.find((x) => x.id === ev.enemy);
          actor?.attack(ev.special, Math.max(0.3, ((e?.interval ?? 16) * 0.8) / BALANCE.ticksPerSecond / speed));
          break;
        }
        case 'heroiAcertado':
          if (!this.hero.animator.busy) this.hero.animator.play({ name: ev.blocked ? 'Melee_Block_Hit' : 'Hit_A', duration: 0.5 / Math.sqrt(speed) });
          this.float(ev.blocked ? `${ev.dmg}` : `-${ev.dmg}`, this.heroPos, ev.blocked ? 'blocked' : 'hurt');
          break;
        case 'inimigoMorre':
          actor?.die();
          break;
        case 'pocao':
          this.hero.animator.play({ name: 'Use_Item', duration: 1 / speed });
          break;
        case 'cura':
          this.float(`+${ev.amount}`, this.heroPos, 'heal');
          break;
        case 'heroiMorre':
          this.hero.animator.die('Death_A');
          break;
        case 'voltou':
          this.hero.animator.revive();
          break;
        default:
          break;
      }
    }
  }

  /** Um quadro: lê o estado, aplica os eventos do tick e desenha. */
  frame(w: World, events: SimEvent[], frac: number, dt: number, speed: number): void {
    if (!this.ready) return;
    this.time += dt;
    this.perf.begin();
    void this.swapRoom(w);
    this.hero.request(w.hero.head, w.hero.equip);
    const t = w.tick + frac;
    const roomShown = this.roomKey !== 'vila' && w.room;
    // Onde o herói deve estar.
    const target = new THREE.Vector3(0, 0, 0);
    let running = false;
    if (w.phase === 'vila') target.set(0, 0, 1.5);
    else if (w.phase === 'descendo') {
      target.set(ENEMY_DOOR.x, 0, ENEMY_DOOR.z + 0.6);
      running = true;
    } else if (w.phase === 'sala' && w.room?.phase === 'entrando') {
      const p = 1 - Math.max(0, w.room.phaseEnd - t) / BALANCE.enterTicks;
      target.copy(HERO_DOOR).add(new THREE.Vector3(0.6, 0, 0)).lerp(new THREE.Vector3(0, 0, 0), Math.min(1, p));
      running = p < 1;
    } else if (w.phase === 'voltando' && !w.carried && roomShown) {
      target.copy(HERO_DOOR).add(new THREE.Vector3(0.4, 0, 0));
      running = true;
    }
    const step = 1 - Math.exp(-dt * 6 * Math.max(1, speed * 0.6));
    const before = this.heroPos.clone();
    this.heroPos.lerp(target, step);
    const moved = before.distanceTo(this.heroPos) / Math.max(dt, 1e-3);
    if (moved > 0.6) running = true;
    this.hero.root.position.copy(this.heroPos);
    // Para onde olhar: o alvo do golpe, senão a porta dos inimigos, senão a câmera.
    let face: THREE.Vector3 | null = null;
    if (running) face = target.clone().sub(this.heroPos);
    else if (w.room && w.phase === 'sala') {
      const tid = w.hero.action?.target;
      const tgt = w.room.enemies.find((e) => e.id === tid && e.state !== 'morto') ?? w.room.enemies.find((e) => e.state === 'anel');
      const a = tgt ? this.enemies.get(tgt.id) : undefined;
      face = a ? a.pos.clone().sub(this.heroPos) : ENEMY_DOOR.clone().sub(this.heroPos);
    } else if (w.phase === 'vila') face = new THREE.Vector3(0.35, 0, 1);
    if (face && face.lengthSq() > 1e-4) {
      const want = Math.atan2(face.x, face.z);
      let d = want - this.heroFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heroFacing += d * Math.min(1, dt * 10);
    }
    this.hero.root.rotation.y = this.heroFacing;
    const two = w.hero.equip.arma && BASES[w.hero.equip.arma.base]?.hands === 2;
    const inFight = w.phase === 'sala' && w.room?.phase === 'luta';
    this.hero.animator.loop(running ? 'Running_A' : inFight && two ? 'Melee_2H_Idle' : inFight ? 'Melee_Unarmed_Idle' : 'Idle_A', running ? Math.min(1.6, 0.9 + 0.1 * speed) : 1);
    // Inimigos.
    if (roomShown && w.room) {
      let qi = 0, bi = 0;
      for (const e of w.room.enemies) {
        let a = this.enemies.get(e.id);
        if (!a) {
          a = new EnemyActor(e.kind, e.elite);
          this.enemies.set(e.id, a);
          const spawn = e.state === 'fundo' ? BACK_SPOTS[bi % BACK_SPOTS.length]! : this.queuePos(qi);
          a.pos.copy(spawn);
          a.root.position.copy(spawn);
          const actor = a;
          void a.init(this.enemyClips).then(() => {
            if (this.enemies.get(e.id) === actor && this.room) this.room.group.add(actor.root);
            if (e.state === 'morto') actor.die();
          });
        }
        const qIndex = e.state === 'fila' ? qi++ : 0;
        const bIndex = e.state === 'fundo' ? bi++ : 0;
        if (!a.animator) continue;
        if (e.state === 'morto') {
          if (!a.animator.isDead) a.die();
        } else {
          const goal = this.enemyTarget(w, e, qIndex, bIndex);
          const prev = a.pos.clone();
          a.pos.lerp(goal, 1 - Math.exp(-dt * 5 * Math.max(1, speed * 0.7)));
          const walking = prev.distanceTo(a.pos) / Math.max(dt, 1e-3) > 0.5;
          a.animator.loop(walking ? 'Skeletons_Walking' : 'Skeletons_Idle', walking ? 1.3 : 1);
          const look = this.heroPos.clone().sub(a.pos);
          if (look.lengthSq() > 1e-3) a.root.rotation.y = Math.atan2(look.x, look.z);
        }
        a.root.position.copy(a.pos);
        a.animator.update(dt);
      }
    }
    this.onEvents(w, events, speed);
    this.hero.animator.update(dt);
    // Tochas tremem; lendária pulsa.
    if (this.room) for (const [i, l] of this.room.torches.entries()) l.intensity = (i < 3 ? 14 : 9) * (0.85 + 0.15 * Math.sin(this.time * 9 + i * 2.1) * Math.sin(this.time * 5.3 + i));
    pulseLegendary(this.time);
    // Câmera persegue o herói; no celular em pé, mais longe.
    const portrait = this.camera.aspect < 0.85;
    this.zoom += ((this.closeUp ? 0.58 : 1) - this.zoom) * (1 - Math.exp(-dt * 4));
    const dist = (portrait ? 1.55 : 1.15) * this.zoom;
    this.focus.lerp(this.heroPos.clone().add(new THREE.Vector3(0, this.closeUp ? 1.25 : 1.1, 0)), 1 - Math.exp(-dt * 3));
    this.camera.position.copy(this.focus).add(new THREE.Vector3(6.5 * dist, (this.closeUp ? 5.2 : 8.2) * dist, 10.5 * dist));
    this.camera.lookAt(this.focus);
    this.applyInset(dt);
    this.sun.target.position.copy(this.focus);
    this.renderer.render(this.scene, this.camera);
    this.updateFloaters();
    this.perf.end();
  }

  private updateFloaters(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    this.floaters = this.floaters.filter((f) => {
      const age = this.time - f.born;
      if (age > 1.1) {
        f.el.remove();
        return false;
      }
      v.copy(f.pos).add(new THREE.Vector3(0, age * 1.2, 0)).project(this.camera);
      f.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.min(1, 2.2 - age * 2));
      return true;
    });
  }
}
