// game.js — Owner: B (friend)
// The laptop screen: 3D scene, camera, game loop, HUD, level menu, and keyboard controls.
// Phone input arrives over WebSocket. The keyboard always works too.

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CONFIG } from "./config.js";
import { Car } from "./car.js";
import { fetchLevelList, fetchLevel, buildLevel, updateLevel, removeLevel } from "./levels.js";
import { MSG, DRIVE_MODES, makeInput, cleanInput, makeState, parseMessage, socketUrl } from "./shared/protocol.js";

// ---------- Renderer, scene, lights ----------

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color("#4f93dc");
const SKY_HORIZON = new THREE.Color("#d4e6f7");
scene.fog = new THREE.Fog(SKY_HORIZON, 180, 750);
const sky = makeSky();
scene.add(sky);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.baseFov, window.innerWidth / window.innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x3a3f47, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 250;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
const SUN_OFFSET = new THREE.Vector3(-40, 90, -30); // the sun follows the car so shadows stay sharp

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Physics and the car ----------

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -CONFIG.physics.gravity, z: 0 });
world.timestep = CONFIG.physics.timestep;
const car = new Car(RAPIER, world, scene);

// ---------- HUD elements ----------

const hud = {
  speed: document.getElementById("speed"),
  fans: document.getElementById("fans"),
  tankBar: document.getElementById("tankBar"),
  tankFill: document.getElementById("tankFill"),
  altitude: document.getElementById("altitude"),
  source: document.getElementById("source"),
  levelSelect: document.getElementById("levelSelect"),
  goalText: document.getElementById("goalText"),
  help: document.getElementById("help"),
  phoneCard: document.getElementById("phoneCard"),
  qr: document.getElementById("qr"),
  phoneUrl: document.getElementById("phoneUrl"),
  phoneStatus: document.getElementById("phoneStatus"),
  message: document.getElementById("message"),
  tip: document.getElementById("tip"),
  loading: document.getElementById("loading"),
};
const modeButtons = document.querySelectorAll("#modes button");
for (const button of modeButtons) {
  button.addEventListener("click", function () {
    setMode(button.dataset.mode);
    button.blur(); // so Space doesn't "click" it again
  });
}

let messageTimer = null;
function showMessage(text, seconds) {
  hud.message.textContent = text;
  hud.message.classList.add("show");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(function () {
    hud.message.classList.remove("show");
  }, seconds * 1000);
}

// ---------- Keyboard ----------

const keys = {}; // which keys are held down right now

// Called once everything has loaded.
function listenToKeyboard() {
  window.addEventListener("keydown", function (event) {
    if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT") {
      return;
    }
    if (!event.repeat) {
      handleKeyPress(event.code);
    }
    keys[event.code] = true;
    if (event.code === "Space" || event.code.startsWith("Arrow")) {
      event.preventDefault(); // don't scroll the page
    }
  });
  window.addEventListener("keyup", function (event) {
    keys[event.code] = false;
  });
  window.addEventListener("blur", function () {
    // Switching windows can swallow keyup events, so let go of everything.
    for (const code of Object.keys(keys)) {
      keys[code] = false;
    }
  });
}

function handleKeyPress(code) {
  if (code === "KeyF") {
    car.fansOn = !car.fansOn;
  } else if (code === "KeyR") {
    car.reset();
  } else if (code === "KeyC") {
    cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
    showMessage("Camera: " + CAMERA_MODES[cameraModeIndex], 1.2);
  } else if (code === "Digit1") {
    setMode("performance");
  } else if (code === "Digit2") {
    setMode("thrust");
  } else if (code === "Digit3") {
    setMode("rocket");
  } else if (code === "KeyL") {
    loadLevel((currentLevelIndex + 1) % levelList.length);
  } else if (code === "KeyH") {
    hud.help.classList.toggle("hidden");
  }
}

function readKeyboard() {
  const input = makeInput();
  if (keys.KeyA || keys.ArrowLeft) {
    input.steer = input.steer - 1;
  }
  if (keys.KeyD || keys.ArrowRight) {
    input.steer = input.steer + 1;
  }
  if (keys.KeyW) {
    input.gas = 1;
  }
  if (keys.KeyS) {
    input.brake = 1;
  }
  if (keys.Space) {
    input.thrust = true;
  }
  // Arrow up = "push the stick forward" (lean forward), like the phone tilted forward.
  if (keys.ArrowUp) {
    input.pitch = input.pitch - 1;
  }
  if (keys.ArrowDown) {
    input.pitch = input.pitch + 1;
  }
  return input;
}

