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
import { BRIDGE_TOWER_HALF_WIDTH, BRIDGE_TOWER_INSET, BRIDGE_TOWER_RISE } from "../game/collision";
import { getVisibleObstacles } from "../game/course";
import { damp } from "../math";
import type { GameState, Obstacle } from "../types";
import { TERRAIN_STRIP_SURFACE_Y } from "./terrainDepth";

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
  river.position.y = TERRAIN_STRIP_SURFACE_Y;
  river.position.z = -760;
  river.material = riverMaterial;
  river.parent = root;

  const path = MeshBuilder.CreateGround("distant-course-path", { width: 18, height: 2200, subdivisions: 2 }, scene);
  path.position.x = 42;
  path.position.y = TERRAIN_STRIP_SURFACE_Y;
  path.position.z = -760;
  path.material = runwayMaterial;
  path.parent = root;

  return root;
}

// Shared obstacle materials, created once and reused across recycled meshes.
interface ObstaclePalette {
  gate: StandardMaterial;
  accent: StandardMaterial;
  steel: StandardMaterial;
  tunnel: StandardMaterial;
  tunnelDark: StandardMaterial;
  tunnelRim: StandardMaterial;
  stone: StandardMaterial;
  asphalt: StandardMaterial;
  roadLine: StandardMaterial;
  rock: StandardMaterial;
  snow: StandardMaterial;
  skirt: StandardMaterial;
}

function createObstaclePalette(scene: Scene): ObstaclePalette {
  const palette: ObstaclePalette = {
    gate: createStandardMaterial(scene, "gate-material", new Color3(0.1, 0.42, 0.96)),
    accent: createStandardMaterial(scene, "accent-material", new Color3(0.93, 0.95, 0.98)),
    steel: createStandardMaterial(scene, "steel-material", new Color3(0.16, 0.17, 0.2)),
    tunnel: createStandardMaterial(scene, "tunnel-material", new Color3(0.8, 0.3, 0.12)),
    tunnelDark: createStandardMaterial(scene, "tunnel-dark-material", new Color3(0.22, 0.11, 0.07)),
    tunnelRim: createStandardMaterial(scene, "tunnel-rim-material", new Color3(0.95, 0.62, 0.12)),
    stone: createStandardMaterial(scene, "stone-material", new Color3(0.5, 0.44, 0.38)),
    asphalt: createStandardMaterial(scene, "asphalt-material", new Color3(0.17, 0.17, 0.19)),
    roadLine: createStandardMaterial(scene, "road-line-material", new Color3(0.95, 0.8, 0.2)),
    rock: createStandardMaterial(scene, "rock-material", new Color3(0.3, 0.25, 0.21)),
    snow: createStandardMaterial(scene, "snow-material", new Color3(0.93, 0.95, 0.98)),
    skirt: createStandardMaterial(scene, "skirt-material", new Color3(0.31, 0.42, 0.24)),
  };
  // Keep tunnel interiors readable instead of pitch black, and let the rims
  // pop against fog.
  palette.tunnelDark.emissiveColor = new Color3(0.1, 0.045, 0.025);
  palette.tunnelRim.emissiveColor = new Color3(0.22, 0.13, 0.02);
  palette.roadLine.emissiveColor = new Color3(0.2, 0.16, 0.03);
  return palette;
}

