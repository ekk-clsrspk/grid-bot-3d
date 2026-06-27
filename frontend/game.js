import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { loadProgress, missions } from "./missions.js";
import { apiRequest, requirePlayer } from "./api.js";
import { setSpriteIcon, spriteIcon } from "./icons.js";

await requirePlayer();

const TILE_GAP = 1.34;
const TILE_SIZE = 1.14;
const TILE_TOP = 0.2;
const BOARD_HEIGHT = 5.2;
const MOVE_TIME = 560;
const TURN_TIME = 180;
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_DURATION = 5000;
const QUALITY_CHANGE_COOLDOWN = 8000;
const MISSION_INFO_AUTO_HIDE_MS = 10000;
const GRAPHICS_LEVELS = [
  {
    name: "HIGH",
    pixelRatio: 2,
    shadowSize: 2048,
    shadows: true,
    antialias: true,
  },
  {
    name: "BALANCED",
    pixelRatio: 1.25,
    shadowSize: 1024,
    shadows: true,
    antialias: false,
  },
  {
    name: "PERFORMANCE",
    pixelRatio: 1,
    shadowSize: 512,
    shadows: true,
    antialias: false,
  },
  {
    name: "LOW",
    pixelRatio: 0.75,
    shadowSize: 0,
    shadows: false,
    antialias: false,
  },
];

const directionMap = {
  up: { dx: 0, dz: -1, angle: Math.PI, label: "UP" },
  down: { dx: 0, dz: 1, angle: 0, label: "DOWN" },
  left: { dx: -1, dz: 0, angle: -Math.PI / 2, label: "LEFT" },
  right: { dx: 1, dz: 0, angle: Math.PI / 2, label: "RIGHT" },
};

const aliases = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};
const resetCameraDirection = new THREE.Vector3(0, 0.71, 1).normalize();
const DEVTOOLS_THRESHOLD = 220;
const ANTI_CHEAT_TOAST_COOLDOWN_MS = 900;
const SCREEN_CAPTURE_BLOCK_MS = 1400;

const dom = {
  gameScreen: document.querySelector("#game-screen"),
  floatingUi: document.querySelector("#floating-ui"),
  commandWindow: document.querySelector("#command-window"),
  scene: document.querySelector("#scene"),
  missionInfoHub: document.querySelector("#mission-info-hub"),
  missionInfoButton: document.querySelector("#mission-info-button"),
  missionNumber: document.querySelector("#mission-number"),
  missionWindowNumber: document.querySelector("#mission-window-number"),
  missionWindowName: document.querySelector("#mission-window-name"),
  missionDifficulty: document.querySelector("#mission-difficulty"),
  missionDescription: document.querySelector("#mission-description"),
  gridSize: document.querySelector("#grid-size"),
  parScore: document.querySelector("#par-score"),
  stepCount: document.querySelector("#step-count"),
  stepTarget: document.querySelector("#step-target"),
  commandInput: document.querySelector("#command-input"),
  lineCount: document.querySelector("#line-count"),
  runButton: document.querySelector("#run-button"),
  submitButton: document.querySelector("#submit-button"),
  resetButton: document.querySelector("#reset-button"),
  missionNavigation: document.querySelector("#mission-navigation"),
  previousMissionButton: document.querySelector("#previous-mission-button"),
  previousMissionLabel: document.querySelector("#previous-mission-label"),
  nextMissionButton: document.querySelector("#next-mission-button"),
  nextMissionLabel: document.querySelector("#next-mission-label"),
  missionTransitionLabel: document.querySelector("#mission-transition-label"),
  directionAxis: document.querySelector("#direction-axis"),
  resetAngleButton: document.querySelector("#reset-angle-button"),
  statusPill: document.querySelector("#status-pill"),
  toast: document.querySelector("#toast"),
  toastIcon: document.querySelector("#toast-icon"),
  toastTitle: document.querySelector("#toast-title"),
  toastMessage: document.querySelector("#toast-message"),
  loadingScreen: document.querySelector("#loading-screen"),
  loadingProgress: document.querySelector("#loading-progress"),
  loadingLabel: document.querySelector("#loading-label"),
  antiCheatBadge: document.querySelector("#anti-cheat-badge"),
  antiCheatOverlay: document.querySelector("#anti-cheat-overlay"),
  antiCheatTitle: document.querySelector("#anti-cheat-title"),
  antiCheatMessage: document.querySelector("#anti-cheat-message"),
  antiCheatResume: document.querySelector("#anti-cheat-resume"),
};

let scene;
let camera;
let renderer;
let rendererAntialiasEnabled = true;
let controls;
let keyLight;
let boardRoot;
let landscapeRoot;
let robotRoot;
let robotVisual;
let mixer;
let clock;
let currentAction;
let fallbackRobot;
let fallbackParts;
let progress = await loadProgress();
let currentMission = getInitialMission();
let playerCell = [...currentMission.start];
let running = false;
let missionChanging = false;
let renderingActive = false;
let graphicsLevel = 0;
let fpsSampleStartedAt = 0;
let fpsFrameCount = 0;
let lowFpsDuration = 0;
let qualityCooldownUntil = 0;
let qualityChangePending = false;
let runToken = 0;
let toastTimer;
let goalRing;
let startRing;
let celebrationParticles = [];
let gridLights = [];
let pointer = new THREE.Vector2(99, 99);
let raycaster = new THREE.Raycaster();
let directionGuideRotation = 0;
let directionGuideReady = false;
const directionGuideOrigin = new THREE.Vector3();
const directionGuideUp = new THREE.Vector3();
const gridUpVector = new THREE.Vector3(0, 0, -1);
let hoverTile = null;
let tileMeshes = [];
let missionInfoHovering = false;
let missionInfoFocused = false;
let missionInfoPinned = false;
let missionInfoAutoVisible = false;
let missionInfoTimer = 0;
let completedRun = null;
let attemptStartedAt = performance.now();
let antiCheatLocked = false;
let antiCheatOverlayTimer = 0;
let antiCheatToastCooldownUntil = 0;
let antiCheatStatusBeforeLock = null;
let antiCheatLastDevToolsState = false;

init();

async function init() {
  syncMissionUrl();
  setupScene();
  setupEvents();
  buildBoard();
  updateMissionUI(true);
  setWindowMinimized(dom.commandWindow, false);
  resetFloatingWindowPositions();

  try {
    await loadRobot();
  } catch (error) {
    console.warn("Robot model could not be loaded. Using the built-in fallback.", error);
    createFallbackRobot();
    dom.loadingLabel.textContent = "FALLBACK ROBOT READY";
  }

  placeRobotAtStart();
  startRenderLoop();
  dom.loadingProgress.style.width = "100%";
  window.setTimeout(() => {
    dom.loadingScreen.classList.add("hidden");
    showMissionInfoBriefly();
    showToast(
      `Mission ${currentMission.number}: ${currentMission.name}`,
      "Write commands and press RUN PROGRAM",
      "info",
      2600,
    );
  }, 350);
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x82cfff);
  scene.fog = new THREE.FogExp2(0x87cfee, 0.016);

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
  camera.position.set(8, 13.5, 10);

  createRenderer(GRAPHICS_LEVELS[graphicsLevel].antialias);
  createOrbitControls();
  clock = new THREE.Clock();

  const hemi = new THREE.HemisphereLight(0xcff7ff, 0x314d72, 3.3);
  scene.add(hemi);

  keyLight = new THREE.DirectionalLight(0xfff1d1, 5.2);
  keyLight.position.set(-8, 18, 9);
  keyLight.castShadow = true;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 45;
  keyLight.shadow.bias = -0.0003;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xb17cff, 2.8);
  rimLight.position.set(10, 8, -9);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0x4fffe8, 16, 22, 2);
  fillLight.position.set(-5, BOARD_HEIGHT + 3, 3);
  scene.add(fillLight);

  applyGraphicsLevel(false);
  createStarField();
  createLandscape();
  handleResize();
}