// ---------- Phone (over WebSocket) ----------

const phone = {
  input: makeInput(),
  lastMessageTime: -100000,
  lastFans: false,
  lastReset: false,
  wasActive: false,
  count: 0,
};
let socket = null;

function connectSocket() {
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", function () {
    socket.send(JSON.stringify({ type: MSG.HELLO, role: "game" }));
  });
  socket.addEventListener("message", function (event) {
    const msg = parseMessage(event.data);
    if (msg) {
      handleSocketMessage(msg);
    }
  });
  socket.addEventListener("close", function () {
    // The server restarted or the network blipped. Try again shortly.
    setTimeout(connectSocket, 1500);
  });
}

function handleSocketMessage(msg) {
  if (msg.type === MSG.INPUT) {
    const input = cleanInput(msg);
    // FANS on the phone is a toggle, so only react when it changes.
    if (input.fans !== phone.lastFans) {
      car.fansOn = input.fans;
      phone.lastFans = input.fans;
    }
    if (input.reset && !phone.lastReset) {
      car.reset();
    }
    phone.lastReset = input.reset;
    phone.input = input;
    phone.lastMessageTime = performance.now();
  } else if (msg.type === MSG.MODE) {
    if (DRIVE_MODES.includes(msg.mode)) {
      setMode(msg.mode);
    }
  } else if (msg.type === MSG.STATUS) {
    phone.count = msg.phones;
    updatePhoneStatus();
  } else if (msg.type === MSG.TIP) {
    hud.tip.textContent = msg.text;
    hud.tip.style.display = "block";
  }
}

function phoneIsActive() {
  return performance.now() - phone.lastMessageTime < CONFIG.phone.timeoutMs;
}

// Phone input when a phone is connected, with the keyboard still working on top.
function readControls() {
  const keyboard = readKeyboard();
  const active = phoneIsActive();
  if (phone.wasActive && !active) {
    // The phone stopped sending (locked screen, Wi-Fi drop...). Inputs go to zero, so the car coasts to a stop.
    showMessage("Phone disconnected", 2);
  }
  phone.wasActive = active;
  if (!active) {
    hud.source.textContent = "Controls: keyboard";
    return keyboard;
  }
  hud.source.textContent = "Controls: phone (steer " + Math.round(phone.input.steer * 100) + "%)";
  const input = makeInput();
  input.steer = phone.input.steer;
  if (keyboard.steer !== 0) {
    input.steer = keyboard.steer;
  }
  input.gas = Math.max(phone.input.gas, keyboard.gas);
  input.brake = Math.max(phone.input.brake, keyboard.brake);
  input.thrust = phone.input.thrust || keyboard.thrust;
  input.pitch = phone.input.pitch;
  if (keyboard.pitch !== 0) {
    input.pitch = keyboard.pitch;
  }
  return input;
}

// Tell the phone (and later the coach) how the car is doing.
let lastStateSent = 0;
let pendingEvents = [];
function sendStateIfDue(now) {
  if (now - lastStateSent < 1000 / CONFIG.network.stateRateHz) {
    return;
  }
  lastStateSent = now;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    pendingEvents = [];
    return;
  }
  const state = makeState();
  state.speedKmh = Math.round(car.speedKmh);
  state.steer = Math.round(lastInput.steer * 100) / 100;
  state.fansOn = car.fansOn;
  state.tankPercent = Math.round(car.tank);
  state.mode = car.mode;
  state.airborne = car.airborne;
  state.altitude = Math.round(car.altitude * 10) / 10;
  state.events = pendingEvents;
  state.goalText = hud.goalText.textContent;
  socket.send(JSON.stringify(state));
  pendingEvents = [];
}

function updatePhoneStatus() {
  if (phone.count > 0) {
    hud.phoneStatus.textContent = "Phone connected";
    hud.phoneStatus.classList.add("ok");
    hud.phoneCard.classList.add("connected");
  } else {
    hud.phoneStatus.textContent = "Waiting for phone...";
    hud.phoneStatus.classList.remove("ok");
    hud.phoneCard.classList.remove("connected");
  }
}

