import "@babylonjs/loaders/glTF";
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
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { getVisibleObstacles } from "../game/course";
import type { GameState, Obstacle } from "../types";

interface ObstacleMeshes {
  root: TransformNode;
  type: string;
}

export interface HandFlyScene {
  engine: Engine;
  scene: Scene;
  update: (state: GameState) => void;
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

function makeFallbackPlane(scene: Scene, parent: TransformNode): void {
  const red = createPbrMaterial(scene, "fallback-plane-red", new Color3(0.9, 0.06, 0.04), 0.42);
  const white = createPbrMaterial(scene, "fallback-plane-white", new Color3(0.9, 0.96, 1), 0.35);
  const canopy = createPbrMaterial(scene, "fallback-plane-canopy", new Color3(0.2, 0.68, 0.92), 0.18);

  const fuselage = MeshBuilder.CreateCylinder("fallback-fuselage", { diameterTop: 0.55, diameterBottom: 1, height: 7.8, tessellation: 8 }, scene);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.material = red;
  fuselage.parent = parent;

  const nose = MeshBuilder.CreateCylinder("fallback-nose", { diameterTop: 0, diameterBottom: 1, height: 1.8, tessellation: 8 }, scene);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -4.8;
  nose.material = red;
  nose.parent = parent;

  const wings = MeshBuilder.CreateBox("fallback-wings", { width: 8.8, height: 0.12, depth: 1.6 }, scene);
  wings.position.z = -0.4;
  wings.material = white;
  wings.parent = parent;

  const tail = MeshBuilder.CreateBox("fallback-tail", { width: 2.8, height: 0.1, depth: 1.1 }, scene);
  tail.position.z = 3.2;
  tail.position.y = 0.15;
  tail.material = white;
  tail.parent = parent;

  const canopyMesh = MeshBuilder.CreateBox("fallback-canopy", { width: 0.78, height: 0.48, depth: 1.2 }, scene);
  canopyMesh.position.y = 0.65;
  canopyMesh.position.z = -1.65;
  canopyMesh.material = canopy;
  canopyMesh.parent = parent;
}

function addChaseSilhouette(scene: Scene, parent: TransformNode): void {
  const wingMaterial = createPbrMaterial(scene, "chase-wing-white", new Color3(0.94, 0.97, 1), 0.34);
  const tailMaterial = createPbrMaterial(scene, "chase-tail-blue", new Color3(0.05, 0.18, 0.42), 0.38);

  const wing = MeshBuilder.CreateBox("chase-wing", { width: 10.2, height: 0.18, depth: 1.55 }, scene);
  wing.position.z = -0.3;
  wing.material = wingMaterial;
  wing.parent = parent;

  const leftTip = MeshBuilder.CreateBox("chase-left-wingtip", { width: 0.22, height: 0.55, depth: 1.1 }, scene);
  leftTip.position.x = -5.05;
  leftTip.position.z = -0.1;
  leftTip.material = tailMaterial;
  leftTip.parent = parent;

  const rightTip = MeshBuilder.CreateBox("chase-right-wingtip", { width: 0.22, height: 0.55, depth: 1.1 }, scene);
  rightTip.position.x = 5.05;
  rightTip.position.z = -0.1;
  rightTip.material = tailMaterial;
  rightTip.parent = parent;

  const verticalTail = MeshBuilder.CreateBox("chase-vertical-tail", { width: 0.2, height: 1.8, depth: 1.0 }, scene);
  verticalTail.position.y = 1.08;
  verticalTail.position.z = 3.1;
  verticalTail.material = tailMaterial;
  verticalTail.parent = parent;
}

async function loadPlane(scene: Scene): Promise<TransformNode> {
  const root = new TransformNode("player-plane-root", scene);
  let usedFallback = false;
  try {
    const result = await ImportMeshAsync("/assets/handfly-plane.gltf", scene);
    const importedMeshes = result.meshes.filter((mesh) => mesh instanceof Mesh);
    if (importedMeshes.length === 0) {
      makeFallbackPlane(scene, root);
      usedFallback = true;
    } else {
      for (const mesh of importedMeshes) {
        mesh.parent = root;
      }
    }
  } catch {
    makeFallbackPlane(scene, root);
    usedFallback = true;
  }
  if (!usedFallback) {
    addChaseSilhouette(scene, root);
  }
  root.scaling = new Vector3(1.7, 1.7, 1.7);
  return root;
}

function createTerrain(scene: Scene): TransformNode {
  const root = new TransformNode("terrain-root", scene);
  const groundMaterial = createStandardMaterial(scene, "terrain-ground", new Color3(0.25, 0.45, 0.24));
  const riverMaterial = createStandardMaterial(scene, "terrain-river", new Color3(0.12, 0.35, 0.58));
  const runwayMaterial = createStandardMaterial(scene, "terrain-run", new Color3(0.42, 0.38, 0.32));

  for (let i = 0; i < 4; i += 1) {
    const ground = MeshBuilder.CreateGround(`ground-${i}`, { width: 220, height: 520, subdivisions: 12 }, scene);
    ground.position.z = -180 - i * 500;
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
  return root;
}

function createTunnel(scene: Scene, obstacle: Obstacle, material: StandardMaterial): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  for (let i = -1; i <= 1; i += 1) {
    const ring = MeshBuilder.CreateTorus(`${obstacle.id}-ring-${i}`, { diameter: obstacle.width, thickness: 0.9, tessellation: 48 }, scene);
    ring.scaling.y = obstacle.height / obstacle.width;
    ring.position.z = i * (obstacle.depth / 3);
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
  const planeRoot = await loadPlane(scene);
  const materials = {
    gate: createStandardMaterial(scene, "gate-material", new Color3(0.1, 0.42, 0.96)),
    tunnel: createStandardMaterial(scene, "tunnel-material", new Color3(0.78, 0.28, 0.15)),
    bridge: createStandardMaterial(scene, "bridge-material", new Color3(0.42, 0.35, 0.28)),
    mountain: createStandardMaterial(scene, "mountain-material", new Color3(0.45, 0.38, 0.32)),
  };
  const obstacleMeshes = new Map<string, ObstacleMeshes>();

  const update = (state: GameState): void => {
    planeRoot.position.set(state.plane.position.x, state.plane.position.y, state.plane.position.z);
    planeRoot.rotation.set(state.plane.pitch, state.plane.yaw, -state.plane.roll);

    camera.position.set(state.plane.position.x, state.plane.position.y + 4.8, state.plane.position.z + 34);
    camera.setTarget(new Vector3(state.plane.position.x, state.plane.position.y + 0.35, state.plane.position.z - 82));

    terrain.position.z = Math.floor(state.plane.position.z / 500) * 500;

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
