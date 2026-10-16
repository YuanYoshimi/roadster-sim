// phone.js — Owner: A (Yuan)
// The phone yoke. Hold the phone sideways like a steering wheel:
// turning it steers, tilting it forward/back is "pitch" (used to fly in Rocket mode).
// Sends the controls to the server about 30 times per second; the server passes them to the game.

import { CONFIG } from "./config.js";
import { MSG, DRIVE_MODES, makeInput, parseMessage, socketUrl } from "./shared/protocol.js";

const input = makeInput(); // what we send
const game = { connected: false, fansOn: false, mode: "thrust", tank: 100 }; // what the game last told us
let lastFansTap = 0;

const ui = {
  startScreen: document.getElementById("startScreen"),
  startButton: document.getElementById("startButton"),
  startError: document.getElementById("startError"),
  dot: document.getElementById("dot"),
  statusText: document.getElementById("statusText"),
  wheel: document.getElementById("wheel"),
  readout: document.getElementById("readout"),
  speed: document.getElementById("speed"),
  tankFill: document.getElementById("tankFill"),
  fans: document.getElementById("fans"),
  thrust: document.getElementById("thrust"),
  mode: document.getElementById("mode"),
  flash: document.getElementById("flash"),
};

// ---------- Start: ask for motion permission (iPhone needs a tap for this) ----------

ui.startButton.addEventListener("click", async function () {
  ui.startError.textContent = "";
  if (!window.isSecureContext) {
    ui.startError.textContent =
      "Tilt steering needs HTTPS. Open the https://...trycloudflare.com link from the game screen instead.";
  }
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const answer = await DeviceOrientationEvent.requestPermission();
      if (answer !== "granted") {
        ui.startError.textContent = "Motion access was denied. Close this tab, open the link again, and tap Allow.";
        return;
      }
    } catch (err) {
      ui.startError.textContent = "Couldn't turn on tilt steering: " + err.message;
      return;
    }
  }
  window.addEventListener("deviceorientation", onOrientation);

  // Android can go full screen. iPhone can't, which is fine.
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(function () {});
  }
  keepScreenOn();
  ui.startScreen.style.display = "none";
  connectSocket();
  setInterval(sendInput, 1000 / CONFIG.phone.sendRateHz);
  // Use however the player is holding the phone right now as "straight ahead".
  setTimeout(calibrate, 300);
});

// ---------- Tilt steering ----------

const tilt = {
  rawSteerDeg: 0,
  rawPitchDeg: 0,
  centerSteerDeg: 0,
  centerPitchDeg: 0,
  smoothSteer: 0,
  haveReading: false,
};

function onOrientation(event) {
  if (event.beta === null || event.gamma === null) {
    return; // no tilt sensor (e.g. a laptop)
  }
  // Work out which way is "up" (away from gravity), measured in the phone's own axes.
  // Using the up direction instead of the raw angles avoids weird jumps when the phone is sideways.
  const beta = degToRad(event.beta);
  const gamma = degToRad(event.gamma);
  const upX = -Math.cos(beta) * Math.sin(gamma);
  const upY = Math.sin(beta);
  const upZ = Math.cos(beta) * Math.cos(gamma);

  // The page is sideways, so turn that into "screen" directions (right and up as the player sees them).
  const screenAngle = degToRad(getScreenAngle());
  const screenX = upX * Math.cos(screenAngle) - upY * Math.sin(screenAngle);
  const screenY = upX * Math.sin(screenAngle) + upY * Math.cos(screenAngle);

  // Steering angle: 0 when the screen is level. Turning the phone clockwise gives a positive angle.
  // (If the phone is lying almost flat, this angle is unreliable, so keep the last value.)
  if (Math.hypot(screenX, screenY) > 0.2) {
    tilt.rawSteerDeg = radToDeg(Math.atan2(-screenX, screenY));
  }
  // How far the screen faces up. Tipping the top edge away from you (forward) makes it bigger.
  tilt.rawPitchDeg = radToDeg(Math.asin(clamp(upZ, -1, 1)));
  tilt.haveReading = true;
  updateSteering();
}

function updateSteering() {
  const settings = CONFIG.phone;
  let steerDeg = wrapDegrees(tilt.rawSteerDeg - tilt.centerSteerDeg);
  if (settings.invertSteer) {
    steerDeg = -steerDeg;
  }

  // Ignore tiny wobbles near the center, then scale so steerMaxDeg = full lock.
  let target = 0;
  if (Math.abs(steerDeg) > settings.steerDeadZoneDeg) {
    const amount = (Math.abs(steerDeg) - settings.steerDeadZoneDeg) / (settings.steerMaxDeg - settings.steerDeadZoneDeg);
    target = Math.min(1, amount) * Math.sign(steerDeg);
  }
  // Smooth out shaky hands.
  tilt.smoothSteer = tilt.smoothSteer + (target - tilt.smoothSteer) * settings.steerSmoothing;
  input.steer = tilt.smoothSteer;

  // Tipped forward = positive here, but pitch -1 means "forward" in the protocol (like pushing a stick).
  const forwardDeg = tilt.rawPitchDeg - tilt.centerPitchDeg;
  input.pitch = clamp(-forwardDeg / settings.pitchMaxDeg, -1, 1);

  ui.wheel.style.transform = "rotate(" + clamp(steerDeg, -120, 120).toFixed(1) + "deg)";
  ui.readout.textContent = "steer " + Math.round(steerDeg) + "° · forward " + Math.round(forwardDeg) + "°";
}

function calibrate() {
  tilt.centerSteerDeg = tilt.rawSteerDeg;
  tilt.centerPitchDeg = tilt.rawPitchDeg;
  tilt.smoothSteer = 0;
  updateSteering();
}