// The QR code shows the tunnel's HTTPS address once the server knows it.
let shownPhoneUrl = "";
async function refreshPhoneInfo() {
  try {
    const response = await fetch("/api/info");
    const info = await response.json();
    if (info.phoneUrl !== shownPhoneUrl) {
      shownPhoneUrl = info.phoneUrl;
      hud.qr.src = "/api/qr.svg?t=" + Date.now();
      hud.phoneUrl.textContent = info.phoneUrl;
      if (!info.tunnel) {
        hud.phoneUrl.textContent = info.phoneUrl + " (iPhone needs HTTPS: run npm run phone)";
      }
    }
    if (!info.tunnel) {
      setTimeout(refreshPhoneInfo, 4000); // keep checking until the tunnel is up
    }
  } catch (err) {
    setTimeout(refreshPhoneInfo, 4000);
  }
}

// ---------- Modes and levels ----------

function setMode(mode) {
  car.setMode(mode);
  for (const button of modeButtons) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  const names = { performance: "Performance: fans only", thrust: "Thrust: fans + rear thrusters", rocket: "Rocket: hold thrust to fly" };
  showMessage(names[mode], 1.6);
}

let levelList = [];
let currentLevelIndex = 0;
let level = null;

async function loadLevel(index) {
  currentLevelIndex = index;
  const entry = levelList[index];
  const data = await fetchLevel(entry.file);
  if (level) {
    removeLevel(level);
  }
  level = buildLevel(data, scene, world, RAPIER);
  car.reset(data.spawn);
  snapCamera = true;
  hud.levelSelect.value = String(index);
  if (data.goal && data.goal.text) {
    hud.goalText.textContent = data.goal.text;
  } else {
    hud.goalText.textContent = data.description || "";
  }
  showMessage(data.name, 1.8);
}

hud.levelSelect.addEventListener("change", function () {
  loadLevel(Number(hud.levelSelect.value));
  hud.levelSelect.blur(); // give the keyboard back to the game
});

// ---------- Camera ----------

const CAMERA_MODES = ["chase", "cockpit", "overhead"];
let cameraModeIndex = 0;
let snapCamera = true; // jump straight to the right spot (after a reset or level load)
const cameraOffset = new THREE.Vector3(); // camera spot, relative to the car
const lookAheadOffset = new THREE.Vector3(); // where it looks, relative to the car
const flatForward = new THREE.Vector3(0, 0, 1);
const TURN_AROUND = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

function updateCamera(dt) {
  const carPosition = car.model.root.position;
  const carRotation = car.model.root.quaternion;

  // The direction the car points, flattened onto the ground. If the car points straight up
  // (mid-flip), keep the last good direction so the camera doesn't spin.
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carRotation);
  forward.y = 0;
  if (forward.lengthSq() > 0.05) {
    flatForward.copy(forward.normalize());
  }

  const mode = CAMERA_MODES[cameraModeIndex];
  const settings = CONFIG.camera;
  if (mode === "cockpit") {
    // Driver's seat, looking where the car looks.
    const eye = new THREE.Vector3(0.35, 0.38, 0.0).applyQuaternion(carRotation).add(carPosition);
    camera.position.copy(eye);
    camera.quaternion.copy(carRotation).multiply(TURN_AROUND); // cameras look down -Z, the car faces +Z
    snapCamera = true;
  } else {
    let distance = settings.chaseDistance;
    let height = settings.chaseHeight;
    if (mode === "overhead") {
      distance = 14;
      height = 38;
    }
    // We smooth the camera's direction around the car, not its position in the world.
    // That way the camera swings smoothly in turns but never falls behind at high speed.
    const wantedOffset = flatForward.clone().multiplyScalar(-distance);
    wantedOffset.y = height;
    const wantedLookAhead = flatForward.clone().multiplyScalar(settings.chaseLookAhead);
    if (snapCamera) {
      cameraOffset.copy(wantedOffset);
      lookAheadOffset.copy(wantedLookAhead);
      snapCamera = false;
    } else {
      const blend = 1 - Math.exp(-settings.chaseSmoothing * dt);
      cameraOffset.lerp(wantedOffset, blend);
      lookAheadOffset.lerp(wantedLookAhead, blend);
    }
    const eye = carPosition.clone().add(cameraOffset);
    // Never let the camera dip under the ground.
    eye.y = Math.max(eye.y, 0.5);
    const lookTarget = carPosition.clone().add(lookAheadOffset);
    lookTarget.y = lookTarget.y + 0.8;

    camera.position.copy(eye);
    if (car.thrusting || car.lifting) {
      const shake = settings.shakeOnThrust;
      camera.position.x = camera.position.x + (Math.random() - 0.5) * shake;
      camera.position.y = camera.position.y + (Math.random() - 0.5) * shake;
    }
    camera.lookAt(lookTarget);
  }

  // Widen the view at speed so it feels fast.
  const speedFactor = Math.min(1, car.speedKmh / settings.fastFovKmh);
  const fov = settings.baseFov + (settings.fastFov - settings.baseFov) * speedFactor;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // Keep the sun's shadow box around the car, and the sky around the camera.
  sun.position.copy(carPosition).add(SUN_OFFSET);
  sun.target.position.copy(carPosition);
  sky.position.copy(camera.position);
}

