import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { getVisibleObstacles } from "../game/course";
import { damp } from "../math";
import type { GameState, Obstacle } from "../types";

interface ObstacleMeshes {
  root: TransformNode;
  type: string;
}

export interface HandFlyScene {
  engine: Engine;
  scene: Scene;
  update: (state: GameState, dt: number) => void;
  render: () => void;
  resize: () => void;
  dispose: () => void;
}

function createStandardMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = color.scale(0.14);
  return material;
}

function createPbrMaterial(scene: Scene, name: string, color: Color3, roughness = 0.62): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = 0.02;
  return material;
}

// Low-poly stunt plane built from primitives, nose pointing -z. Everything
// has real volume so it reads correctly from the chase camera at any bank.
function buildPlane(scene: Scene): TransformNode {
  const root = new TransformNode("player-plane-root", scene);
  const red = createPbrMaterial(scene, "plane-red", new Color3(0.86, 0.09, 0.05), 0.4);
  const white = createPbrMaterial(scene, "plane-white", new Color3(0.93, 0.96, 1), 0.34);
  const navy = createPbrMaterial(scene, "plane-navy", new Color3(0.07, 0.2, 0.45), 0.38);
  const glass = createPbrMaterial(scene, "plane-canopy", new Color3(0.25, 0.7, 0.95), 0.12);

  // Cylinder tops face -z after the rotation: wide cowl forward, tapering
  // toward the tail, with a spinner cone on the very front.
  const fuselage = MeshBuilder.CreateCylinder("plane-fuselage", { diameterTop: 1.3, diameterBottom: 0.5, height: 7.2, tessellation: 12 }, scene);
  fuselage.rotation.x = -Math.PI / 2;
  fuselage.material = red;
  fuselage.parent = root;

  const nose = MeshBuilder.CreateCylinder("plane-nose", { diameterTop: 0.3, diameterBottom: 1.3, height: 1.3, tessellation: 12 }, scene);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.25;
  nose.material = white;
  nose.parent = root;

  const wing = MeshBuilder.CreateBox("plane-wing", { width: 9.4, height: 0.3, depth: 2.2 }, scene);
  wing.position.z = -0.5;
  wing.position.y = -0.2;
  wing.material = white;
  wing.parent = root;

  for (const sideX of [-5.1, 5.1]) {
    const tip = MeshBuilder.CreateBox(`plane-wingtip-${sideX}`, { width: 0.26, height: 0.85, depth: 1.5 }, scene);
    tip.position.set(sideX, 0.14, -0.4);
    tip.material = navy;
    tip.parent = root;
  }

  const tailplane = MeshBuilder.CreateBox("plane-tailplane", { width: 3.6, height: 0.2, depth: 1.3 }, scene);
  tailplane.position.set(0, 0.25, 3.2);
  tailplane.material = white;
  tailplane.parent = root;

  const fin = MeshBuilder.CreateBox("plane-fin", { width: 0.24, height: 1.7, depth: 1.4 }, scene);
  fin.position.set(0, 1, 3.3);
  fin.material = navy;
  fin.parent = root;

  const canopy = MeshBuilder.CreateSphere("plane-canopy-bubble", { diameterX: 0.7, diameterY: 0.55, diameterZ: 2.1, segments: 8 }, scene);
  canopy.position.set(0, 0.58, -1.5);
  canopy.material = glass;
  canopy.parent = root;

  root.scaling = new Vector3(1.15, 1.15, 1.15);
  return root;
}

function createTerrain(scene: Scene): TransformNode {
  const root = new TransformNode("terrain-root", scene);
  const groundMaterial = createStandardMaterial(scene, "terrain-ground", new Color3(0.25, 0.45, 0.24));
  const riverMaterial = createStandardMaterial(scene, "terrain-river", new Color3(0.12, 0.35, 0.58));
  const runwayMaterial = createStandardMaterial(scene, "terrain-run", new Color3(0.42, 0.38, 0.32));

  // Tiles at local +500, 0, -500, -1000: with the root snapped to the
  // nearest 500 of the plane's z there is always ground underfoot and
  // ~1200 units ahead.
  for (let i = 0; i < 4; i += 1) {
    const ground = MeshBuilder.CreateGround(`ground-${i}`, { width: 640, height: 520, subdivisions: 12 }, scene);
    ground.position.z = 500 - i * 500;
    ground.material = groundMaterial;
    ground.parent = root;
  }

  const river = MeshBuilder.CreateGround("river", { width: 28, height: 2200, subdivisions: 2 }, scene);
  river.position.x = -52;
  river.position.y = 0.03;
  river.position.z = -760;
  river.material = riverMaterial;
  river.parent = root;

  const path = MeshBuilder.CreateGround("distant-course-path", { width: 18, height: 2200, subdivisions: 2 }, scene);
  path.position.x = 42;
  path.position.y = 0.04;
  path.position.z = -760;
  path.material = runwayMaterial;
  path.parent = root;

  return root;
}