// iPhones still support window.orientation (90 = turned left, -90 = turned right).
function getScreenAngle() {
  if (typeof window.orientation === "number") {
    return window.orientation;
  }
  if (screen.orientation && typeof screen.orientation.angle === "number") {
    return screen.orientation.angle;
  }
  return 0;
}

// ---------- Buttons ----------

// A button that is "on" while any finger is on it. Several buttons can be held at once.
function holdButton(element, onChange) {
  const fingers = new Set();
  function refresh() {
    const down = fingers.size > 0;
    element.classList.toggle("pressed", down);
    onChange(down);
  }
  element.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    fingers.add(event.pointerId);
    refresh();
  });
  function letGo(event) {
    fingers.delete(event.pointerId);
    refresh();
  }
  element.addEventListener("pointerup", letGo);
  element.addEventListener("pointercancel", letGo);
  element.addEventListener("lostpointercapture", letGo);
}

// A button that does something once per tap.
function tapButton(element, onTap) {
  element.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    element.classList.add("pressed");
    onTap();
  });
  element.addEventListener("pointerup", function () {
    element.classList.remove("pressed");
  });
  element.addEventListener("pointercancel", function () {
    element.classList.remove("pressed");
  });
}

holdButton(document.getElementById("gas"), function (down) {
  input.gas = down ? 1 : 0;
});
holdButton(document.getElementById("brake"), function (down) {
  input.brake = down ? 1 : 0;
});
holdButton(ui.thrust, function (down) {
  if (down && !input.thrust) {
    buzz();
  }
  input.thrust = down;
});
holdButton(document.getElementById("reset"), function (down) {
  input.reset = down;
});
tapButton(ui.fans, function () {
  // We send the fan state we want. The game switches when this value changes.
  input.fans = !input.fans;
  lastFansTap = performance.now();
  ui.fans.classList.toggle("on", input.fans);
  buzz();
});
tapButton(ui.mode, function () {
  const next = DRIVE_MODES[(DRIVE_MODES.indexOf(game.mode) + 1) % DRIVE_MODES.length];
  game.mode = next;
  ui.mode.textContent = modeLabel(next);
  send({ type: MSG.MODE, mode: next });
  buzz();
});
tapButton(document.getElementById("center"), function () {
  calibrate();
  buzz();
});

// Stop iOS from zooming, scrolling, or opening menus while playing.
document.addEventListener("gesturestart", function (event) {
  event.preventDefault();
});
document.addEventListener("contextmenu", function (event) {
  event.preventDefault();
});

// ---------- Connection ----------

let socket = null;

function connectSocket() {
  setStatus(false, "Connecting...");
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", function () {
    send({ type: MSG.HELLO, role: "phone" });
  });
  socket.addEventListener("message", function (event) {
    const msg = parseMessage(event.data);
    if (msg) {
      handleMessage(msg);
    }
  });
  socket.addEventListener("close", function () {
    setStatus(false, "Disconnected. Retrying...");
    setTimeout(connectSocket, 1000);
  });
}

function handleMessage(msg) {
  if (msg.type === MSG.STATUS) {
    if (msg.games > 0) {
      setStatus(true, "Connected to game");
    } else {
      setStatus(false, "Game screen not open");
    }
  } else if (msg.type === MSG.STATE) {
    game.fansOn = msg.fansOn;
    game.mode = msg.mode;
    game.tank = msg.tankPercent;
    // Follow the game's fan state (it may have been switched with the keyboard),
    // but not right after a tap, while our change is still on its way.
    if (performance.now() - lastFansTap > 800) {
      input.fans = msg.fansOn;
      ui.fans.classList.toggle("on", msg.fansOn);
    }
    ui.speed.textContent = String(msg.speedKmh);
    ui.tankFill.style.width = msg.tankPercent + "%";
    ui.thrust.classList.toggle("empty", msg.mode === "performance" || msg.tankPercent <= 0);
    ui.mode.textContent = modeLabel(msg.mode);
    if (msg.events.includes("crash") || msg.events.includes("big_jump")) {
      flashScreen();
    }
  }
}

function sendInput() {
  send(input);
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Short names so the mode button doesn't look like the big THRUST button.
function modeLabel(mode) {
  const names = { performance: "PERF", thrust: "THRUST", rocket: "ROCKET" };
  return "MODE \u00b7 " + names[mode];
}

function setStatus(ok, text) {
  ui.dot.classList.toggle("ok", ok);
  ui.statusText.textContent = text;
}

// ---------- Feedback ----------

function flashScreen() {
  ui.flash.classList.add("on");
  buzz();
  setTimeout(function () {
    ui.flash.classList.remove("on");
  }, 120);
}

// A short vibration. Android has navigator.vibrate(). iPhone Safari doesn't, but tapping a
// hidden iOS "switch" checkbox makes a small haptic tick (only works right after a touch).
function buzz() {
  if (navigator.vibrate) {
    navigator.vibrate(15);
    return;
  }
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.setAttribute("switch", "");
  label.appendChild(box);
  document.head.appendChild(label);
  label.click();
  document.head.removeChild(label);
}

// Keep the phone screen from going to sleep while driving.
async function keepScreenOn() {
  try {
    if (navigator.wakeLock) {
      await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    // Not supported or not allowed. The game still works.
  }
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    keepScreenOn();
  }
});

// ---------- Small math helpers ----------

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Keep an angle between -180 and 180 degrees.
function wrapDegrees(deg) {
  let result = deg;
  while (result > 180) {
    result = result - 360;
  }
  while (result < -180) {
    result = result + 360;
  }
  return result;
}
