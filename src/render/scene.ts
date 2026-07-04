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

// Tapered lifting surface: a 4-tessellation cylinder is a diamond-section
// prism that tapers from root to tip; flattening one diamond axis turns it
// into a convincing low-poly wing once flat-shaded. Length runs along +y.
function createSpar(
  scene: Scene,
  name: string,
  length: number,
  rootChord: number,
  tipChord: number,
  thickness: number,
): Mesh {
  const spar = MeshBuilder.CreateCylinder(
    name,
    { height: length, diameterBottom: rootChord, diameterTop: tipChord, tessellation: 4 },
    scene,
  );
  spar.scaling.x = thickness / rootChord;
  spar.convertToFlatShadedMesh();
  return spar;
}

interface PlayerPlane {
  root: TransformNode;
  propeller: TransformNode;
}

// Low-poly stunt plane built from primitives, nose pointing -z. Everything
// has real volume so it reads correctly from the chase camera at any bank.
function buildPlane(scene: Scene): PlayerPlane {
  const root = new TransformNode("player-plane-root", scene);
  const red = createPbrMaterial(scene, "plane-red", new Color3(0.86, 0.09, 0.05), 0.4);
  const white = createPbrMaterial(scene, "plane-white", new Color3(0.93, 0.96, 1), 0.34);
  const navy = createPbrMaterial(scene, "plane-navy", new Color3(0.07, 0.2, 0.45), 0.38);
  const charcoal = createPbrMaterial(scene, "plane-charcoal", new Color3(0.11, 0.11, 0.13), 0.5);
  const glass = createPbrMaterial(scene, "plane-canopy", new Color3(0.25, 0.7, 0.95), 0.12);
  glass.alpha = 0.85;

  // Cylinder tops face -z after the rotation: wide cowl forward, tapering
  // toward the tail.
  const fuselage = MeshBuilder.CreateCylinder("plane-fuselage", { diameterTop: 1.3, diameterBottom: 0.45, height: 7.2, tessellation: 12 }, scene);
  fuselage.rotation.x = -Math.PI / 2;
  fuselage.convertToFlatShadedMesh();
  fuselage.material = red;
  fuselage.parent = root;

  const cowl = MeshBuilder.CreateCylinder("plane-cowl", { diameter: 1.42, height: 0.7, tessellation: 12 }, scene);
  cowl.rotation.x = -Math.PI / 2;
  cowl.position.z = -3.75;
  cowl.convertToFlatShadedMesh();
  cowl.material = charcoal;
  cowl.parent = root;

  // Spinner, two-blade prop, and a translucent motion disc; the whole
  // assembly spins in update().
  const propeller = new TransformNode("plane-propeller", scene);
  propeller.position.z = -4.28;
  propeller.parent = root;

  const spinner = MeshBuilder.CreateCylinder("plane-spinner", { diameterTop: 0, diameterBottom: 0.52, height: 0.85, tessellation: 8 }, scene);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.3;
  spinner.material = navy;
  spinner.parent = propeller;

  const blades = MeshBuilder.CreateBox("plane-blades", { width: 0.2, height: 3.1, depth: 0.09 }, scene);
  blades.material = charcoal;
  blades.parent = propeller;

  const propDisc = MeshBuilder.CreateDisc("plane-prop-disc", { radius: 1.62, tessellation: 24 }, scene);
  const discMaterial = new StandardMaterial("plane-prop-disc-material", scene);
  discMaterial.emissiveColor = new Color3(0.85, 0.88, 0.92);
  discMaterial.disableLighting = true;
  discMaterial.alpha = 0.14;
  discMaterial.backFaceCulling = false;
  propDisc.material = discMaterial;
  propDisc.position.z = -0.05;
  propDisc.parent = propeller;

  // Wings: tapered spars with a little dihedral, red tip fairings.
  const dihedral = 0.07;
  for (const side of [-1, 1]) {
    const wing = createSpar(scene, `plane-wing-${side}`, 4.7, 2.5, 1.45, 0.32);
    wing.rotation.z = side * (-Math.PI / 2 + dihedral);
    wing.position.set(side * 2.32, -0.04, -0.5);
    wing.material = white;
    wing.parent = root;

    const tip = MeshBuilder.CreateSphere(`plane-wingtip-${side}`, { diameterX: 0.5, diameterY: 0.16, diameterZ: 1.5, segments: 6 }, scene);
    tip.position.set(side * 4.66, 0.13, -0.5);
    tip.material = red;
    tip.parent = root;

    const tail = createSpar(scene, `plane-tailplane-${side}`, 1.9, 1.35, 0.8, 0.18);
    tail.rotation.z = side * (-Math.PI / 2 + 0.05);
    tail.position.set(side * 0.95, 0.27, 3.25);
    tail.material = white;
    tail.parent = root;

    // Fixed gear with wheel spats under the wings.
    const spat = MeshBuilder.CreateSphere(`plane-spat-${side}`, { diameterX: 0.42, diameterY: 0.85, diameterZ: 1.05, segments: 6 }, scene);
    spat.position.set(side * 1.55, -0.92, -0.85);
    spat.material = navy;
    spat.parent = root;

    const wheel = MeshBuilder.CreateSphere(`plane-wheel-${side}`, { diameter: 0.34, segments: 6 }, scene);
    wheel.position.set(side * 1.55, -1.3, -0.85);
    wheel.material = charcoal;
    wheel.parent = root;
  }

  // Swept vertical fin.
  const fin = createSpar(scene, "plane-fin", 1.9, 1.9, 0.95, 0.2);
  fin.rotation.x = 0.3;
  fin.position.set(0, 1.25, 3.55);
  fin.material = navy;
  fin.parent = root;

  const canopy = MeshBuilder.CreateSphere("plane-canopy-bubble", { diameterX: 0.7, diameterY: 0.55, diameterZ: 2.1, segments: 8 }, scene);
  canopy.position.set(0, 0.58, -1.5);
  canopy.material = glass;
  canopy.parent = root;

  root.scaling = new Vector3(1.15, 1.15, 1.15);
  return { root, propeller };
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
  const player = buildPlane(scene);
  const planeRoot = player.root;

  // Soft blob shadow under the plane: the main altitude cue.
  const shadow = MeshBuilder.CreateDisc("plane-shadow", { radius: 3.2, tessellation: 20 }, scene);
  shadow.rotation.x = Math.PI / 2;
  const shadowMaterial = new StandardMaterial("plane-shadow-material", scene);
  shadowMaterial.diffuseColor = new Color3(0, 0, 0);
  shadowMaterial.disableLighting = true;
  shadowMaterial.alpha = 0.24;
  shadowMaterial.backFaceCulling = false;
  shadow.material = shadowMaterial;
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
    player.propeller.rotation.z += dt * (30 + state.plane.speed * 0.35);

    // Shadow shrinks and fades with altitude.
    shadow.position.set(state.plane.position.x, 0.08, state.plane.position.z);
    const altitude = Math.max(0, state.plane.position.y);
    const shadowScale = Math.max(0.35, 1.1 - altitude * 0.012);
    shadow.scaling.set(shadowScale, shadowScale, 1);
    shadowMaterial.alpha = Math.max(0.06, 0.3 - altitude * 0.0038);

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