function createRenderer(antialias) {
  renderer = new THREE.WebGLRenderer({
    antialias,
    alpha: true,
    powerPreference: "high-performance",
  });
  rendererAntialiasEnabled = antialias;
  renderer.setClearColor(0x82cfff, 1);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, GRAPHICS_LEVELS[graphicsLevel].pixelRatio),
  );
  renderer.setSize(dom.scene.clientWidth, dom.scene.clientHeight);
  renderer.shadowMap.enabled = GRAPHICS_LEVELS[graphicsLevel].shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.setAttribute("aria-label", "Rotatable and zoomable 3D game scene");
  renderer.domElement.tabIndex = 0;
  dom.scene.append(renderer.domElement);
}

function createOrbitControls(state) {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minPolarAngle = state?.minPolarAngle ?? 0.48;
  controls.maxPolarAngle = state?.maxPolarAngle ?? 1.28;
  controls.minDistance = state?.minDistance ?? 7;
  controls.maxDistance = state?.maxDistance ?? 25;
  controls.target.copy(
    state?.target ?? new THREE.Vector3(0, BOARD_HEIGHT + 0.25, 0),
  );
  controls.update();
}

function createStarField() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];

  for (let index = 0; index < 750; index += 1) {
    const radius = 18 + Math.random() * 42;
    const angle = Math.random() * Math.PI * 2;
    positions.push(
      Math.cos(angle) * radius,
      8 + Math.random() * 24,
      Math.sin(angle) * radius,
    );
    const color = new THREE.Color().setHSL(0.48 + Math.random() * 0.18, 0.75, 0.78);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.055,
    transparent: true,
    opacity: 0.48,
    vertexColors: true,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = "star-field";
  scene.add(stars);
}

function createLandscape() {
  landscapeRoot = new THREE.Group();
  landscapeRoot.name = "colorful-landscape";
  scene.add(landscapeRoot);

  const terrainGeometry = new THREE.PlaneGeometry(92, 92, 90, 90);
  terrainGeometry.rotateX(-Math.PI / 2);
  const position = terrainGeometry.attributes.position;
  const colors = [];
  const low = new THREE.Color(0x5fd8c6);
  const mid = new THREE.Color(0x7a8fea);
  const high = new THREE.Color(0xd7a0ef);
  const peak = new THREE.Color(0xffd68c);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const distance = Math.hypot(x, z);
    const valley = Math.max(0, 12 - distance) * 0.36;
    const waves =
      Math.sin(x * 0.2) * 1.35 +
      Math.cos(z * 0.17) * 1.15 +
      Math.sin((x + z) * 0.11) * 1.7;
    const ridges = Math.pow(Math.abs(Math.sin(x * 0.075) * Math.cos(z * 0.083)), 1.8) * 5;
    const height = -6.5 + waves + ridges - valley;
    position.setY(index, height);

    const normalized = THREE.MathUtils.clamp((height + 9) / 11, 0, 1);
    const color =
      normalized < 0.38
        ? low.clone().lerp(mid, normalized / 0.38)
        : normalized < 0.72
          ? mid.clone().lerp(high, (normalized - 0.38) / 0.34)
          : high.clone().lerp(peak, (normalized - 0.72) / 0.28);
    colors.push(color.r, color.g, color.b);
  }

  terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  terrain.receiveShadow = true;
  landscapeRoot.add(terrain);

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(18, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x4bd9e5,
      emissive: 0x1b86b7,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.72,
      roughness: 0.08,
      metalness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = -6.25;
  landscapeRoot.add(lake);

  createLandscapeTrees();
  createFloatingIslands();
  createClouds();
}

function createLandscapeTrees() {
  const trunkGeometry = new THREE.CylinderGeometry(0.07, 0.1, 0.52, 6);
  const leafGeometry = new THREE.ConeGeometry(0.34, 1.15, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x704b6f, roughness: 0.9 });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x36c69d,
    emissive: 0x13604f,
    emissiveIntensity: 0.18,
    roughness: 0.8,
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 90);
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 90);
  const matrix = new THREE.Matrix4();

  for (let index = 0; index < 90; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 28;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = sampleLandscapeHeight(x, z);
    const scale = 0.65 + Math.random() * 1.15;
    matrix.compose(
      new THREE.Vector3(x, y + 0.26 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI),
      new THREE.Vector3(scale, scale, scale),
    );
    trunks.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(x, y + 0.92 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI),
      new THREE.Vector3(scale, scale, scale),
    );
    leaves.setMatrixAt(index, matrix);
  }

  trunks.castShadow = true;
  leaves.castShadow = true;
  landscapeRoot.add(trunks, leaves);
}

function createFloatingIslands() {
  const colors = [0x7457be, 0x4fa6bd, 0xc270b4, 0x6f86d8];
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.2;
    const radius = 12 + Math.random() * 14;
    const island = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.3, 0),
      new THREE.MeshStandardMaterial({
        color: colors[index % colors.length],
        roughness: 0.66,
        metalness: 0.12,
      }),
    );
    island.position.set(
      Math.cos(angle) * radius,
      -0.5 + Math.random() * 4.2,
      Math.sin(angle) * radius,
    );
    island.scale.y = 0.48 + Math.random() * 0.42;
    island.rotation.set(Math.random(), Math.random(), Math.random());
    island.castShadow = true;
    island.userData.floatOffset = Math.random() * Math.PI * 2;
    landscapeRoot.add(island);
  }
}

function createClouds() {
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffecfa,
    transparent: true,
    opacity: 0.58,
    roughness: 1,
    depthWrite: false,
  });
  for (let cloudIndex = 0; cloudIndex < 12; cloudIndex += 1) {
    const cloud = new THREE.Group();
    const angle = Math.random() * Math.PI * 2;
    const radius = 22 + Math.random() * 26;
    cloud.position.set(
      Math.cos(angle) * radius,
      7 + Math.random() * 9,
      Math.sin(angle) * radius,
    );
    for (let puff = 0; puff < 5; puff += 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.8 + Math.random() * 0.75, 12, 8),
        cloudMaterial,
      );
      mesh.position.set((puff - 2) * 0.9, Math.random() * 0.55, Math.random() * 0.5);
      cloud.add(mesh);
    }
    cloud.userData.drift = 0.05 + Math.random() * 0.08;
    landscapeRoot.add(cloud);
  }
}

function sampleLandscapeHeight(x, z) {
  const distance = Math.hypot(x, z);
  const valley = Math.max(0, 12 - distance) * 0.36;
  const waves =
    Math.sin(x * 0.2) * 1.35 +
    Math.cos(z * 0.17) * 1.15 +
    Math.sin((x + z) * 0.11) * 1.7;
  const ridges = Math.pow(Math.abs(Math.sin(x * 0.075) * Math.cos(z * 0.083)), 1.8) * 5;
  return -6.5 + waves + ridges - valley;
}

function buildBoard() {
  if (boardRoot) {
    scene.remove(boardRoot);
    disposeObject(boardRoot);
  }

  tileMeshes = [];
  gridLights.forEach((light) => scene.remove(light));
  gridLights = [];
  boardRoot = new THREE.Group();
  boardRoot.name = "mission-board";
  boardRoot.position.y = BOARD_HEIGHT;
  scene.add(boardRoot);

  const boardWidth = (currentMission.size - 1) * TILE_GAP + TILE_SIZE + 0.9;
  const baseGeometry = new RoundedBoxGeometry(boardWidth, 0.42, boardWidth, 5, 0.34);
  const baseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x94dcff,
    transparent: true,
    opacity: 0.2,
    roughness: 0.1,
    metalness: 0.05,
    transmission: 0.38,
    thickness: 1.2,
    ior: 1.32,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = -0.27;
  base.receiveShadow = true;
  boardRoot.add(base);

  const baseTrim = new THREE.Mesh(
    new RoundedBoxGeometry(boardWidth + 0.05, 0.08, boardWidth + 0.05, 4, 0.34),
    new THREE.MeshPhysicalMaterial({
      color: 0x7ff8ed,
      emissive: 0x1d938f,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.68,
      metalness: 0.22,
      roughness: 0.12,
      clearcoat: 1,
    }),
  );
  baseTrim.position.y = -0.08;
  boardRoot.add(baseTrim);

  const obstacleSet = new Set(currentMission.obstacles.map(cellKey));

  for (let row = 0; row < currentMission.size; row += 1) {
    for (let column = 0; column < currentMission.size; column += 1) {
      const key = cellKey([column, row]);
      const isObstacle = obstacleSet.has(key);
      const tile = createTile(column, row, isObstacle);
      boardRoot.add(tile);

      if (isObstacle) {
        const obstacle = createObstacle(column, row);
        boardRoot.add(obstacle);
      }
    }
  }

  startRing = createMarker(currentMission.start, "start");
  goalRing = createMarker(currentMission.goal, "goal");
  boardRoot.add(startRing, goalRing);

  createBoardCornerDetails(boardWidth);
  moveCameraForBoard();
}

