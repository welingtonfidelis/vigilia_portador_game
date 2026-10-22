/**
 * Animação com crossfade: um laço de base (parado, correr) e golpes de uma vez por cima, que
 * voltam sozinhos para a base. A morte segura o último quadro.
 */
import * as THREE from 'three';

export interface OneShot {
  name: string;
  /** Duração desejada em segundos (o clipe estica ou encolhe). */
  duration?: number;
  fade?: number;
}

export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private loopName = '';
  private current: THREE.AnimationAction | null = null;
  private shotUntil = 0;
  private dead = false;
  private time = 0;

  private clips: Map<string, THREE.AnimationClip>;

  constructor(root: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
  }

  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  private fadeTo(next: THREE.AnimationAction, fade: number): void {
    if (this.current === next) return;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current) {
      next.play();
      this.current.crossFadeTo(next, fade, false);
    } else {
      next.play();
    }
    this.current = next;
  }

  /** Laço de base. Não interrompe um golpe em andamento. */
  loop(name: string, timeScale = 1, fade = 0.25): void {
    if (this.dead) return;
    const changed = this.loopName !== name;
    this.loopName = name;
    if (this.time < this.shotUntil) return;
    const a = this.action(name);
    if (!a) return;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = timeScale;
    if (changed || this.current !== a) {
      a.reset();
      this.fadeTo(a, fade);
    }
  }

  /** Golpe, acerto, poção: toca uma vez e volta para o laço. */
  play(shot: OneShot): void {
    if (this.dead) return;
    const a = this.action(shot.name);
    if (!a) return;
    const clipDur = a.getClip().duration;
    const dur = shot.duration ?? clipDur;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = clipDur / Math.max(0.05, dur);
    if (this.current === a) {
      // Mesmo clipe de novo: recomeça sem fade.
      a.play();
    } else {
      this.fadeTo(a, shot.fade ?? 0.12);
    }
    this.shotUntil = this.time + dur * 0.92;
  }

  /** Morte: toca e segura o último quadro. */
  die(name: string, fade = 0.15): void {
    const a = this.action(name);
    if (!a) return;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.fadeTo(a, fade);
    this.dead = true;
  }

  revive(): void {
    this.dead = false;
    this.shotUntil = 0;
    this.current?.stop();
    this.current = null;
    const name = this.loopName;
    this.loopName = '';
    if (name) this.loop(name, 1, 0);
  }

  get isDead(): boolean {
    return this.dead;
  }

  get busy(): boolean {
    return this.time < this.shotUntil;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.dead && this.time >= this.shotUntil && this.loopName) {
      const a = this.action(this.loopName);
      if (a && this.current !== a) {
        a.reset();
        a.setLoop(THREE.LoopRepeat, Infinity);
        this.fadeTo(a, 0.2);
      }
    }
    this.mixer.update(dt);
  }
}
