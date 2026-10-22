/**
 * Cena 3D: só lê o estado e os eventos da simulação e anima. Nada aqui decide a luta.
 */
import * as THREE from 'three';
import { BALANCE, BASES, isBoss } from '../sim/index.ts';
import type { Enemy, HeadId, SimEvent, World } from '../sim/index.ts';
import { EnemyActor, enemyFiles } from './actors.ts';
import { clips, load, pulseLegendary } from './assets.ts';
import { buildRoom, DUNGEON_PIECES, ENEMY_DOOR, HERO_DOOR } from './dungeon.ts';
import type { BuiltRoom } from './dungeon.ts';
import { HeroRig } from './heroRig.ts';
import { CARRIED_EXIT_TICKS, EXIT_TICKS, travelView } from '../game/travel.ts';
import { CRYPT, FIRE, HOME_VIEW, SEAT } from '../game/townPlan.ts';
import { PerfMeter } from './perf.ts';
import { TOWN_FILES, Town } from './town.ts';
import { visualFiles } from './visuals.ts';

/** Vagas do anel, girado para a direita da porta: assim o herói aparece de três quartos para a câmera. */
const RING_ANGLES = [-0.6, 0.55, 1.7];
/** Na vila: onde o herói senta na fogueira e a frente da porta da Cripta. */
/** Câmera da vila pelo teclado: [direita, frente, zoom] de cada tecla (+ aproxima, - afasta). */
const TOWN_KEYS: Record<string, [number, number, number]> = {
  ArrowRight: [1, 0, 0], KeyD: [1, 0, 0],
  ArrowLeft: [-1, 0, 0], KeyA: [-1, 0, 0],
  ArrowUp: [0, 1, 0], KeyW: [0, 1, 0],
  ArrowDown: [0, -1, 0], KeyS: [0, -1, 0],
  Minus: [0, 0, 1], NumpadSubtract: [0, 0, 1],
  Equal: [0, 0, -1], NumpadAdd: [0, 0, -1],
};
const SEAT_POS = new THREE.Vector3(SEAT.x, 0, SEAT.z);
const CRYPT_FRONT = new THREE.Vector3(CRYPT.x + 1.4, 0, CRYPT.z);
const FIRE_POS = new THREE.Vector3(FIRE.x, 0, FIRE.z);
const HOME = new THREE.Vector3(HOME_VIEW.x, 0, HOME_VIEW.z);