function createTile(column, row, isObstacle) {
  const geometry = new RoundedBoxGeometry(TILE_SIZE, 0.19, TILE_SIZE, 3, 0.09);
  const checker = (column + row) % 2 === 0;
  const material = new THREE.MeshPhysicalMaterial({
    color: isObstacle ? 0xb05391 : checker ? 0x7dccec : 0x8faee9,
    transparent: true,
    opacity: isObstacle ? 0.45 : 0.5,
    roughness: 0.12,
    metalness: 0.06,
    transmission: isObstacle ? 0.1 : 0.3,
    thickness: 0.48,
    ior: 1.38,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: isObstacle ? 0x54143e : checker ? 0x174b6b : 0x263a78,
    emissiveIntensity: isObstacle ? 0.42 : 0.3,
  });
  const tile = new THREE.Mesh(geometry, material);
  const position = cellToWorld([column, row]);
  tile.position.set(position.x, 0.095, position.z);
  tile.receiveShadow = true;
  tile.userData = { type: "tile", column, row, isObstacle, baseColor: material.color.getHex() };
  tileMeshes.push(tile);

  const inset = new THREE.Mesh(
    new RoundedBoxGeometry(TILE_SIZE - 0.12, 0.012, TILE_SIZE - 0.12, 2, 0.07),
    new THREE.MeshBasicMaterial({
      color: isObstacle ? 0xff9bc2 : checker ? 0xc7f6ff : 0xd7dcff,
      transparent: true,
      opacity: isObstacle ? 0.24 : 0.16,
    }),
  );
  inset.position.y = 0.101;
  tile.add(inset);

  return tile;
}

function createObstacle(column, row) {
  const group = new THREE.Group();
  const position = cellToWorld([column, row]);
  group.position.set(position.x, TILE_TOP, position.z);

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.82, 0.6, 0.82, 4, 0.12),
    new THREE.MeshPhysicalMaterial({
      color: 0xf05b9b,
      emissive: 0x9b185d,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.72,
      transmission: 0.12,
      thickness: 0.7,
      metalness: 0.12,
      roughness: 0.16,
      clearcoat: 1,
    }),
  );
  body.position.y = 0.3;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cap = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.08, 0.62, 3, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffbdd8,
      emissive: 0xff4d9a,
      emissiveIntensity: 2.2,
      metalness: 0.35,
      roughness: 0.24,
    }),
  );
  cap.position.y = 0.63;
  cap.castShadow = true;
  group.add(cap);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.05, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb0bd }),
  );
  core.position.y = 0.69;
  group.add(core);

  return group;
}

function createMarker(cell, type) {
  const isGoal = type === "goal";
  const group = new THREE.Group();
  const position = cellToWorld(cell);
  group.position.set(position.x, TILE_TOP + 0.02, position.z);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.045, 16, 48),
    new THREE.MeshStandardMaterial({
      color: isGoal ? 0xffb66c : 0x8cfff6,
      emissive: isGoal ? 0xff6a35 : 0x16cfc7,
      emissiveIntensity: 3.5,
      roughness: 0.24,
      metalness: 0.25,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;
  group.add(ring);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.31, 48),
    new THREE.MeshBasicMaterial({
      color: isGoal ? 0xff7048 : 0x28d9d2,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.012;
  group.add(disc);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.5, 1.4, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: isGoal ? 0xff784d : 0x2de5dc,
      transparent: true,
      opacity: isGoal ? 0.07 : 0.035,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 0.7;
  group.add(beam);

  const label = makeLabelSprite(isGoal ? "GOAL" : "START", isGoal ? "#ff8054" : "#47e9df");
  label.position.y = isGoal ? 1.4 : 0.95;
  label.scale.set(1.2, 0.38, 1);
  group.add(label);

  const point = new THREE.PointLight(isGoal ? 0xff633b : 0x31e2da, isGoal ? 5 : 2.5, 3.6, 2);
  point.position.y = 0.55;
  group.add(point);
  gridLights.push(point);

  group.userData.type = type;
  return group;
}

function makeLabelSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, .82)";
  roundedRect(context, 76, 28, 360, 102, 28);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 4;
  roundedRect(context, 76, 28, 360, 102, 28);
  context.stroke();
  context.fillStyle = color;
  context.font = "600 45px IBM Plex Mono, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function createBoardCornerDetails(width) {
  const offset = width / 2 - 0.2;
  const positions = [
    [-offset, -offset],
    [offset, -offset],
    [-offset, offset],
    [offset, offset],
  ];

  positions.forEach(([x, z]) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 0.46, 12),
      new THREE.MeshStandardMaterial({
        color: 0x36718b,
        emissive: 0x174e68,
        emissiveIntensity: 1,
        metalness: 0.8,
        roughness: 0.25,
      }),
    );
    post.position.set(x, -0.02, z);
    boardRoot.add(post);
  });
}

function moveCameraForBoard() {
  const distance = currentMission.size * 1.42;
  const targetY = BOARD_HEIGHT + 0.15;
  camera.position.set(distance * 0.72, targetY + distance * 0.82 - 0.15, distance * 0.92);
  controls.target.set(0, targetY, 0);
  controls.minDistance = Math.max(6, currentMission.size * 0.9);
  controls.maxDistance = currentMission.size * 3;
  controls.update();
}

async function loadRobot() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(
    "./assets/RobotExpressive.glb",
    (progressEvent) => {
      if (!progressEvent.total) return;
      const percent = Math.min(92, Math.round((progressEvent.loaded / progressEvent.total) * 92));
      dom.loadingProgress.style.width = `${percent}%`;
      dom.loadingLabel.textContent = `LOADING ROBOT ${percent}%`;
    },
  );

  robotRoot = new THREE.Group();
  robotRoot.name = "grid-bot";
  robotVisual = gltf.scene;
  robotRoot.add(robotVisual);
  scene.add(robotRoot);

  robotVisual.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) {
      object.material.envMapIntensity = 0.85;
    }
  });

  const initialBox = new THREE.Box3().setFromObject(robotVisual);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const targetHeight = currentMission.size >= 9 ? 1.22 : 1.48;
  const scale = targetHeight / initialSize.y;
  robotVisual.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(robotVisual);
  robotVisual.position.y -= scaledBox.min.y;

  const glow = createRobotGlow();
  glow.position.y = 0.008;
  robotRoot.add(glow);

  mixer = new THREE.AnimationMixer(robotVisual);
  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    action.enabled = true;
  });
  setRobotAnimation("Idle", 0);
}

function createRobotGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 60);
  gradient.addColorStop(0, "rgba(54, 238, 226, .55)");
  gradient.addColorStop(0.35, "rgba(46, 197, 211, .22)");
  gradient.addColorStop(1, "rgba(20, 95, 140, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 1.25),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  return glow;
}