function createGate(scene: Scene, obstacle: Obstacle, material: StandardMaterial): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const rail = 0.9;
  const parts = [
    MeshBuilder.CreateBox(`${obstacle.id}-top`, { width: obstacle.width, height: rail, depth: rail }, scene),
    MeshBuilder.CreateBox(`${obstacle.id}-bottom`, { width: obstacle.width, height: rail, depth: rail }, scene),
    MeshBuilder.CreateBox(`${obstacle.id}-left`, { width: rail, height: obstacle.height, depth: rail }, scene),
    MeshBuilder.CreateBox(`${obstacle.id}-right`, { width: rail, height: obstacle.height, depth: rail }, scene),
  ];
  parts[0].position.y = obstacle.height / 2;
  parts[1].position.y = -obstacle.height / 2;
  parts[2].position.x = -obstacle.width / 2;
  parts[3].position.x = obstacle.width / 2;
  for (const part of parts) {
    part.material = material;
    part.parent = root;
  }

  // Support posts down to the ground so gates read as pylons, not floaters.
  const legHeight = obstacle.position.y - obstacle.height / 2;
  if (legHeight > 1) {
    for (const sideX of [-obstacle.width / 2, obstacle.width / 2]) {
      const leg = MeshBuilder.CreateBox(`${obstacle.id}-leg-${sideX}`, { width: 0.6, height: legHeight, depth: 0.6 }, scene);
      leg.position.x = sideX;
      leg.position.y = -obstacle.height / 2 - legHeight / 2;
      leg.material = material;
      leg.parent = root;
    }
  }
  return root;
}

function createTunnel(scene: Scene, obstacle: Obstacle, material: StandardMaterial): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  // Open-ended elliptical tube you actually fly through, with rim rings for
  // depth cues at the mouths.
  const tube = MeshBuilder.CreateCylinder(
    `${obstacle.id}-tube`,
    {
      diameter: obstacle.width,
      height: obstacle.depth,
      tessellation: 28,
      cap: Mesh.NO_CAP,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  tube.rotation.x = Math.PI / 2;
  tube.scaling.z = obstacle.height / obstacle.width;
  tube.material = material;
  tube.parent = root;
  for (const end of [-1, 1]) {
    const ring = MeshBuilder.CreateTorus(`${obstacle.id}-ring-${end}`, { diameter: obstacle.width + 1, thickness: 1.4, tessellation: 40 }, scene);
    // Torus hole faces +y by default; turn it to face down the flight axis.
    ring.rotation.x = Math.PI / 2;
    ring.scaling.z = obstacle.height / obstacle.width;
    ring.position.z = end * (obstacle.depth / 2);
    ring.material = material;
    ring.parent = root;
  }
  return root;
}

function createBridge(scene: Scene, obstacle: Obstacle, material: StandardMaterial): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const deck = MeshBuilder.CreateBox(`${obstacle.id}-deck`, { width: obstacle.width, height: obstacle.height, depth: obstacle.depth }, scene);
  deck.material = material;
  deck.parent = root;
  for (const x of [-obstacle.width / 2 + 4, obstacle.width / 2 - 4]) {
    const tower = MeshBuilder.CreateBox(`${obstacle.id}-tower-${x}`, { width: 2.8, height: obstacle.position.y, depth: obstacle.depth }, scene);
    tower.position.x = x;
    tower.position.y = -obstacle.position.y / 2 - obstacle.height / 2;
    tower.material = material;
    tower.parent = root;
  }
  return root;
}

// Recycled cloud puffs high above the course; the main speed cue besides
// the obstacles themselves.
function createClouds(scene: Scene): Mesh[] {
  const material = new StandardMaterial("cloud-material", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.emissiveColor = new Color3(0.88, 0.91, 0.96);
  material.disableLighting = true;
  material.alpha = 0.92;

  const clouds: Mesh[] = [];
  const seededOffset = (i: number, salt: number): number => {
    const value = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < 14; i += 1) {
    const puff = MeshBuilder.CreateSphere(`cloud-${i}`, { diameter: 15 + seededOffset(i, 1) * 14, segments: 6 }, scene);
    puff.scaling.y = 0.32;
    puff.material = material;
    puff.position.set(
      (seededOffset(i, 2) - 0.5) * 320,
      44 + seededOffset(i, 3) * 32,
      -60 - i * 130 - seededOffset(i, 4) * 70,
    );
    clouds.push(puff);
  }
  return clouds;
}

function createMountain(scene: Scene, obstacle: Obstacle, material: StandardMaterial): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const mountain = MeshBuilder.CreateCylinder(
    `${obstacle.id}-cone`,
    { diameterTop: 0, diameterBottom: obstacle.width, height: obstacle.height, tessellation: 7 },
    scene,
  );
  mountain.position.y = obstacle.height / 2;
  mountain.material = material;
  mountain.parent = root;
  return root;
}