const DAY_SKY = new THREE.Color(0x9cc7e8);
const DUSK_SKY = new THREE.Color(0xe4a678);
const NIGHT_SKY = new THREE.Color(0x0e1626);
const CRYPT_SKY = new THREE.Color(0x0a0c11);
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
  private hemi: THREE.HemisphereLight;
  readonly town = new Town();
  /** O jogador escolheu olhar a vila com o herói lá embaixo (botão Vila/Herói do HUD). */
  watchTown = false;
  private showingTown = false;
  /** Câmera da vila: segue o herói até o jogador arrastar; zoom pela roda ou pinça. */
  private townCam = { target: new THREE.Vector3().copy(HOME), zoom: HOME_VIEW.zoom, free: false };
  private lastPhase = '';
  private standUntil = 0;
  private seated = false;
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
    this.hemi = new THREE.HemisphereLight(0x8a9cc4, 0x2a1d14, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xc8d6ff, 1.6);
    this.sun.position.set(-7, 16, 9);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.hero.root);
    this.town.group.visible = false;
    this.scene.add(this.town.group);
    this.perf = new PerfMeter(this.renderer);
    this.bindTownInput();
  }

  /** Carrega tudo que o protótipo usa (cerca de 8 MB) antes de mostrar a cena. */
  async init(onProgress?: (done: number, total: number) => void): Promise<void> {
    const files = [...visualFiles(), ...enemyFiles(), ...DUNGEON_PIECES, ...TOWN_FILES];
    const anims = [
      'animations/Rig_Medium_General.glb', 'animations/Rig_Medium_MovementBasic.glb', 'animations/Rig_Medium_CombatMelee.glb',
      'animations/Rig_Medium_CombatRanged.glb', 'animations/Rig_Medium_Special.glb', 'animations/Rig_Medium_Simulation.glb',
      'animations/Rig_Medium_Tools.glb',
    ];
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
    await this.town.init();
    this.ready = true;
  }

  /**
   * Teclas que movem a câmera da vila (setas ou WASD; + e - para o zoom), com a hora em que podem
   * parar: null enquanto seguradas; um toque rápido ainda conta por 0,12 s.
   */
  private keys = new Map<string, { down: number; until: number | null }>();

  /**
   * Arrastar (ou setas e WASD) move a câmera da vila; roda, pinça e + e - dão zoom; 0 volta à vista
   * de casa; um toque curto num prédio abre o painel dele.
   */
  private bindTownInput(): void {
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.showingTown) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !this.showingTown) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) this.townCam.zoom = THREE.MathUtils.clamp(this.townCam.zoom * (pinch / d), 0.45, 2.6);
        pinch = d;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return;
      // Pan no chão: direita e frente da câmera, achatadas no plano.
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
      const fwd = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).setY(0).normalize();
      const k = 0.06 * this.townCam.zoom;
      this.panTown(right.multiplyScalar(-dx * k).addScaledVector(fwd, -dy * k));
    });
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const tap = pts.size === 1 && moved < 6;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (tap && this.showingTown) this.tapTown(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      if (!this.showingTown) return;
      e.preventDefault();
      this.townCam.zoom = THREE.MathUtils.clamp(this.townCam.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 2.6);
    }, { passive: false });
    const typing = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey || !!(e.target as HTMLElement).closest?.('input, select, textarea');
    addEventListener('keydown', (e) => {
      if (!this.showingTown || typing(e)) return;
      if (e.key === '0') return this.recenter();
      if (!TOWN_KEYS[e.code]) return;
      if (!this.keys.has(e.code)) this.keys.set(e.code, { down: performance.now(), until: null });
      e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      const k = this.keys.get(e.code);
      if (!k) return;
      if (performance.now() - k.down >= 120) this.keys.delete(e.code);
      else k.until = k.down + 120;
    });
    addEventListener('blur', () => this.keys.clear());
  }

  /** Move o alvo da câmera da vila no chão, sem sair da vila. */
  private panTown(d: THREE.Vector3): void {
    this.townCam.target.add(d);
    this.townCam.target.x = THREE.MathUtils.clamp(this.townCam.target.x, -50, 50);
    this.townCam.target.z = THREE.MathUtils.clamp(this.townCam.target.z, -50, 40);
    this.townCam.free = true;
  }

  /** Teclas seguradas: anda cerca de 20 m/s (mais com a câmera longe) e o zoom dobra em meio segundo. */
  private keyTown(dt: number): void {
    if (!this.keys.size) return;
    let x = 0, y = 0, z = 0;
    const now = performance.now();
    for (const [code, k] of this.keys) {
      if (k.until !== null && now > k.until) this.keys.delete(code);
      const [kx, ky, kz] = TOWN_KEYS[code]!;
      x += kx;
      y += ky;
      z += kz;
    }
    if (z) this.townCam.zoom = THREE.MathUtils.clamp(this.townCam.zoom * Math.exp(z * dt * 1.4), 0.45, 2.6);
    if (!x && !y) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).setY(0).normalize();
    const k = 20 * this.townCam.zoom * dt;
    this.panTown(right.multiplyScalar(x * k).addScaledVector(fwd, -y * k));
  }

  /** Toque na vila: acha o ponto do chão e, se cair num lote de prédio, avisa a interface. */
  private tapTown(x: number, y: number): void {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    const lot = this.town.lotAt(hit.x, hit.z);
    if (lot) dispatchEvent(new CustomEvent('portador-lot', { detail: lot.kind }));
  }

  /** Volta a câmera da vila para o herói (ou para a praça, com ele lá embaixo). */
  recenter(): void {
    this.townCam.free = false;
    this.townCam.zoom = HOME_VIEW.zoom;
  }

  get townFree(): boolean {
    return this.showingTown && this.townCam.free;
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

  /** Fase em que o herói já empurrou a porta (para empurrar uma vez só). */
  private doorKey = '';

  /** Rosto mostrado na tela de novo jogo (null = o do herói). */
  previewHead: HeadId | null = null;

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

  private wantedRoom(w: World): { key: string; kind: Parameters<typeof buildRoom>[1]; look: number; remains: boolean } | null {
    if (!w.room || (w.phase !== 'sala' && w.phase !== 'voltando')) return null;
    const remains = w.remains.some((r) => r.floor === w.room!.floor && r.room === w.room!.index);
    return { key: `${w.room.floor}:${w.room.index}:${w.room.look}:${remains}`, kind: w.room.kind, look: w.room.look, remains };
  }

  /** Luz da vila pela hora: céu, névoa, sol e céu refletido. A Cripta tem a própria luz fria. */
  private lightTown(day: number): void {
    const sky = day >= 0.5 ? DUSK_SKY.clone().lerp(DAY_SKY, (day - 0.5) * 2) : NIGHT_SKY.clone().lerp(DUSK_SKY, day * 2);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = 50 + 30 * day;
    fog.far = 130 + 70 * day;
    this.sun.intensity = 0.35 + 2.7 * day;
    this.sun.color.setHSL(0.1 - 0.5 * (1 - day) * 0.1, 0.5, 0.75 + 0.15 * day);
    this.hemi.intensity = 0.45 + 0.9 * day;
    this.hemi.color.setHSL(0.58, 0.45, 0.55 + 0.2 * day);
    const sc = this.sun.shadow.camera;
    if (sc.right !== 34) {
      sc.left = sc.bottom = -34;
      sc.right = sc.top = 34;
      sc.far = 100;
      sc.updateProjectionMatrix();
    }
  }

  private lightCrypt(): void {
    (this.scene.background as THREE.Color).copy(CRYPT_SKY);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(CRYPT_SKY);
    fog.near = 20;
    fog.far = 44;
    this.sun.intensity = 1.6;
    this.sun.color.set(0xc8d6ff);
    this.hemi.intensity = 1.1;
    this.hemi.color.set(0x8a9cc4);
    const sc = this.sun.shadow.camera;
    if (sc.right !== 13) {
      sc.left = sc.bottom = -13;
      sc.right = sc.top = 13;
      sc.far = 40;
      sc.updateProjectionMatrix();
    }
  }

  private async swapRoom(w: World): Promise<void> {
    const want = this.wantedRoom(w);
    if (!want) return;
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
    // Sala nova: o herói começa na porta da esquerda, e a câmera vai junto, sem varrer a sala.
    if (!this.showingTown) {
      const entry = HERO_DOOR.clone().add(new THREE.Vector3(0.7, 0, 0));
      this.heroPos.copy(entry);
      this.focus.copy(entry).add(new THREE.Vector3(0, 1.1, 0));
    }
  }

  private ringPos(e: Enemy): THREE.Vector3 {
    const big = isBoss(e.kind);
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
          actor?.attack(ev.special, Math.max(0.3, ((e?.interval ?? 16) * 0.8) / BALANCE.ticksPerSecond / speed), e?.phase ?? 1);
          break;
        }
        case 'fase':
          actor?.taunt();
          break;
        case 'inimigoRevive':
          actor?.rise();
          break;
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
    const travel = travelView(w, frac);
    // Qual cena: a vila com o herói nela (ou saindo para a Cripta), ou quando o jogador quer olhar
    // a vila; senão, a masmorra.
    const heroInTown = w.phase === 'vila' || w.phase === 'descendo';
    const showTown = heroInTown || this.watchTown;
    if (showTown !== this.showingTown) {
      this.showingTown = showTown;
      this.town.group.visible = showTown;
      if (this.room) this.room.group.visible = !showTown;
      if (showTown) this.townCam.free = false;
    }
    if (!showTown) void this.swapRoom(w);
    else this.town.sync(w);
    // Chegando da Cripta: o herói aparece na porta e anda até a fogueira; no primeiro quadro, já sentado.
    if (w.phase !== this.lastPhase) {
      if (w.phase === 'vila') {
        this.heroPos.copy(this.lastPhase ? CRYPT_FRONT : SEAT_POS);
        this.focus.copy(this.heroPos).add(new THREE.Vector3(0, 1.1, 0));
        this.seated = false;
      }
      if (w.phase === 'descendo' && this.seated) {
        // Levanta da fogueira antes de ir para a Cripta.
        this.hero.animator.play({ name: 'Sit_Floor_StandUp', duration: 0.9 / Math.max(1, speed) });
        this.standUntil = this.time + 0.9 / Math.max(1, speed);
        this.seated = false;
      }
      this.lastPhase = w.phase;
    }
    this.hero.root.visible = showTown ? heroInTown : true;
    this.hero.request(this.previewHead ?? w.hero.head, w.hero.equip);
    const roomShown = !showTown && w.room;
    // Onde o herói deve estar. Ele anda em velocidade constante e para no alvo (nada de correr
    // contra a porta): na saída, chega à porta e a empurra; depois, o cartão da viagem cobre a tela.
    const target = new THREE.Vector3(0, 0, 0);
    if (w.phase === 'vila') {
      target.copy(SEAT_POS);
    } else if (w.phase === 'descendo') {
      target.copy(CRYPT_FRONT);
    } else if (w.phase === 'voltando' && !w.carried && roomShown) {
      target.copy(HERO_DOOR).add(new THREE.Vector3(0.7, 0, 0));
    } else if (w.phase === 'sala' && w.room?.phase === 'saque' && w.room.exitTo === 'fundo') {
      // Saque recolhido: atravessa a sala até a porta do fundo, por onde vieram os esqueletos.
      const sinceClear = BALANCE.lootTicks + BALANCE.roomExitTicks - (w.room.phaseEnd - (w.tick + frac));
      if (sinceClear >= BALANCE.lootTicks) target.copy(ENEMY_DOOR).add(new THREE.Vector3(0, 0, 0.7));
    }
    const toTarget = target.clone().sub(this.heroPos);
    const gap = toTarget.length();
    const stride = 5.5 * dt * Math.max(1, speed * 0.8);
    const running = gap > 0.05 && !this.hero.animator.isDead && this.time >= this.standUntil;
    if (running) this.heroPos.add(toTarget.multiplyScalar(Math.min(1, stride / gap)));
    this.hero.root.position.copy(this.heroPos);
    // Chegou à porta na saída: empurra (uma vez por viagem).
    const doorKey = `${w.phase}:${w.phaseEnd}`;
    if (travel.mode === 'saindo' && w.phase !== 'sala' && !travel.carried && !running && gap < 0.3 && this.time >= this.standUntil && this.doorKey !== doorKey) {
      this.doorKey = doorKey;
      this.hero.animator.play({ name: 'Interact', duration: 1.2 / Math.max(1, speed) });
    }
    // Para onde olhar: o alvo do golpe, senão a porta dos inimigos, senão a câmera.
    let face: THREE.Vector3 | null = null;
    if (running) face = target.clone().sub(this.heroPos);
    else if (travel.mode === 'saindo' && w.phase !== 'sala') face = (w.phase === 'descendo' ? new THREE.Vector3(CRYPT.x, 0, CRYPT.z) : HERO_DOOR).clone().sub(this.heroPos);
    else if (travel.mode === 'saindo' || travel.mode === 'passagem') face = ENEMY_DOOR.clone().sub(this.heroPos);
    else if (w.room && w.phase === 'sala') {
      const tid = w.hero.action?.target;
      const tgt = w.room.enemies.find((e) => e.id === tid && e.state !== 'morto') ?? w.room.enemies.find((e) => e.state === 'anel');
      const a = tgt ? this.enemies.get(tgt.id) : undefined;
      face = a ? a.pos.clone().sub(this.heroPos) : ENEMY_DOOR.clone().sub(this.heroPos);
    } else if (w.phase === 'vila') face = this.closeUp ? new THREE.Vector3(0.6, 0, 1) : FIRE_POS.clone().sub(this.heroPos);
    if (face && face.lengthSq() > 1e-4) {
      const want = Math.atan2(face.x, face.z);
      let d = want - this.heroFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heroFacing += d * Math.min(1, dt * 10);
    }
    this.hero.root.rotation.y = this.heroFacing;
    const two = w.hero.equip.arma && BASES[w.hero.equip.arma.base]?.hands === 2;
    const inFight = w.phase === 'sala' && w.room?.phase === 'luta';
    // Na vila, parado na fogueira, senta (de pé na tela de equipamento).
    const sitting = w.phase === 'vila' && !running && !this.closeUp && this.heroPos.distanceTo(SEAT_POS) < 0.3;
    if (sitting && !this.seated) this.hero.animator.play({ name: 'Sit_Floor_Down', duration: 0.9 });
    this.seated = sitting;
    const idle = sitting ? 'Sit_Floor_Idle' : inFight && two ? 'Melee_2H_Idle' : inFight ? 'Melee_Unarmed_Idle' : 'Idle_A';
    this.hero.animator.loop(running ? 'Running_A' : idle, running ? Math.min(1.8, Math.max(1, speed * 0.8)) : 1);
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
    // Tochas tremem; lendária pulsa; a vila acende e apaga com a hora.
    if (this.room && !showTown) for (const [i, l] of this.room.torches.entries()) l.intensity = (i < 3 ? 14 : 9) * (0.85 + 0.15 * Math.sin(this.time * 9 + i * 2.1) * Math.sin(this.time * 5.3 + i));
    pulseLegendary(this.time);
    if (showTown) this.lightTown(this.town.update(w, this.time));
    else this.lightCrypt();
    // Câmera: na masmorra persegue o herói; na vila, segue o herói (ou a praça) até o jogador arrastar.
    const portrait = this.camera.aspect < 0.85;
    this.zoom += ((this.closeUp ? 0.58 : 1) - this.zoom) * (1 - Math.exp(-dt * 4));
    let dist = (portrait ? 1.55 : 1.15) * this.zoom;
    let goal = this.heroPos.clone().add(new THREE.Vector3(0, this.closeUp ? 1.25 : 1.1, 0));
    if (showTown) {
      if (this.closeUp) this.townCam.free = false;
      else this.keyTown(dt);
      // Vista de casa (praça, fogueira e Cripta no quadro); na tela de equipamento, perto do herói.
      if (!this.townCam.free) this.townCam.target.copy(HOME);
      goal = this.closeUp ? goal : this.townCam.target.clone().add(new THREE.Vector3(0, 1.1, 0));
      dist *= this.closeUp ? 1 : 1.6 * this.townCam.zoom;
    }
    this.focus.lerp(goal, 1 - Math.exp(-dt * (this.townCam.free ? 10 : 3)));
    this.camera.position.copy(this.focus).add(new THREE.Vector3(6.5 * dist, (this.closeUp ? 5.2 : 8.2) * dist, 10.5 * dist));
    this.camera.lookAt(this.focus);
    this.applyInset(dt);
    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).add(showTown ? new THREE.Vector3(-18, 34, 20) : new THREE.Vector3(-7, 16, 9));
    // Com o cartão da viagem cobrindo a tela, não desenha (poupa bateria no celular).
    const covered = travel.mode === 'viagem' && !this.watchTown && travel.elapsed > (travel.carried ? CARRIED_EXIT_TICKS : EXIT_TICKS) + 6;
    if (!covered) this.renderer.render(this.scene, this.camera);
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