function createFallbackRobot() {
  robotRoot = new THREE.Group();
  robotRoot.name = "fallback-grid-bot";
  fallbackRobot = new THREE.Group();
  robotRoot.add(fallbackRobot);
  scene.add(robotRoot);

  const metal = new THREE.MeshStandardMaterial({
    color: 0xe7f2f5,
    roughness: 0.34,
    metalness: 0.65,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x172638,
    roughness: 0.4,
    metalness: 0.7,
  });
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x5ff7ed,
    emissive: 0x26d9d0,
    emissiveIntensity: 2.4,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.58, 0.36, 4, 0.12), metal);
  body.position.y = 0.92;
  fallbackRobot.add(body);

  const head = new THREE.Mesh(new RoundedBoxGeometry(0.63, 0.43, 0.42, 4, 0.14), dark);
  head.position.y = 1.48;
  fallbackRobot.add(head);

  [-0.17, 0.17].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), cyan);
    eye.position.set(x, 1.52, 0.215);
    fallbackRobot.add(eye);
  });

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), metal);
  antenna.position.y = 1.79;
  fallbackRobot.add(antenna);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), cyan);
  antennaTip.position.y = 1.9;
  fallbackRobot.add(antennaTip);

  const armLeft = makeLimb(metal, -0.39, 1.02);
  const armRight = makeLimb(metal, 0.39, 1.02);
  const legLeft = makeLimb(dark, -0.18, 0.47);
  const legRight = makeLimb(dark, 0.18, 0.47);
  fallbackRobot.add(armLeft, armRight, legLeft, legRight);
  fallbackParts = { armLeft, armRight, legLeft, legRight, head, body };

  fallbackRobot.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const glow = createRobotGlow();
  glow.position.y = 0.008;
  robotRoot.add(glow);
}

function makeLimb(material, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const limb = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.48, 0.17, 3, 0.06), material);
  limb.position.y = -0.2;
  pivot.add(limb);
  return pivot;
}

function setRobotAnimation(name, fadeDuration = 0.22) {
  if (!mixer || !robotVisual) {
    if (fallbackRobot) fallbackRobot.userData.animation = name;
    return;
  }

  const nextAction = mixer.existingAction(name);
  if (!nextAction || currentAction === nextAction) return;
  nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();

  if (currentAction && fadeDuration > 0) {
    currentAction.crossFadeTo(nextAction, fadeDuration, true);
  } else if (currentAction) {
    currentAction.stop();
  }
  currentAction = nextAction;
}

function placeRobotAtStart() {
  if (!robotRoot) return;
  playerCell = [...currentMission.start];
  const position = cellToWorld(playerCell);
  robotRoot.position.set(position.x, BOARD_HEIGHT + TILE_TOP + 0.015, position.z);
  robotRoot.rotation.y = 0;
  setRobotAnimation("Idle");
  dom.stepCount.textContent = "0";
}

function setupEvents() {
  window.addEventListener("resize", handleResize);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", handleWindowFocus);
  setupMissionInfoPopover();
  setupFloatingWindows();
  setupAntiCheat();
  dom.runButton.addEventListener("click", runProgram);
  dom.submitButton.addEventListener("click", submitScore);
  dom.resetButton.addEventListener("click", resetGame);
  dom.resetAngleButton.addEventListener("click", resetCameraAngle);
  dom.previousMissionButton.addEventListener("click", () => navigateMission(-1));
  dom.nextMissionButton.addEventListener("click", () => navigateMission(1));
  dom.commandInput.addEventListener("input", () => {
    updateLineCount();
    if (completedRun && completedRun.code !== dom.commandInput.value) {
      completedRun = null;
      dom.submitButton.disabled = true;
      setStatus("READY");
    }
  });
  document.addEventListener("visibilitychange", handleDocumentVisibility);
  document.addEventListener("keydown", handleGlobalKeydown);
  bindRendererEvents(renderer.domElement);
}

function setupAntiCheat() {
  if (dom.antiCheatResume) {
    dom.antiCheatResume.addEventListener("click", clearAntiCheatLock);
  }
  if (dom.commandInput) {
    ["copy", "cut", "paste", "drop"].forEach((eventName) => {
      dom.commandInput.addEventListener(eventName, handleCommandClipboardEvent);
    });
    dom.commandInput.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
  }
  document.addEventListener("contextmenu", handleBlockedContextMenu);
  window.setInterval(monitorDevToolsState, 1200);
  monitorDevToolsState();
}

function handleGlobalKeydown(event) {
  if (matchesInspectionShortcut(event)) {
    event.preventDefault();
    lockAntiCheat(
      "INSPECTION BLOCKED",
      "Developer tools, source view, and inspection shortcuts are disabled during missions.",
    );
    return;
  }

  if (matchesScreenCaptureShortcut(event)) {
    event.preventDefault();
    flashAntiCheatOverlay(
      "SCREEN CAPTURE BLOCKED",
      "Capture hotkeys were intercepted. Keep the challenge window active while solving.",
    );
    notifyAntiCheatToast(
      "Capture blocked",
      "Screen capture shortcuts are being monitored.",
    );
    return;
  }

  if (antiCheatLocked) {
    const resumeButtonActive = event.target === dom.antiCheatResume;
    const allowResumeKey = resumeButtonActive && [" ", "Enter", "Space", "Spacebar"].includes(event.key);
    if (!allowResumeKey && event.key !== "Tab") {
      event.preventDefault();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (!running && !missionChanging) runProgram();
    return;
  }

  if (event.key === "Escape") {
    if (isMissionInfoOpen()) {
      hideMissionInfo();
      return;
    }
    window.location.href = "./index.html";
  }
}

function matchesInspectionShortcut(event) {
  const key = event.key.toLowerCase();
  if (event.key === "F12") return true;
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && ["c", "i", "j", "k"].includes(key)) {
    return true;
  }
  if (event.metaKey && event.altKey && ["c", "i", "j"].includes(key)) {
    return true;
  }
  return (event.ctrlKey || event.metaKey) && key === "u";
}

function matchesScreenCaptureShortcut(event) {
  const key = event.key.toLowerCase();
  if (event.key === "PrintScreen") return true;
  if (event.metaKey && event.shiftKey && ["3", "4", "5", "s"].includes(key)) {
    return true;
  }
  return event.ctrlKey && event.shiftKey && key === "s";
}

function handleCommandClipboardEvent(event) {
  event.preventDefault();
  notifyAntiCheatToast(
    "Clipboard blocked",
    "Copy, cut, paste, and drag-drop are disabled inside route.bot.",
  );
}

function handleBlockedContextMenu(event) {
  event.preventDefault();
  notifyAntiCheatToast(
    "Context menu blocked",
    "Right-click actions are disabled while anti-cheat is active.",
  );
}

function setupMissionInfoPopover() {
  if (!dom.missionInfoHub || !dom.missionInfoButton) return;

  dom.missionInfoHub.addEventListener("pointerenter", () => {
    missionInfoHovering = true;
    syncMissionInfoPopover();
  });

  dom.missionInfoHub.addEventListener("pointerleave", () => {
    missionInfoHovering = false;
    syncMissionInfoPopover();
  });

  dom.missionInfoHub.addEventListener("focusin", () => {
    missionInfoFocused = true;
    syncMissionInfoPopover();
  });

  dom.missionInfoHub.addEventListener("focusout", () => {
    window.setTimeout(() => {
      missionInfoFocused = dom.missionInfoHub.contains(document.activeElement);
      syncMissionInfoPopover();
    }, 0);
  });

  dom.missionInfoButton.addEventListener("click", (event) => {
    event.preventDefault();
    missionInfoPinned = !missionInfoPinned;
    missionInfoAutoVisible = false;
    clearMissionInfoTimer();
    if (!missionInfoPinned) {
      missionInfoFocused = false;
      dom.missionInfoButton.blur();
    }
    syncMissionInfoPopover();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!missionInfoPinned) return;
    if (dom.missionInfoHub.contains(event.target)) return;
    missionInfoPinned = false;
    syncMissionInfoPopover();
  });
}

function isMissionInfoOpen() {
  return missionInfoHovering || missionInfoFocused || missionInfoPinned || missionInfoAutoVisible;
}

function syncMissionInfoPopover() {
  const open = isMissionInfoOpen();
  dom.missionInfoHub.classList.toggle("visible", open);
  dom.missionInfoButton.setAttribute("aria-expanded", String(open));
}

function clearMissionInfoTimer() {
  if (!missionInfoTimer) return;
  window.clearTimeout(missionInfoTimer);
  missionInfoTimer = 0;
}