function createObstacleMeshes(scene: Scene, obstacle: Obstacle, materials: Record<string, StandardMaterial>): ObstacleMeshes {
  const root =
    obstacle.type === "gate"
      ? createGate(scene, obstacle, materials.gate)
      : obstacle.type === "tunnel"
        ? createTunnel(scene, obstacle, materials.tunnel)
        : obstacle.type === "bridge"
          ? createBridge(scene, obstacle, materials.bridge)
          : createMountain(scene, obstacle, materials.mountain);
  return { root, type: obstacle.type };
}

export async function createHandFlyScene(canvas: HTMLCanvasElement): Promise<HandFlyScene> {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.6, 0.78, 0.96, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 360;
  scene.fogEnd = 820;
  scene.fogColor = new Color3(0.62, 0.76, 0.9);

  const camera = new FreeCamera("chase-camera", new Vector3(0, 19, 32), scene);
  camera.minZ = 0.1;
  camera.maxZ = 1600;
  camera.fov = 0.72;
  camera.setTarget(new Vector3(0, 13, -42));

  new HemisphericLight("sky-light", new Vector3(0.2, 1, 0.3), scene).intensity = 0.76;
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.85, -0.35), scene);
  sun.intensity = 2.2;

  const terrain = createTerrain(scene);
  const clouds = createClouds(scene);
  const planeRoot = buildPlane(scene);
  const materials = {
    gate: createStandardMaterial(scene, "gate-material", new Color3(0.1, 0.42, 0.96)),
    tunnel: createStandardMaterial(scene, "tunnel-material", new Color3(0.78, 0.28, 0.15)),
    bridge: createStandardMaterial(scene, "bridge-material", new Color3(0.42, 0.35, 0.28)),
    mountain: createStandardMaterial(scene, "mountain-material", new Color3(0.45, 0.38, 0.32)),
  };
  // Keep tunnel interiors readable instead of pitch black.
  materials.tunnel.emissiveColor = new Color3(0.24, 0.09, 0.05);
  const obstacleMeshes = new Map<string, ObstacleMeshes>();
  let cameraX = 0;

  const update = (state: GameState, dt: number): void => {
    planeRoot.position.set(state.plane.position.x, state.plane.position.y, state.plane.position.z);
    // Positive roll = bank right on screen; with the camera looking down -z
    // that is a positive rotation around z.
    planeRoot.rotation.set(state.plane.pitch, state.plane.yaw, state.plane.roll);

    // Chase camera lags the plane slightly and leans into the bank.
    cameraX = damp(cameraX, state.plane.position.x, 7.5, dt);
    camera.position.set(cameraX, state.plane.position.y + 4.8, state.plane.position.z + 34);
    camera.setTarget(new Vector3(cameraX * 0.4 + state.plane.position.x * 0.6, state.plane.position.y + 0.35, state.plane.position.z - 82));
    const cameraLean = state.plane.roll * 0.18;
    camera.upVector = new Vector3(-Math.sin(cameraLean), Math.cos(cameraLean), 0);

    terrain.position.z = Math.round(state.plane.position.z / 500) * 500;

    for (const cloud of clouds) {
      if (cloud.position.z > state.plane.position.z + 80) {
        cloud.position.z -= 14 * 130;
      }
    }

    const visible = getVisibleObstacles(state.course, state.plane.position.z);
    const visibleIds = new Set(visible.map((obstacle) => obstacle.id));
    for (const [id, meshes] of obstacleMeshes) {
      if (!visibleIds.has(id)) {
        meshes.root.dispose();
        obstacleMeshes.delete(id);
      }
    }

    for (const obstacle of visible) {
      let meshes = obstacleMeshes.get(obstacle.id);
      if (!meshes || meshes.type !== obstacle.type) {
        meshes?.root.dispose();
        meshes = createObstacleMeshes(scene, obstacle, materials);
        obstacleMeshes.set(obstacle.id, meshes);
      }
      meshes.root.position.set(obstacle.position.x, obstacle.position.y, obstacle.position.z);
      meshes.root.rotation.y = obstacle.type === "bridge" ? Math.sin(obstacle.position.z * 0.03) * 0.12 : 0;
      meshes.root.setEnabled(!obstacle.passed || obstacle.position.z < state.plane.position.z + 30);
    }
  };

  return {
    engine,
    scene,
    update,
    render: () => scene.render(),
    resize: () => engine.resize(),
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}