// ---------- HUD ----------

function updateHud() {
  hud.speed.firstChild.textContent = String(Math.round(car.speedKmh));
  if (car.fansOn) {
    hud.fans.textContent = "ON";
    hud.fans.classList.add("on");
  } else {
    hud.fans.textContent = "OFF";
    hud.fans.classList.remove("on");
  }
  hud.tankFill.style.width = car.tank.toFixed(1) + "%";
  hud.tankBar.classList.toggle("empty", car.tankEmptyPressed);
  hud.tankBar.classList.toggle("off", car.mode === "performance");
  hud.altitude.textContent = car.altitude.toFixed(1) + " m";
}

// Turn car events into on-screen messages, and save them for the phone and coach.
function handleCarEvents() {
  const events = car.takeEvents();
  for (const name of events) {
    pendingEvents.push(name);
    if (name === "tank_empty") {
      showMessage("Air tank empty. Let it refill.", 1.8);
    } else if (name === "flip") {
      showMessage("Flipped! Press R (or RESET on the phone)", 3);
    } else if (name === "big_jump") {
      showMessage("Big air!", 1.5);
    } else if (name === "crash") {
      snapShake = 0.25;
    }
  }
}
let snapShake = 0;

// ---------- Game loop ----------

let lastInput = makeInput();
let lastFrameTime = performance.now();
let elapsed = 0;
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (dt > 0.1) {
    dt = 0.1; // the tab was in the background; don't simulate a huge jump
  }
  if (dt < 0) {
    dt = 0;
  }
  elapsed = elapsed + dt;

  const input = readControls();
  lastInput = input;

  // Physics at a fixed rate, no matter the screen's refresh rate.
  const step = CONFIG.physics.timestep;
  accumulator = accumulator + dt;
  let steps = 0;
  while (accumulator >= step && steps < CONFIG.physics.maxStepsPerFrame) {
    car.step(input, step);
    world.step();
    car.afterStep(step);
    accumulator = accumulator - step;
    steps = steps + 1;
  }
  if (steps === CONFIG.physics.maxStepsPerFrame) {
    accumulator = 0;
  }
  car.updateVisuals(accumulator / step, dt, elapsed);

  if (level) {
    const reached = updateLevel(level, car.getPosition(), car.airborne, dt);
    if (reached) {
      showMessage("Goal reached!", 3);
      pendingEvents.push("goal_reached");
    }
  }

  // Fell off the edge of the world.
  if (car.getPosition().y < -30) {
    car.reset();
    snapCamera = true;
  }

  handleCarEvents();
  updateCamera(dt);
  if (snapShake > 0) {
    camera.position.y = camera.position.y + (Math.random() - 0.5) * snapShake;
    snapShake = Math.max(0, snapShake - dt);
  }
  updateHud();
  sendStateIfDue(now);
  renderer.render(scene, camera);
}

// ---------- Sky ----------

// A big sphere around the camera, colored from horizon to sky-top.
function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: SKY_TOP },
      horizonColor: { value: SKY_HORIZON },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDirection;
      void main() {
        float t = smoothstep(0.0, 0.45, vDirection.y);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  mesh.renderOrder = -1;
  return mesh;
}

// ---------- Start ----------

levelList = await fetchLevelList();
for (let i = 0; i < levelList.length; i++) {
  const option = document.createElement("option");
  option.value = String(i);
  option.textContent = levelList[i].name;
  hud.levelSelect.appendChild(option);
}
// ?level=tesla-event in the address bar picks a level directly.
const wantedLevel = new URLSearchParams(location.search).get("level");
let startIndex = 0;
for (let i = 0; i < levelList.length; i++) {
  if (levelList[i].file === wantedLevel) {
    startIndex = i;
  }
}
await loadLevel(startIndex);
setMode("thrust");
listenToKeyboard();
connectSocket();
refreshPhoneInfo();
hud.loading.style.display = "none";
requestAnimationFrame(frame);

// Handy for poking at things from the browser console, e.g. game.car.tank = 100
// game.frame(time) runs one frame by hand, for testing when the tab is in the background.
window.game = { car: car, world: world, camera: camera, scene: scene, CONFIG: CONFIG, frame: frame, keys: keys };