function hideMissionInfo() {
  missionInfoHovering = false;
  missionInfoFocused = false;
  missionInfoPinned = false;
  missionInfoAutoVisible = false;
  if (dom.missionInfoHub.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  clearMissionInfoTimer();
  syncMissionInfoPopover();
}

function showMissionInfoBriefly(duration = MISSION_INFO_AUTO_HIDE_MS) {
  clearMissionInfoTimer();
  missionInfoAutoVisible = true;
  syncMissionInfoPopover();
  missionInfoTimer = window.setTimeout(() => {
    missionInfoAutoVisible = false;
    missionInfoTimer = 0;
    syncMissionInfoPopover();
  }, duration);
}

function bindRendererEvents(canvas) {
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", clearTileHover);
}

function unbindRendererEvents(canvas) {
  canvas.removeEventListener("pointermove", handlePointerMove);
  canvas.removeEventListener("pointerleave", clearTileHover);
}

async function navigateMission(offset) {
  if (running || missionChanging) return;

  const currentIndex = missions.indexOf(currentMission);
  const targetIndex = currentIndex + offset;
  if (
    targetIndex < 0 ||
    targetIndex >= missions.length ||
    targetIndex >= progress.unlocked
  ) {
    return;
  }

  const targetMission = missions[targetIndex];
  const token = ++runToken;
  missionChanging = true;
  hideToast();
  setControlsDisabled(true);
  dom.missionTransitionLabel.textContent = `MISSION ${targetMission.number}`;
  dom.gameScreen.classList.remove("mission-switch-next", "mission-switch-previous");
  dom.gameScreen.classList.add(
    "mission-switching",
    offset > 0 ? "mission-switch-next" : "mission-switch-previous",
  );

  await wait(230);
  if (token !== runToken) return;

  currentMission = targetMission;
  completedRun = null;
  attemptStartedAt = performance.now();
  dom.submitButton.disabled = true;
  syncMissionUrl();
  buildBoard();
  updateMissionUI(true);
  placeRobotAtStart();
  setStatus("READY");

  await wait(40);
  if (token !== runToken) return;
  dom.gameScreen.classList.remove("mission-switching");

  await wait(430);
  if (token !== runToken) return;
  dom.gameScreen.classList.remove("mission-switch-next", "mission-switch-previous");
  missionChanging = false;
  setControlsDisabled(false);
  showToast(
    `Mission ${currentMission.number}: ${currentMission.name}`,
    "Write commands and press RUN PROGRAM",
    "info",
    2200,
  );
}

function setupFloatingWindows() {
  let topZ = 12;

  [dom.commandWindow].forEach((windowElement) => {
    const handle = windowElement.querySelector("[data-drag-handle]");
    const minimizeButton = windowElement.querySelector(".window-minimize");

    windowElement.addEventListener("pointerdown", () => {
      topZ += 1;
      windowElement.style.zIndex = String(topZ);
    });

    minimizeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setWindowMinimized(
        windowElement,
        !windowElement.classList.contains("minimized"),
      );
      window.setTimeout(() => clampFloatingWindow(windowElement), 280);
    });

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      topZ += 1;
      windowElement.style.zIndex = String(topZ);
      windowElement.classList.add("dragging");
      handle.setPointerCapture(event.pointerId);

      const rect = windowElement.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      const move = (moveEvent) => {
        const maxX = Math.max(8, window.innerWidth - windowElement.offsetWidth - 8);
        const maxY = Math.max(8, window.innerHeight - windowElement.offsetHeight - 8);
        const x = THREE.MathUtils.clamp(moveEvent.clientX - offsetX, 8, maxX);
        const y = THREE.MathUtils.clamp(moveEvent.clientY - offsetY, 8, maxY);
        windowElement.style.setProperty("--x", `${x}px`);
        windowElement.style.setProperty("--y", `${y}px`);
      };

      const end = () => {
        windowElement.classList.remove("dragging");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  });
}

function setWindowMinimized(windowElement, minimized) {
  windowElement.classList.toggle("minimized", minimized);
  setSpriteIcon(
    windowElement.querySelector(".window-minimize"),
    minimized ? "square" : "minus",
  );
}

function resetFloatingWindowPositions() {
  const compact = window.innerWidth <= 700;
  const windowWidth = dom.commandWindow.getBoundingClientRect().width || 392;
  dom.commandWindow.style.setProperty(
    "--x",
    compact ? "10px" : `${Math.max(14, window.innerWidth - windowWidth - 28)}px`,
  );
  dom.commandWindow.style.setProperty("--y", compact ? "143px" : "34px");
  clampFloatingWindow(dom.commandWindow);
}

function clampFloatingWindow(windowElement) {
  const rect = windowElement.getBoundingClientRect();
  const maxX = Math.max(8, window.innerWidth - rect.width - 8);
  const maxY = Math.max(8, window.innerHeight - rect.height - 8);
  windowElement.style.setProperty("--x", `${THREE.MathUtils.clamp(rect.left, 8, maxX)}px`);
  windowElement.style.setProperty("--y", `${THREE.MathUtils.clamp(rect.top, 8, maxY)}px`);
}

function handlePointerMove(event) {
  if (running) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(tileMeshes, false);
  const nextHover = intersections[0]?.object ?? null;

  if (hoverTile === nextHover) return;
  clearTileHover();
  hoverTile = nextHover;
  if (hoverTile && !hoverTile.userData.isObstacle) {
    hoverTile.material.emissive.setHex(0x123e50);
    hoverTile.material.emissiveIntensity = 0.8;
  }
}

function clearTileHover() {
  if (!hoverTile) return;
  hoverTile.material.emissive.setHex(
    hoverTile.userData.isObstacle
      ? 0x54143e
      : (hoverTile.userData.column + hoverTile.userData.row) % 2 === 0
        ? 0x174b6b
        : 0x263a78,
  );
  hoverTile.material.emissiveIntensity = hoverTile.userData.isObstacle ? 0.42 : 0.3;
  hoverTile = null;
}

function updateMissionUI(clearCommands = false) {
  dom.missionNumber.textContent = currentMission.number;
  dom.missionWindowNumber.textContent = currentMission.number;
  dom.missionWindowName.textContent = currentMission.name;
  dom.missionDifficulty.innerHTML = renderStars(currentMission.difficulty);
  dom.missionDescription.textContent = currentMission.description;
  dom.gridSize.textContent = `${currentMission.size} × ${currentMission.size}`;
  dom.parScore.textContent = `${currentMission.par} STEPS`;
  dom.stepTarget.textContent = `/ ${currentMission.par}`;
  if (clearCommands) dom.commandInput.value = "";
  updateLineCount();
  updateMissionNavigation();
}

function updateLineCount() {
  const count = Math.max(1, dom.commandInput.value.split(/\r?\n/).length);
  dom.lineCount.textContent = `${count} ${count === 1 ? "LINE" : "LINES"}`;
}

function updateMissionNavigation() {
  const currentIndex = missions.indexOf(currentMission);
  const previousMission = missions[currentIndex - 1];
  const nextMission = missions[currentIndex + 1];
  const hasCompletedCurrent = (progress.stars[currentMission.id] ?? 0) > 0;
  const canGoPrevious = Boolean(previousMission);
  const canGoNext =
    Boolean(nextMission) &&
    hasCompletedCurrent &&
    currentIndex + 1 < progress.unlocked;

  dom.previousMissionButton.hidden = !canGoPrevious;
  dom.nextMissionButton.hidden = !canGoNext;
  dom.missionNavigation.hidden = !canGoPrevious && !canGoNext;
  dom.missionNavigation.classList.toggle(
    "single",
    Number(canGoPrevious) + Number(canGoNext) === 1,
  );

  if (previousMission) {
    dom.previousMissionLabel.textContent = `MISSION ${previousMission.number}`;
    dom.previousMissionButton.setAttribute(
      "aria-label",
      `Go to previous mission ${previousMission.name}`,
    );
  }
  if (nextMission) {
    dom.nextMissionLabel.textContent = `MISSION ${nextMission.number}`;
    dom.nextMissionButton.setAttribute(
      "aria-label",
      `Go to next mission ${nextMission.name}`,
    );
  }
}

