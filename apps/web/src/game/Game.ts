import * as THREE from 'three';
import { HALF, PLAYER_RADIUS } from './constants.js';
import { buildMap } from './world/MapBuilder.js';
import type { Colliders } from './world/Colliders.js';
import { PlayerObject } from './entities/PlayerObject.js';
import { ProjectileManager } from './entities/ProjectileManager.js';
import { CameraRig } from './CameraRig.js';
import { InputController } from './InputController.js';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private input: InputController;
  private player: PlayerObject;
  private projectiles: ProjectileManager;
  private colliders: Colliders;
  private clock = new THREE.Clock();
  private rafId = 0;
  private resizeObserver: ResizeObserver;

  constructor(private readonly container: HTMLElement) {
    const { clientWidth, clientHeight } = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x223044);
    this.scene.fog = new THREE.Fog(0x223044, 120, 220);

    this.setupLights();
    this.colliders = buildMap(this.scene);

    this.player = new PlayerObject(new THREE.Vector3(-HALF + 8, 0, HALF - 8));
    this.scene.add(this.player.group);

    this.projectiles = new ProjectileManager(this.scene);

    this.rig = new CameraRig(clientWidth / clientHeight);
    this.rig.follow(this.player.position);

    this.input = new InputController(this.renderer.domElement, this.rig.camera);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  setJoystickAxis(x: number, z: number): void {
    this.input.setJoystick(x, z);
  }

  fire(): void {
    const origin = this.player.position;
    const dir = this.player.facing;
    const target = new THREE.Vector3(
      origin.x + dir.x * 100,
      origin.y,
      origin.z + dir.z * 100,
    );
    this.projectiles.spawn(origin, target, performance.now());
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xd4e6ff, 0x506a3a, 1.0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
  }

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight);
    this.rig.resize(clientWidth / clientHeight);
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const now = performance.now();

    this.player.update(this.input.getMovement(), delta);
    this.colliders.resolve(this.player.position, PLAYER_RADIUS);

    const target = this.input.consumeAttackTarget();
    if (target) {
      this.projectiles.spawn(this.player.position, target, now);
    }

    this.projectiles.update(delta, now);
    this.spinCrystals(delta);

    this.rig.follow(this.player.position);
    this.renderer.render(this.scene, this.rig.camera);
  };

  private spinCrystals(delta: number): void {
    const crystals = this.scene.userData.crystals as THREE.Mesh[] | undefined;
    if (!crystals) return;
    for (const c of crystals) c.rotation.y += delta * 0.8;
  }
}