// Deterministic per-obstacle variation without extra state.
function jitterFrom(obstacle: Obstacle, salt: number): number {
  const value = Math.sin(obstacle.position.z * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createGate(scene: Scene, obstacle: Obstacle, palette: ObstaclePalette): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const rail = 1.1;
  const sideSegment = obstacle.height / 3;

  // Air-race style pylon frame: blue rails with white mid-bands on the
  // uprights and white corner blocks.
  for (const [name, y] of [
    ["top", obstacle.height / 2],
    ["bottom", -obstacle.height / 2],
  ] as const) {
    const bar = MeshBuilder.CreateBox(`${obstacle.id}-${name}`, { width: obstacle.width, height: rail, depth: rail }, scene);
    bar.position.y = y;
    bar.material = palette.gate;
    bar.parent = root;
  }
  for (const sideX of [-obstacle.width / 2, obstacle.width / 2]) {
    for (let segment = 0; segment < 3; segment += 1) {
      const upright = MeshBuilder.CreateBox(
        `${obstacle.id}-side-${sideX}-${segment}`,
        { width: rail, height: sideSegment + 0.05, depth: rail },
        scene,
      );
      upright.position.x = sideX;
      upright.position.y = (segment - 1) * sideSegment;
      upright.material = segment === 1 ? palette.accent : palette.gate;
      upright.parent = root;
    }
    for (const cornerY of [-obstacle.height / 2, obstacle.height / 2]) {
      const corner = MeshBuilder.CreateBox(`${obstacle.id}-corner-${sideX}-${cornerY}`, { size: 1.7 }, scene);
      corner.position.set(sideX, cornerY, 0);
      corner.material = palette.accent;
      corner.parent = root;
    }
  }

  // Support posts down to the ground so gates read as pylons, not floaters.
  const legHeight = obstacle.position.y - obstacle.height / 2;
  if (legHeight > 1) {
    for (const sideX of [-obstacle.width / 2, obstacle.width / 2]) {
      const leg = MeshBuilder.CreateBox(`${obstacle.id}-leg-${sideX}`, { width: 0.55, height: legHeight, depth: 0.55 }, scene);
      leg.position.x = sideX;
      leg.position.y = -obstacle.height / 2 - legHeight / 2;
      leg.material = palette.steel;
      leg.parent = root;
    }
  }
  return root;
}

function createTunnel(scene: Scene, obstacle: Obstacle, palette: ObstaclePalette): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const ellipse = obstacle.height / obstacle.width;

  // Open-ended elliptical pipe you actually fly through: faceted orange
  // shell outside, dark bore inside, amber rims at the mouths, and ribs
  // along the barrel like a segmented pipe.
  const shell = MeshBuilder.CreateCylinder(
    `${obstacle.id}-shell`,
    { diameter: obstacle.width, height: obstacle.depth, tessellation: 22, cap: Mesh.NO_CAP },
    scene,
  );
  shell.rotation.x = Math.PI / 2;
  shell.scaling.z = ellipse;
  shell.convertToFlatShadedMesh();
  shell.material = palette.tunnel;
  shell.parent = root;

  const bore = MeshBuilder.CreateCylinder(
    `${obstacle.id}-bore`,
    { diameter: obstacle.width * 0.985, height: obstacle.depth, tessellation: 22, cap: Mesh.NO_CAP, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  bore.rotation.x = Math.PI / 2;
  bore.scaling.z = ellipse;
  bore.material = palette.tunnelDark;
  bore.parent = root;

  for (const end of [-1, 1]) {
    const rim = MeshBuilder.CreateTorus(`${obstacle.id}-rim-${end}`, { diameter: obstacle.width + 0.8, thickness: 1.5, tessellation: 36 }, scene);
    // Torus hole faces +y by default; turn it to face down the flight axis.
    rim.rotation.x = Math.PI / 2;
    rim.scaling.z = ellipse;
    rim.position.z = end * (obstacle.depth / 2);
    rim.material = palette.tunnelRim;
    rim.parent = root;

    const rib = MeshBuilder.CreateTorus(`${obstacle.id}-rib-${end}`, { diameter: obstacle.width + 0.5, thickness: 0.7, tessellation: 30 }, scene);
    rib.rotation.x = Math.PI / 2;
    rib.scaling.z = ellipse;
    rib.position.z = end * (obstacle.depth / 6);
    rib.material = palette.tunnelDark;
    rib.parent = root;
  }
  return root;
}

// Suspension bridge: solid towers (mirrored in the collision model), a
// catenary main cable over each deck face, hangers down to the deck, and
// anchor blocks beyond the ends. Viewed head-on while flying, the profile
// reads: tower - draped cable - deck - tower.
function createBridge(scene: Scene, obstacle: Obstacle, palette: ObstaclePalette): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const deckTop = obstacle.height / 2;
  const towerX = obstacle.width / 2 - BRIDGE_TOWER_INSET;
  const towerTop = deckTop + BRIDGE_TOWER_RISE;
  const groundY = -obstacle.position.y;

  const deck = MeshBuilder.CreateBox(`${obstacle.id}-deck`, { width: obstacle.width, height: obstacle.height, depth: obstacle.depth }, scene);
  deck.material = palette.stone;
  deck.parent = root;

  // Road surface with a painted center line and low railings.
  const roadway = MeshBuilder.CreateBox(`${obstacle.id}-roadway`, { width: obstacle.width - 0.8, height: 0.3, depth: obstacle.depth - 1.2 }, scene);
  roadway.position.y = deckTop + 0.15;
  roadway.material = palette.asphalt;
  roadway.parent = root;
  const line = MeshBuilder.CreateBox(`${obstacle.id}-line`, { width: obstacle.width - 2.5, height: 0.08, depth: 0.5 }, scene);
  line.position.y = deckTop + 0.32;
  line.material = palette.roadLine;
  line.parent = root;
  for (const side of [-1, 1]) {
    const railing = MeshBuilder.CreateBox(`${obstacle.id}-railing-${side}`, { width: obstacle.width, height: 0.5, depth: 0.3 }, scene);
    railing.position.set(0, deckTop + 0.5, side * (obstacle.depth / 2 - 0.3));
    railing.material = palette.accent;
    railing.parent = root;
  }

  // Towers: wider base to the deck, slimmer column above, capped. The
  // collision column spans the same footprint from ground to top.
  for (const side of [-1, 1]) {
    const baseHeight = deckTop + 2 - groundY;
    const base = MeshBuilder.CreateBox(`${obstacle.id}-tower-base-${side}`, { width: BRIDGE_TOWER_HALF_WIDTH * 2, height: baseHeight, depth: obstacle.depth }, scene);
    base.position.set(side * towerX, groundY + baseHeight / 2, 0);
    base.material = palette.stone;
    base.parent = root;

    const columnHeight = towerTop - (deckTop + 2);
    const column = MeshBuilder.CreateBox(`${obstacle.id}-tower-${side}`, { width: 2.4, height: columnHeight, depth: obstacle.depth * 0.8 }, scene);
    column.position.set(side * towerX, deckTop + 2 + columnHeight / 2, 0);
    column.material = palette.stone;
    column.parent = root;

    const cap = MeshBuilder.CreateBox(`${obstacle.id}-tower-cap-${side}`, { width: 3.3, height: 0.8, depth: obstacle.depth * 0.9 }, scene);
    cap.position.set(side * towerX, towerTop + 0.4, 0);
    cap.material = palette.accent;
    cap.parent = root;
  }

  // Main cables: parabola between the tower tops, straight side spans down
  // to ground anchors beyond the deck ends.
  const sag = BRIDGE_TOWER_RISE * 0.8;
  const anchorX = towerX + 12;
  const mainSpanSamples = 9;
  for (const face of [-1, 1]) {
    const cableZ = face * (obstacle.depth / 2 - 0.5);
    const path: Vector3[] = [new Vector3(-anchorX, groundY + 1.4, cableZ)];
    for (let i = 0; i <= mainSpanSamples; i += 1) {
      const t = i / mainSpanSamples;
      path.push(new Vector3(-towerX + 2 * towerX * t, towerTop - sag * 4 * t * (1 - t), cableZ));
    }
    path.push(new Vector3(anchorX, groundY + 1.4, cableZ));
    const cable = MeshBuilder.CreateTube(`${obstacle.id}-cable-${face}`, { path, radius: 0.24, tessellation: 6 }, scene);
    cable.material = palette.accent;
    cable.parent = root;

    // Vertical hangers from the main cable down to the deck.
    for (let i = 1; i < mainSpanSamples; i += 1) {
      const t = i / mainSpanSamples;
      const cableY = towerTop - sag * 4 * t * (1 - t);
      const hangerTop = cableY;
      const hangerBottom = deckTop + 0.45;
      if (hangerTop - hangerBottom < 0.6) continue;
      const hanger = MeshBuilder.CreateBox(
        `${obstacle.id}-hanger-${face}-${i}`,
        { width: 0.14, height: hangerTop - hangerBottom, depth: 0.14 },
        scene,
      );
      hanger.position.set(-towerX + 2 * towerX * t, (hangerTop + hangerBottom) / 2, cableZ);
      hanger.material = palette.accent;
      hanger.parent = root;
    }
  }

  // Anchor blocks where the cables meet the ground.
  for (const side of [-1, 1]) {
    const anchor = MeshBuilder.CreateBox(`${obstacle.id}-anchor-${side}`, { width: 2.6, height: 2.2, depth: obstacle.depth * 0.55 }, scene);
    anchor.position.set(side * anchorX, groundY + 1.1, 0);
    anchor.material = palette.stone;
    anchor.parent = root;
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

function createMountain(scene: Scene, obstacle: Obstacle, palette: ObstaclePalette): TransformNode {
  const root = new TransformNode(obstacle.id, scene);
  const spin = jitterFrom(obstacle, 1) * Math.PI;
  const footprint = 0.9 + jitterFrom(obstacle, 2) * 0.2;

  // Faceted rock cone with a per-peak twist and squashed footprint so no
  // two mountains read identical; collision stays the analytic cone.
  const body = MeshBuilder.CreateCylinder(
    `${obstacle.id}-cone`,
    { diameterTop: 0, diameterBottom: obstacle.width, height: obstacle.height, tessellation: 7 },
    scene,
  );
  body.position.y = obstacle.height / 2;
  body.rotation.y = spin;
  body.scaling.x = footprint;
  body.convertToFlatShadedMesh();
  body.material = palette.rock;
  body.parent = root;

  // Mossy foothill skirt grounds the peak in the terrain.
  const skirt = MeshBuilder.CreateCylinder(
    `${obstacle.id}-skirt`,
    { diameterTop: obstacle.width * 0.75, diameterBottom: obstacle.width * 1.5, height: obstacle.height * 0.16, tessellation: 7 },
    scene,
  );
  skirt.position.y = obstacle.height * 0.08;
  skirt.rotation.y = spin + 0.35;
  skirt.scaling.x = footprint;
  skirt.convertToFlatShadedMesh();
  skirt.material = palette.skirt;
  skirt.parent = root;

  // Snow cap on the tall peaks only.
  if (obstacle.height > 26) {
    const capHeight = obstacle.height * 0.3;
    const cap = MeshBuilder.CreateCylinder(
      `${obstacle.id}-snow`,
      { diameterTop: 0, diameterBottom: (obstacle.width * capHeight) / obstacle.height + 1.2, height: capHeight, tessellation: 7 },
      scene,
    );
    cap.position.y = obstacle.height - capHeight / 2 + 0.15;
    cap.rotation.y = spin;
    cap.scaling.x = footprint;
    cap.convertToFlatShadedMesh();
    cap.material = palette.snow;
    cap.parent = root;
  }
  return root;
}

function createObstacleMeshes(scene: Scene, obstacle: Obstacle, palette: ObstaclePalette): ObstacleMeshes {
  const root =
    obstacle.type === "gate"
      ? createGate(scene, obstacle, palette)
      : obstacle.type === "tunnel"
        ? createTunnel(scene, obstacle, palette)
        : obstacle.type === "bridge"
          ? createBridge(scene, obstacle, palette)
          : createMountain(scene, obstacle, palette);
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

  // Plane-shaped shadow projected along the sun direction: a wing ellipse
  // crossed with a fuselage ellipse, displaced sideways with altitude the
  // way a real sun shadow travels, and softer/fainter the higher you fly.
  const shadowMaterial = new StandardMaterial("plane-shadow-material", scene);
  shadowMaterial.diffuseColor = new Color3(0, 0, 0);
  shadowMaterial.disableLighting = true;
  shadowMaterial.alpha = 0.3;
  shadowMaterial.backFaceCulling = false;
  const shadowRoot = new TransformNode("plane-shadow-root", scene);
  const wingShadow = MeshBuilder.CreateDisc("plane-shadow-wing", { radius: 1, tessellation: 18 }, scene);
  wingShadow.rotation.x = Math.PI / 2;
  wingShadow.scaling.set(5.6, 1.35, 1);
  wingShadow.material = shadowMaterial;
  wingShadow.parent = shadowRoot;
  const bodyShadow = MeshBuilder.CreateDisc("plane-shadow-body", { radius: 1, tessellation: 18 }, scene);
  bodyShadow.rotation.x = Math.PI / 2;
  bodyShadow.scaling.set(0.95, 4.4, 1);
  bodyShadow.position.y = 0.012;
  bodyShadow.material = shadowMaterial;
  bodyShadow.parent = shadowRoot;
  // Ground offset per unit of altitude along the sun's slant.
  const shadowSlantX = -0.45 / 0.85;
  const shadowSlantZ = -0.35 / 0.85;

  // Mesh-based explosion: a bright flash plus fire and smoke chunks thrown
  // outward under gravity when the last hit lands.
  const fireMaterial = new StandardMaterial("explosion-fire", scene);
  fireMaterial.diffuseColor = new Color3(0.9, 0.3, 0.05);
  fireMaterial.emissiveColor = new Color3(1, 0.52, 0.1);
  fireMaterial.disableLighting = true;
  const smokeMaterial = new StandardMaterial("explosion-smoke", scene);
  smokeMaterial.diffuseColor = new Color3(0.2, 0.18, 0.16);
  smokeMaterial.emissiveColor = new Color3(0.14, 0.12, 0.1);
  smokeMaterial.disableLighting = true;
  const flashMaterial = new StandardMaterial("explosion-flash", scene);
  flashMaterial.emissiveColor = new Color3(1, 0.88, 0.5);
  flashMaterial.disableLighting = true;
  flashMaterial.alpha = 0.9;

  interface DebrisPiece {
    mesh: Mesh;
    velocity: Vector3;
    size: number;
  }
  const debris: DebrisPiece[] = [];
  for (let i = 0; i < 14; i += 1) {
    const size = 0.6 + (i % 4) * 0.28;
    const mesh = MeshBuilder.CreateSphere(`debris-${i}`, { diameter: size, segments: 4 }, scene);
    mesh.material = i % 3 === 0 ? smokeMaterial : fireMaterial;
    mesh.setEnabled(false);
    debris.push({ mesh, velocity: new Vector3(), size });
  }
  const flash = MeshBuilder.CreateSphere("explosion-flash-sphere", { diameter: 5, segments: 8 }, scene);
  flash.material = flashMaterial;
  flash.setEnabled(false);
  let explosionAge = -1;

  const startExplosion = (position: Vector3): void => {
    explosionAge = 0;
    for (const piece of debris) {
      piece.mesh.setEnabled(true);
      piece.mesh.scaling.setAll(1);
      piece.mesh.position.copyFrom(position);
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.25;
      const speed = 10 + Math.random() * 20;
      piece.velocity.set(Math.cos(theta) * speed, up * speed, Math.sin(theta) * speed * 0.6);
    }
    flash.setEnabled(true);
    flash.position.copyFrom(position);
    flash.scaling.setAll(1);
    flashMaterial.alpha = 0.9;
  };

  const stopExplosion = (): void => {
    explosionAge = -1;
    for (const piece of debris) piece.mesh.setEnabled(false);
    flash.setEnabled(false);
  };
  const palette = createObstaclePalette(scene);
  const obstacleMeshes = new Map<string, ObstacleMeshes>();
  let cameraX = 0;
  let elapsed = 0;

  // Bobbing chevron above the next gate/tunnel opening.
  const marker = MeshBuilder.CreateCylinder("next-marker", { diameterTop: 3.6, diameterBottom: 0, height: 2.2, tessellation: 4 }, scene);
  marker.scaling.z = 0.4;
  const markerMaterial = new StandardMaterial("next-marker-material", scene);
  markerMaterial.diffuseColor = new Color3(0.5, 0.4, 0.05);
  markerMaterial.emissiveColor = new Color3(0.85, 0.68, 0.1);
  marker.material = markerMaterial;
  marker.setEnabled(false);

  // Balloons: gold scores, green repairs. Meshes are keyed by balloon id
  // and rebuilt if the kind changes on respawn.
  const balloonGold = createStandardMaterial(scene, "balloon-gold", new Color3(0.95, 0.68, 0.12));
  balloonGold.emissiveColor = new Color3(0.3, 0.2, 0.02);
  const balloonGreen = createStandardMaterial(scene, "balloon-green", new Color3(0.24, 0.78, 0.35));
  balloonGreen.emissiveColor = new Color3(0.04, 0.22, 0.07);
  interface BalloonMeshes {
    root: TransformNode;
    kind: string;
  }
  const balloonMeshes = new Map<string, BalloonMeshes>();
  const createBalloonMeshes = (id: string, kind: string, radius: number): BalloonMeshes => {
    const root = new TransformNode(`${id}-root`, scene);
    const material = kind === "repair" ? balloonGreen : balloonGold;
    const envelope = MeshBuilder.CreateSphere(`${id}-envelope`, { diameter: radius * 2, segments: 10 }, scene);
    envelope.scaling.y = 1.16;
    envelope.material = material;
    envelope.parent = root;
    const knot = MeshBuilder.CreateCylinder(`${id}-knot`, { diameterTop: 0.7, diameterBottom: 0.2, height: 0.8, tessellation: 6 }, scene);
    knot.position.y = -radius * 1.16 - 0.3;
    knot.material = material;
    knot.parent = root;
    const string = MeshBuilder.CreateBox(`${id}-string`, { width: 0.08, height: 5, depth: 0.08 }, scene);
    string.position.y = -radius * 1.16 - 3.2;
    string.material = palette.steel;
    string.parent = root;
    return { root, kind };
  };

  // Tracer pool: identical dots, assigned to live projectiles in order.
  const tracerMaterial = new StandardMaterial("tracer-material", scene);
  tracerMaterial.emissiveColor = new Color3(1, 0.85, 0.25);
  tracerMaterial.disableLighting = true;
  const tracers: Mesh[] = [];
  for (let i = 0; i < 10; i += 1) {
    const tracer = MeshBuilder.CreateSphere(`tracer-${i}`, { diameter: 0.8, segments: 6 }, scene);
    tracer.scaling.z = 3.2;
    tracer.material = tracerMaterial;
    tracer.setEnabled(false);
    tracers.push(tracer);
  }

  // Short-lived pop flashes where balloons burst.
  interface PopFlash {
    mesh: Mesh;
    material: StandardMaterial;
    age: number;
  }
  const popFlashes: PopFlash[] = [];
  for (let i = 0; i < 4; i += 1) {
    const material = new StandardMaterial(`pop-flash-${i}`, scene);
    material.disableLighting = true;
    material.alpha = 0;
    const mesh = MeshBuilder.CreateSphere(`pop-flash-${i}`, { diameter: 6, segments: 8 }, scene);
    mesh.material = material;
    mesh.setEnabled(false);
    popFlashes.push({ mesh, material, age: -1 });
  }
  const triggerPopFlash = (position: Vector3, color: Color3): void => {
    const flashSlot = popFlashes.find((slot) => slot.age < 0) ?? popFlashes[0];
    flashSlot.age = 0;
    flashSlot.mesh.setEnabled(true);
    flashSlot.mesh.position.copyFrom(position);
    flashSlot.mesh.scaling.setAll(0.6);
    flashSlot.material.emissiveColor = color;
    flashSlot.material.alpha = 0.85;
  };

  let wasCrashed = false;

  const update = (state: GameState, dt: number): void => {
    elapsed += dt;
    planeRoot.position.set(state.plane.position.x, state.plane.position.y, state.plane.position.z);
    // Positive roll = bank right on screen; with the camera looking down -z
    // that is a positive rotation around z.
    planeRoot.rotation.set(state.plane.pitch, state.plane.yaw, state.plane.roll);
    player.propeller.rotation.z += dt * (30 + state.plane.speed * 0.35);

    // Explosion on the final hit; the plane disappears into it.
    const crashed = state.mode === "crashed";
    if (crashed && !wasCrashed) {
      startExplosion(planeRoot.position.clone());
    } else if (!crashed && wasCrashed) {
      stopExplosion();
    }
    wasCrashed = crashed;
    if (explosionAge >= 0) {
      explosionAge += dt;
      const fade = Math.max(0.01, 1 - explosionAge / 1.15);
      for (const piece of debris) {
        piece.mesh.position.addInPlace(piece.velocity.scale(dt));
        piece.velocity.y -= 40 * dt;
        piece.mesh.scaling.setAll(fade * 1.4);
      }
      flash.scaling.setAll(1 + explosionAge * 9);
      flashMaterial.alpha = Math.max(0, 0.9 - explosionAge * 2.3);
      if (explosionAge > 1.25) stopExplosion();
    }

    // Blink through the post-hit invulnerability window.
    const sinceHitMs = state.elapsedMs - state.lastHitMs;
    const blinkOff = state.mode === "flying" && sinceHitMs >= 0 && sinceHitMs < 1500 && Math.floor(state.elapsedMs / 90) % 2 === 1;
    planeRoot.setEnabled(!crashed && !blinkOff);

    // Sun-projected shadow: displaced along the light slant, softer and
    // fainter with altitude, turned with the plane's heading.
    const altitude = Math.max(0, state.plane.position.y);
    shadowRoot.position.set(
      state.plane.position.x + altitude * shadowSlantX,
      0.09,
      state.plane.position.z + altitude * shadowSlantZ,
    );
    shadowRoot.rotation.y = state.plane.yaw;
    const spread = 1 + altitude * 0.006;
    shadowRoot.scaling.set(spread, 1, spread);
    shadowMaterial.alpha = crashed ? 0 : Math.max(0.05, 0.32 - altitude * 0.0042);

    // Chase camera lags the plane slightly and leans into the bank; recent
    // hits rattle it.
    cameraX = damp(cameraX, state.plane.position.x, 7.5, dt);
    camera.position.set(cameraX, state.plane.position.y + 4.8, state.plane.position.z + 34);
    if (sinceHitMs >= 0 && sinceHitMs < 650) {
      const shakeAmp = (crashed ? 1.9 : 0.9) * (1 - sinceHitMs / 650);
      camera.position.x += Math.sin(state.elapsedMs * 0.115) * shakeAmp;
      camera.position.y += Math.sin(state.elapsedMs * 0.147 + 1.7) * shakeAmp * 0.7;
    }
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
        meshes = createObstacleMeshes(scene, obstacle, palette);
        obstacleMeshes.set(obstacle.id, meshes);
      }
      meshes.root.position.set(obstacle.position.x, obstacle.position.y, obstacle.position.z);
      meshes.root.rotation.y = obstacle.type === "bridge" ? Math.sin(obstacle.position.z * 0.03) * 0.12 : 0;
      meshes.root.setEnabled(!obstacle.passed || obstacle.position.z < state.plane.position.z + 30);
    }

    // Point the chevron at the next opening to thread.
    const next = visible.find(
      (obstacle) =>
        !obstacle.passed &&
        obstacle.position.z < state.plane.position.z - 4 &&
        (obstacle.type === "gate" || obstacle.type === "tunnel"),
    );
    marker.setEnabled(Boolean(next) && state.mode === "flying");
    if (next) {
      marker.position.set(
        next.position.x,
        next.position.y + next.height / 2 + 3 + Math.sin(elapsed * 3.2) * 0.7,
        next.position.z,
      );
    }

    const balloonIds = new Set(state.course.balloons.map((balloon) => balloon.id));
    for (const [id, meshes] of balloonMeshes) {
      if (!balloonIds.has(id)) {
        meshes.root.dispose();
        balloonMeshes.delete(id);
      }
    }

    // Balloons bob gently; popped ones vanish until they respawn ahead.
    for (const balloon of state.course.balloons) {
      let meshes = balloonMeshes.get(balloon.id);
      if (!meshes || meshes.kind !== balloon.kind) {
        meshes?.root.dispose();
        meshes = createBalloonMeshes(balloon.id, balloon.kind, balloon.radius);
        balloonMeshes.set(balloon.id, meshes);
      }
      meshes.root.position.set(
        balloon.position.x,
        balloon.position.y + Math.sin(elapsed * 1.6 + balloon.phase) * 1.1,
        balloon.position.z,
      );
      meshes.root.setEnabled(!balloon.popped);
    }

    // Assign tracer meshes to live projectiles.
    for (let i = 0; i < tracers.length; i += 1) {
      const projectile = state.projectiles[i];
      tracers[i].setEnabled(Boolean(projectile));
      if (projectile) {
        tracers[i].position.set(projectile.position.x, projectile.position.y, projectile.position.z);
      }
    }

    // Balloon-burst flashes from this frame's events, then age them out.
    for (const event of state.events) {
      if (event.type === "balloon-pop" && event.position) {
        triggerPopFlash(new Vector3(event.position.x, event.position.y, event.position.z), new Color3(1, 0.8, 0.3));
      } else if (event.type === "repair" && event.position) {
        triggerPopFlash(new Vector3(event.position.x, event.position.y, event.position.z), new Color3(0.4, 1, 0.5));
      }
    }
    for (const flashSlot of popFlashes) {
      if (flashSlot.age < 0) continue;
      flashSlot.age += dt;
      flashSlot.mesh.scaling.setAll(0.6 + flashSlot.age * 9);
      flashSlot.material.alpha = Math.max(0, 0.85 - flashSlot.age * 3.4);
      if (flashSlot.age > 0.3) {
        flashSlot.age = -1;
        flashSlot.mesh.setEnabled(false);
      }
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