async function runProgram() {
  if (running || !robotRoot) return;

  const parsed = parseCommands(dom.commandInput.value);
  if (parsed.error) {
    setStatus("SYNTAX ERROR", "error");
    showToast("Invalid commands", parsed.error, "error", 4200);
    return;
  }
  if (parsed.commands.length === 0) {
    setStatus("NO COMMAND", "error");
    showToast("No commands yet", "Try typing right or down on separate lines.", "error", 3000);
    return;
  }

  const token = ++runToken;
  completedRun = null;
  dom.submitButton.disabled = true;
  running = true;
  clearTileHover();
  setControlsDisabled(true);
  placeRobotAtStart();
  setStatus("RUNNING", "running");
  hideToast();
  await wait(250);

  let steps = 0;
  for (const commandName of parsed.commands) {
    if (token !== runToken) return;

    const direction = directionMap[commandName];
    const nextCell = [playerCell[0] + direction.dx, playerCell[1] + direction.dz];
    const invalidReason = validateCell(nextCell);

    if (invalidReason) {
      await animateBlockedMove(direction, token);
      if (token !== runToken) return;
      setRobotAnimation("Idle");
      setStatus("BLOCKED", "error");
      showToast(
        "Path blocked",
        invalidReason === "wall"
          ? `${direction.label} hit an energy wall`
          : `${direction.label} moved the robot off the board`,
        "error",
        4200,
      );
      finishRun();
      return;
    }

    await animateMove(nextCell, direction.angle, token);
    if (token !== runToken) return;
    playerCell = nextCell;
    steps += 1;
    dom.stepCount.textContent = String(steps);

    if (sameCell(playerCell, currentMission.goal)) {
      setRobotAnimation("Dance", 0.25);
      setStatus("MISSION CLEAR", "success");
      const result = completeMission(steps);
      completedRun = {
        missionId: currentMission.id,
        code: dom.commandInput.value,
        durationMs: Math.max(0, Math.round(performance.now() - attemptStartedAt)),
        steps,
        stars: result.stars,
        submitted: false,
      };
      celebrate();
      showToast(
        "MISSION CLEAR!",
        `Reached the goal in ${steps} steps • earned ${result.stars} stars • press SUBMIT to save the run`,
        "success",
        6000,
      );
      finishRun();
      return;
    }
  }

  setRobotAnimation("Idle");
  setStatus("INCOMPLETE", "error");
  showToast(
    "Goal not reached",
    "The robot finished every command. Add a few more moves.",
    "error",
    4200,
  );
  finishRun();
}

function finishRun() {
  running = false;
  setControlsDisabled(false);
}

function completeMission(steps) {
  const stars =
    steps <= currentMission.par
      ? 3
      : steps <= currentMission.par + Math.max(2, Math.ceil(currentMission.par * 0.25))
        ? 2
        : 1;
  return { stars };
}

async function submitScore() {
  if (!completedRun || completedRun.submitted || running) return;

  dom.submitButton.disabled = true;
  setStatus("SUBMITTING", "running");
  try {
    const unlockedBefore = progress.unlocked;
    const response = await apiRequest("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        mission_id: completedRun.missionId,
        code: completedRun.code,
        duration_ms: completedRun.durationMs,
      }),
    });
    progress = response.progress;
    completedRun.submitted = true;
    updateMissionNavigation();
    setStatus("SUBMITTED", "success");
    showToast(
      "Run saved",
      `${response.submission.steps} steps • ${response.submission.stars} stars${
        progress.unlocked > unlockedBefore ? " • next mission unlocked" : ""
      }`,
      "success",
      5000,
    );
  } catch (error) {
    setStatus("SUBMIT ERROR", "error");
    showToast("Run submit failed", error.message, "error", 5000);
    dom.submitButton.disabled = false;
  }
}

function resetGame() {
  runToken += 1;
  running = false;
  completedRun = null;
  attemptStartedAt = performance.now();
  dom.submitButton.disabled = true;
  setControlsDisabled(false);
  placeRobotAtStart();
  setStatus("READY");
  showToast("Reset complete", "Robot returned to START", "info", 1800);
}

function resetCameraAngle() {
  if (!camera || !controls) return;

  const targetY = BOARD_HEIGHT + 0.15;
  const currentDistance = THREE.MathUtils.clamp(
    camera.position.distanceTo(controls.target),
    Math.max(6, currentMission.size * 0.9),
    currentMission.size * 3,
  );

  controls.target.set(0, targetY, 0);
  camera.position.copy(controls.target).addScaledVector(resetCameraDirection, currentDistance);
  controls.update();
}

function setControlsDisabled(disabled) {
  dom.runButton.disabled = disabled;
  dom.submitButton.disabled =
    disabled || !completedRun || completedRun.submitted;
  dom.commandInput.disabled = disabled;
  dom.previousMissionButton.disabled = disabled;
  dom.nextMissionButton.disabled = disabled;
  if (!disabled) updateMissionNavigation();
}

function parseCommands(source) {
  const lines = source.split(/\r?\n/);
  const commands = [];

  const getCommand = (line) => {
    const normalized = line
      .trim()
      .toLowerCase()
      .replace(/[;,]+$/, "");
    return aliases[normalized] ?? null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) continue;

    const repeatMatch = raw.toLowerCase().match(/^repeat\s+(\d+)\s*:?$/);
    if (repeatMatch) {
      const amount = Number(repeatMatch[1]);
      if (amount < 1 || amount > 50) {
        return { error: `Line ${index + 1}: repeat must be between 1 and 50` };
      }

      let nextIndex = index + 1;
      while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
      const repeatedCommand = getCommand(lines[nextIndex] ?? "");
      if (!repeatedCommand) {
        return { error: `Line ${index + 1}: repeat must be followed by a command on the next line` };
      }
      commands.push(...Array(amount).fill(repeatedCommand));
      index = nextIndex;
    } else {
      const multipliedMatch = raw.toLowerCase().match(/^(up|down|left|right)\s+(?:x\s*)?(\d+)$/);
      if (multipliedMatch) {
        const amount = Number(multipliedMatch[2]);
        if (amount < 1 || amount > 50) {
          return { error: `Line ${index + 1}: step count must be between 1 and 50` };
        }
        commands.push(...Array(amount).fill(multipliedMatch[1]));
      } else {
        const command = getCommand(raw);
        if (!command) {
          return { error: `Line ${index + 1}: unknown command "${raw}"` };
        }
        commands.push(command);
      }
    }

    if (commands.length > 100) {
      return { error: "Program is too long — limit is 100 steps" };
    }
  }

  return { commands };
}

function validateCell(cell) {
  const [column, row] = cell;
  if (
    column < 0 ||
    row < 0 ||
    column >= currentMission.size ||
    row >= currentMission.size
  ) {
    return "edge";
  }
  if (currentMission.obstacles.some((obstacle) => sameCell(obstacle, cell))) {
    return "wall";
  }
  return null;
}

async function animateMove(nextCell, targetAngle, token) {
  setRobotAnimation("Walking", 0.18);
  await rotateRobot(targetAngle, token);
  if (token !== runToken) return;

  const start = robotRoot.position.clone();
  const end = cellToWorld(nextCell);
  end.y = BOARD_HEIGHT + TILE_TOP + 0.015;
  const startedAt = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      if (token !== runToken) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - startedAt) / MOVE_TIME);
      const eased = easeInOut(progress);
      robotRoot.position.lerpVectors(start, end, eased);
      robotRoot.position.y += Math.sin(progress * Math.PI) * 0.025;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        robotRoot.position.copy(end);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

async function rotateRobot(targetAngle, token) {
  const startAngle = robotRoot.rotation.y;
  const difference = shortestAngle(targetAngle - startAngle);
  if (Math.abs(difference) < 0.01) return;
  const startedAt = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      if (token !== runToken) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - startedAt) / TURN_TIME);
      robotRoot.rotation.y = startAngle + difference * easeOut(progress);
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        robotRoot.rotation.y = targetAngle;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

async function animateBlockedMove(direction, token) {
  setRobotAnimation("Walking", 0.14);
  await rotateRobot(direction.angle, token);
  if (token !== runToken) return;

  const origin = robotRoot.position.clone();
  const offset = new THREE.Vector3(direction.dx * 0.18, 0, direction.dz * 0.18);
  const startedAt = performance.now();
  const duration = 420;

  return new Promise((resolve) => {
    function frame(now) {
      if (token !== runToken) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - startedAt) / duration);
      const amount = Math.sin(progress * Math.PI);
      robotRoot.position.copy(origin).addScaledVector(offset, amount);
      robotRoot.rotation.z = Math.sin(progress * Math.PI * 4) * 0.035;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        robotRoot.position.copy(origin);
        robotRoot.rotation.z = 0;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function celebrate() {
  const goalPosition = cellToWorld(currentMission.goal);
  const colors = [0x41e8e0, 0x4e83ff, 0xff884d, 0x68edbd, 0xffd36b];

  for (let index = 0; index < 42; index += 1) {
    const particle = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.1, 0.025),
      new THREE.MeshBasicMaterial({ color: colors[index % colors.length] }),
    );
    particle.position.set(
      goalPosition.x + (Math.random() - 0.5) * 0.5,
      BOARD_HEIGHT + 0.7 + Math.random() * 0.5,
      goalPosition.z + (Math.random() - 0.5) * 0.5,
    );
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2.2,
      1.8 + Math.random() * 2,
      (Math.random() - 0.5) * 2.2,
    );
    particle.userData.life = 1.8 + Math.random() * 0.8;
    particle.userData.age = 0;
    scene.add(particle);
    celebrationParticles.push(particle);
  }
}

function updateCelebration(delta) {
  celebrationParticles = celebrationParticles.filter((particle) => {
    particle.userData.age += delta;
    particle.userData.velocity.y -= 3.5 * delta;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += delta * 6;
    particle.rotation.z += delta * 4;
    const remaining = 1 - particle.userData.age / particle.userData.life;
    particle.material.opacity = Math.max(0, remaining);
    particle.material.transparent = true;

    if (particle.userData.age >= particle.userData.life) {
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
      return false;
    }
    return true;
  });
}

function setStatus(text, type = "") {
  dom.statusPill.textContent = text;
  dom.statusPill.className = `status-pill${type ? ` ${type}` : ""}`;
}

function captureStatusState() {
  let type = "";
  if (dom.statusPill.classList.contains("running")) type = "running";
  else if (dom.statusPill.classList.contains("error")) type = "error";
  else if (dom.statusPill.classList.contains("success")) type = "success";
  return { text: dom.statusPill.textContent, type };
}

function showToast(title, message, type = "info", duration = 3000) {
  window.clearTimeout(toastTimer);
  dom.toastTitle.textContent = title;
  dom.toastMessage.textContent = message;
  setSpriteIcon(
    dom.toastIcon,
    type === "success" ? "check" : type === "error" ? "triangle-alert" : "info",
  );
  dom.toast.className = `toast visible${type !== "info" ? ` ${type}` : ""}`;
  toastTimer = window.setTimeout(hideToast, duration);
}

function hideToast() {
  dom.toast.classList.remove("visible");
}

function notifyAntiCheatToast(title, message, duration = 1800) {
  const now = Date.now();
  if (now < antiCheatToastCooldownUntil) return;
  antiCheatToastCooldownUntil = now + ANTI_CHEAT_TOAST_COOLDOWN_MS;
  showToast(title, message, "error", duration);
}

function flashAntiCheatOverlay(title, message, duration = SCREEN_CAPTURE_BLOCK_MS) {
  if (antiCheatLocked || !dom.antiCheatOverlay) return;

  window.clearTimeout(antiCheatOverlayTimer);
  dom.antiCheatTitle.textContent = title;
  dom.antiCheatMessage.textContent = message;
  dom.antiCheatResume.hidden = true;
  dom.antiCheatOverlay.hidden = false;
  dom.antiCheatOverlay.classList.add("visible");

  antiCheatOverlayTimer = window.setTimeout(() => {
    if (antiCheatLocked) return;
    dom.antiCheatOverlay.classList.remove("visible");
    dom.antiCheatOverlay.hidden = true;
    dom.antiCheatResume.hidden = false;
  }, duration);
}

function lockAntiCheat(title, message) {
  if (!dom.antiCheatOverlay || !dom.gameScreen) return;

  window.clearTimeout(antiCheatOverlayTimer);
  if (!antiCheatLocked) {
    antiCheatStatusBeforeLock = captureStatusState();
  }

  antiCheatLocked = true;
  dom.antiCheatTitle.textContent = title;
  dom.antiCheatMessage.textContent = message;
  dom.antiCheatResume.hidden = false;
  dom.antiCheatOverlay.hidden = false;
  dom.antiCheatOverlay.classList.add("visible");
  dom.gameScreen.classList.add("anti-cheat-locked");
  hideMissionInfo();
  dom.commandInput.blur();

  if (running) {
    runToken += 1;
    running = false;
    completedRun = null;
    dom.submitButton.disabled = true;
  }

  setStatus("LOCKED", "error");
  stopRenderLoop();
  window.requestAnimationFrame(() => dom.antiCheatResume?.focus());
}

function clearAntiCheatLock() {
  if (!antiCheatLocked) return;

  if (document.hidden || !document.hasFocus()) {
    lockAntiCheat(
      "WINDOW UNFOCUSED",
      "Return to the challenge window before resuming the mission.",
    );
    return;
  }

  if (isDevToolsProbablyOpen()) {
    lockAntiCheat(
      "INSPECTION BLOCKED",
      "Close the inspection panel or DevTools window before resuming.",
    );
    return;
  }

  antiCheatLocked = false;
  dom.antiCheatOverlay.classList.remove("visible");
  dom.antiCheatOverlay.hidden = true;
  dom.gameScreen.classList.remove("anti-cheat-locked");

  if (antiCheatStatusBeforeLock) {
    setStatus(antiCheatStatusBeforeLock.text, antiCheatStatusBeforeLock.type);
    antiCheatStatusBeforeLock = null;
  }

  dom.antiCheatResume.hidden = false;
  startRenderLoop();
  showToast("Session resumed", "Anti-cheat lock cleared.", "success", 1500);
}

function isDevToolsProbablyOpen() {
  if (window.innerWidth < 700 || document.hidden) return false;
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return widthGap > DEVTOOLS_THRESHOLD || heightGap > DEVTOOLS_THRESHOLD;
}

function monitorDevToolsState() {
  const devToolsOpen = isDevToolsProbablyOpen();
  if (devToolsOpen && !antiCheatLastDevToolsState) {
    lockAntiCheat(
      "INSPECTION BLOCKED",
      "Developer tools or an inspection panel was detected. Close it to continue.",
    );
  }
  antiCheatLastDevToolsState = devToolsOpen;
}

function startRenderLoop() {
  if (renderingActive || !renderer || document.hidden || antiCheatLocked) return;
  renderingActive = true;
  clock.start();
  resetPerformanceMonitor();

  renderer.setAnimationLoop((timestamp) => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    monitorPerformance(timestamp);
    controls.update();
    updateDirectionGuide();
    if (mixer) mixer.update(delta);
    updateFallbackAnimation(elapsed);
    updateCelebration(delta);

    if (goalRing) {
      goalRing.rotation.y += delta * 0.35;
      const pulse = 1 + Math.sin(elapsed * 3.5) * 0.045;
      goalRing.scale.setScalar(pulse);
    }
    if (startRing) {
      startRing.rotation.y -= delta * 0.18;
    }

    const stars = scene.getObjectByName("star-field");
    if (stars) stars.rotation.y += delta * 0.003;
    updateLandscape(elapsed, delta);

    renderer.render(scene, camera);
  });
}

function stopRenderLoop() {
  if (!renderingActive || !renderer) return;
  renderer.setAnimationLoop(null);
  renderingActive = false;
  clock.stop();
  resetPerformanceMonitor();
}

function handleDocumentVisibility() {
  if (document.hidden) {
    lockAntiCheat(
      "WINDOW UNFOCUSED",
      "Focus left the challenge window. Resume once you are back in the mission.",
    );
    stopRenderLoop();
    return;
  }

  if (!antiCheatLocked) startRenderLoop();
}

function handleWindowBlur() {
  lockAntiCheat(
    "WINDOW UNFOCUSED",
    "Focus left the challenge window. Resume once you are back in the mission.",
  );
}

function handleWindowFocus() {
  if (!antiCheatLocked) startRenderLoop();
}

function updateDirectionGuide() {
  if (!dom.directionAxis || !controls) return;

  directionGuideOrigin.copy(controls.target).project(camera);
  directionGuideUp
    .copy(controls.target)
    .add(gridUpVector)
    .project(camera);

  const screenX = directionGuideUp.x - directionGuideOrigin.x;
  const screenY = -(directionGuideUp.y - directionGuideOrigin.y);
  if (Math.hypot(screenX, screenY) < 0.0001) return;

  const rawRotation = THREE.MathUtils.radToDeg(
    Math.atan2(screenY, screenX),
  ) + 90;

  if (!directionGuideReady) {
    directionGuideRotation = rawRotation;
    directionGuideReady = true;
  } else {
    const normalizedRotation =
      ((directionGuideRotation % 360) + 360) % 360;
    const delta = ((rawRotation - normalizedRotation + 540) % 360) - 180;
    directionGuideRotation += delta;
  }

  dom.directionAxis.style.setProperty(
    "--compass-rotation",
    `${directionGuideRotation}deg`,
  );
  dom.directionAxis.style.setProperty(
    "--compass-counter-rotation",
    `${-directionGuideRotation}deg`,
  );
}

function resetPerformanceMonitor() {
  fpsSampleStartedAt = 0;
  fpsFrameCount = 0;
  lowFpsDuration = 0;
}

function monitorPerformance(timestamp) {
  if (!Number.isFinite(timestamp) || qualityChangePending) return;

  if (!fpsSampleStartedAt) {
    fpsSampleStartedAt = timestamp;
    fpsFrameCount = 0;
  }

  fpsFrameCount += 1;
  const sampleDuration = timestamp - fpsSampleStartedAt;
  if (sampleDuration < 1000) return;

  const averageFps = (fpsFrameCount * 1000) / sampleDuration;
  fpsSampleStartedAt = timestamp;
  fpsFrameCount = 0;

  if (timestamp < qualityCooldownUntil) {
    lowFpsDuration = 0;
    return;
  }

  if (averageFps < LOW_FPS_THRESHOLD) {
    lowFpsDuration += sampleDuration;
  } else {
    lowFpsDuration = 0;
  }

  if (
    lowFpsDuration >= LOW_FPS_DURATION &&
    graphicsLevel < GRAPHICS_LEVELS.length - 1
  ) {
    scheduleGraphicsDowngrade(averageFps);
  }
}

function scheduleGraphicsDowngrade(measuredFps) {
  if (qualityChangePending) return;
  qualityChangePending = true;

  window.setTimeout(() => {
    graphicsLevel = Math.min(graphicsLevel + 1, GRAPHICS_LEVELS.length - 1);
    applyGraphicsLevel(true);
    qualityCooldownUntil = performance.now() + QUALITY_CHANGE_COOLDOWN;
    qualityChangePending = false;
    resetPerformanceMonitor();

    const quality = GRAPHICS_LEVELS[graphicsLevel];
    showToast(
      `Graphics set to ${quality.name}`,
      `Average FPS dropped to ${Math.round(measuredFps)} — lowering quality for smoother play`,
      "info",
      3600,
    );
  }, 0);
}

function applyGraphicsLevel(allowRendererRecreation = true) {
  if (!renderer) return;
  const quality = GRAPHICS_LEVELS[graphicsLevel];

  if (
    allowRendererRecreation &&
    rendererAntialiasEnabled !== quality.antialias
  ) {
    recreateRenderer(quality.antialias);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  renderer.shadowMap.enabled = quality.shadows;

  if (keyLight) {
    keyLight.castShadow = quality.shadows;
    if (quality.shadows) {
      keyLight.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    }
    if (keyLight.shadow.map) {
      keyLight.shadow.map.dispose();
      keyLight.shadow.map = null;
    }
  }

  handleResize();
}

function recreateRenderer(antialias) {
  const shouldResume = renderingActive && !document.hidden;
  const controlState = controls
    ? {
        target: controls.target.clone(),
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        minPolarAngle: controls.minPolarAngle,
        maxPolarAngle: controls.maxPolarAngle,
      }
    : undefined;
  const oldRenderer = renderer;
  const oldCanvas = oldRenderer.domElement;

  stopRenderLoop();
  unbindRendererEvents(oldCanvas);
  controls?.dispose();
  oldCanvas.remove();
  oldRenderer.dispose();

  createRenderer(antialias);
  createOrbitControls(controlState);
  bindRendererEvents(renderer.domElement);
  applyGraphicsLevel(false);

  if (shouldResume) startRenderLoop();
}

function updateLandscape(elapsed, delta) {
  if (!landscapeRoot) return;
  landscapeRoot.children.forEach((child) => {
    if (child.userData.floatOffset !== undefined) {
      child.position.y += Math.sin(elapsed * 0.65 + child.userData.floatOffset) * delta * 0.08;
      child.rotation.y += delta * 0.03;
    }
    if (child.userData.drift !== undefined) {
      child.position.x += child.userData.drift * delta;
      if (child.position.x > 48) child.position.x = -48;
    }
  });
}

function updateFallbackAnimation(elapsed) {
  if (!fallbackRobot || !fallbackParts) return;
  const animation = fallbackRobot.userData.animation || "Idle";

  if (animation === "Walking") {
    const swing = Math.sin(elapsed * 9) * 0.58;
    fallbackParts.armLeft.rotation.x = swing;
    fallbackParts.armRight.rotation.x = -swing;
    fallbackParts.legLeft.rotation.x = -swing;
    fallbackParts.legRight.rotation.x = swing;
    fallbackParts.body.position.y = 0.92 + Math.abs(Math.sin(elapsed * 9)) * 0.025;
  } else if (animation === "Dance") {
    fallbackRobot.rotation.y += 0.035;
    fallbackParts.armLeft.rotation.z = -1.2 + Math.sin(elapsed * 7) * 0.25;
    fallbackParts.armRight.rotation.z = 1.2 - Math.sin(elapsed * 7) * 0.25;
    fallbackParts.body.position.y = 0.92 + Math.abs(Math.sin(elapsed * 5)) * 0.08;
  } else {
    fallbackParts.armLeft.rotation.x *= 0.88;
    fallbackParts.armRight.rotation.x *= 0.88;
    fallbackParts.legLeft.rotation.x *= 0.88;
    fallbackParts.legRight.rotation.x *= 0.88;
    fallbackParts.armLeft.rotation.z *= 0.88;
    fallbackParts.armRight.rotation.z *= 0.88;
    fallbackParts.body.position.y = 0.92 + Math.sin(elapsed * 2.2) * 0.008;
    fallbackParts.head.rotation.y = Math.sin(elapsed * 0.8) * 0.08;
  }
}

function handleResize() {
  if (!renderer || !camera) return;
  const width = dom.scene.clientWidth;
  const height = dom.scene.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, GRAPHICS_LEVELS[graphicsLevel].pixelRatio),
  );
  clampFloatingWindow(dom.commandWindow);
  monitorDevToolsState();
}

function getInitialMission() {
  const requestedMissionId = new URLSearchParams(window.location.search).get(
    "mission",
  );
  const requestedIndex = missions.findIndex(
    (mission) => mission.id === requestedMissionId,
  );

  if (requestedIndex >= 0 && requestedIndex < progress.unlocked) {
    return missions[requestedIndex];
  }
  return missions[0];
}

function syncMissionUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("mission", currentMission.id);
  window.history.replaceState(null, "", url);
  document.title = `Grid Bot 3D — Mission ${currentMission.number}: ${currentMission.name}`;
}

function renderStars(amount) {
  return [1, 2, 3]
    .map((star) => spriteIcon("star", { className: star <= amount ? "icon-fill" : "" }))
    .join("");
}

function cellToWorld([column, row]) {
  const offset = (currentMission.size - 1) / 2;
  return new THREE.Vector3(
    (column - offset) * TILE_GAP,
    0,
    (row - offset) * TILE_GAP,
  );
}

function cellKey([column, row]) {
  return `${column},${row}`;
}

function sameCell(first, second) {
  return first[0] === second[0] && first[1] === second[1];
}

function shortestAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOut(value) {
  return 1 - Math.pow(1 - value, 3);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}
