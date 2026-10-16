// car-model.js — Owner: B (friend)
// An original, stylized wedge-shaped hypercar built from simple three.js shapes:
// low and angular with flat panels, hidden headlights, and a full-width rear light bar.
// Inspired by the Tesla Roadster, but NOT a Tesla asset. Kept in its own file so a
// .glb model can be swapped in later.
//
// The car faces +Z, +X is the car's LEFT side, and Y is up.
// Coordinates are relative to the center of the physics body (the ground is about 0.7 m below).

import * as THREE from "three";
import { CONFIG } from "./config.js";

const BODY_BOTTOM = -0.52; // underside of the body
const WHEEL_CENTER_Y = -0.335; // where the wheel sits when the car is at rest

export function buildCarModel() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything except the wheels
  root.add(body);

  const paint = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, metalness: 0.35, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0e13, metalness: 0.9, roughness: 0.08 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x16181c, metalness: 0.4, roughness: 0.6 });

  // The main body and the cabin are each a side-view outline pushed out across the car's width.
  body.add(extrudeAcross(makeLowerBodyShape(), 1.88, paint, 0.025));
  body.add(extrudeAcross(makeCabinShape(), 1.5, paint, 0));
  body.add(extrudeAcross(makeGlassShape(), 1.52, glass, 0));

  // Hidden headlights: one thin light strip across the nose.
  const headlight = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.025, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 2.0 })
  );
  headlight.position.set(0, -0.235, 2.165);
  headlight.rotation.x = -0.5;
  body.add(headlight);

  // Full-width rear light bar. It glows brighter when braking.
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 1.2 });
  const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.035, 0.04), tailMaterial);
  tailLight.position.set(0, -0.01, -2.17);
  tailLight.rotation.x = 0.5;
  body.add(tailLight);

  // Dark diffuser under the tail.
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), darkTrim);
  diffuser.position.set(0, -0.47, -1.98);
  body.add(diffuser);

  // Rear thruster nozzles (where the plume comes out).
  const rearNozzles = [new THREE.Vector3(0.42, -0.3, -2.2), new THREE.Vector3(-0.42, -0.3, -2.2)];
  const nozzleGeometry = new THREE.CylinderGeometry(0.09, 0.11, 0.14, 16);
  nozzleGeometry.rotateX(Math.PI / 2);
  for (const spot of rearNozzles) {
    const nozzle = new THREE.Mesh(nozzleGeometry, darkTrim);
    nozzle.position.copy(spot);
    body.add(nozzle);
  }

  // Upward thrusters under the four corners (Rocket mode).
  const liftNozzles = [
    new THREE.Vector3(0.62, -0.56, 1.75),
    new THREE.Vector3(-0.62, -0.56, 1.75),
    new THREE.Vector3(0.62, -0.56, -1.75),
    new THREE.Vector3(-0.62, -0.56, -1.75),
  ];

  // Flames: simple glowing cones. The particle plume is added on top by car.js.
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xbfe8ff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rearFlameGeometry = new THREE.ConeGeometry(0.1, 1, 12, 1, true);
  rearFlameGeometry.rotateX(-Math.PI / 2); // tip points backward (-Z)
  rearFlameGeometry.translate(0, 0, -0.5); // base sits at the nozzle
  const rearFlames = [];
  for (const spot of rearNozzles) {
    const flame = new THREE.Mesh(rearFlameGeometry, flameMaterial);
    flame.position.copy(spot);
    flame.position.z -= 0.07;
    flame.visible = false;
    body.add(flame);
    rearFlames.push(flame);
  }
  const liftFlameGeometry = new THREE.ConeGeometry(0.09, 1, 12, 1, true);
  liftFlameGeometry.rotateX(Math.PI); // tip points down
  liftFlameGeometry.translate(0, -0.5, 0);
  const liftFlames = [];
  for (const spot of liftNozzles) {
    const flame = new THREE.Mesh(liftFlameGeometry, flameMaterial);
    flame.position.copy(spot);
    flame.visible = false;
    body.add(flame);
    liftFlames.push(flame);
  }

  // Fan glow: a cyan glow under the car plus glowing strips along the sides.
  const fanGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x2fd2ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fanGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.9), fanGlowMaterial);
  fanGlow.rotation.x = -Math.PI / 2;
  fanGlow.position.y = BODY_BOTTOM - 0.06;
  body.add(fanGlow);
  const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const side of [1, -1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 1.55), stripMaterial);
    strip.position.set(side * 0.97, BODY_BOTTOM + 0.06, 0);
    body.add(strip);
  }

  // Wheels. Order matches the physics: front-left, front-right, rear-left, rear-right.
  const wheelParts = makeWheelParts();
  const wheels = [];
  const wheelX = [CONFIG.car.wheelX, -CONFIG.car.wheelX, CONFIG.car.wheelX, -CONFIG.car.wheelX];
  const wheelZ = [CONFIG.car.wheelFrontZ, CONFIG.car.wheelFrontZ, CONFIG.car.wheelRearZ, CONFIG.car.wheelRearZ];
  for (let i = 0; i < 4; i++) {
    const wheel = buildWheel(wheelParts, wheelX[i] > 0);
    wheel.steer.position.set(wheelX[i], WHEEL_CENTER_Y, wheelZ[i]);
    root.add(wheel.steer);
    wheels.push(wheel);
  }

  root.traverse(function (child) {
    if (child.isMesh && child.material !== flameMaterial && child.material !== fanGlowMaterial) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // These let car.js drive the effects without knowing how they're built.
  function setFans(power, time) {
    const pulse = 0.85 + 0.15 * Math.sin(time * 30);
    fanGlowMaterial.opacity = power * 0.55 * pulse;
    stripMaterial.color.setRGB(0.18 * power, 0.82 * power, 1.0 * power);
  }

  function setThrust(on, time) {
    for (const flame of rearFlames) {
      flame.visible = on;
      flame.scale.set(1, 1, 0.9 + Math.random() * 0.5 + 0.1 * Math.sin(time * 50));
    }
  }

  function setLift(on, time) {
    for (const flame of liftFlames) {
      flame.visible = on;
      flame.scale.set(1, 1.0 + Math.random() * 0.6 + 0.2 * Math.sin(time * 45), 1);
    }
  }

  function setBraking(amount) {
    tailMaterial.emissiveIntensity = 1.2 + amount * 3;
  }

  return {
    root: root,
    wheels: wheels,
    rearNozzles: rearNozzles,
    liftNozzles: liftNozzles,
    setFans: setFans,
    setThrust: setThrust,
    setLift: setLift,
    setBraking: setBraking,
  };
}

// Side view of the main body (x = toward the front, y = up), with cutouts for the wheel arches.
function makeLowerBodyShape() {
  const frontWheel = CONFIG.car.wheelFrontZ;
  const rearWheel = CONFIG.car.wheelRearZ;
  const archRadius = 0.45;
  // Where the flat bottom edge meets each arch.
  const drop = BODY_BOTTOM - WHEEL_CENTER_Y;
  const halfOpening = Math.sqrt(archRadius * archRadius - drop * drop);
  const archEndAngle = Math.asin(drop / archRadius);
  const archStartAngle = Math.PI - archEndAngle;

  const shape = new THREE.Shape();
  shape.moveTo(-2.12, BODY_BOTTOM);
  shape.lineTo(rearWheel - halfOpening, BODY_BOTTOM);
  shape.absarc(rearWheel, WHEEL_CENTER_Y, archRadius, archStartAngle, archEndAngle, true);
  shape.lineTo(frontWheel - halfOpening, BODY_BOTTOM);
  shape.absarc(frontWheel, WHEEL_CENTER_Y, archRadius, archStartAngle, archEndAngle, true);
  shape.lineTo(2.05, BODY_BOTTOM);
  shape.lineTo(2.2, -0.36); // nose tip
  shape.lineTo(2.12, -0.22); // front edge of the hood
  shape.lineTo(0.62, 0.05); // bottom of the windshield
  shape.lineTo(-2.06, 0.1); // shoulder line back to the tail
  shape.lineTo(-2.18, -0.1); // top of the tail
  shape.lineTo(-2.16, -0.4);
  shape.lineTo(-2.12, BODY_BOTTOM);
  return shape;
}

// Side view of the cabin: a sharp triangle from the windshield to the tail (a fastback).
function makeCabinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.62, 0.05);
  shape.lineTo(-0.3, 0.44); // roof peak
  shape.lineTo(-2.0, 0.1);
  shape.lineTo(0.62, 0.05);
  return shape;
}

// Side view of the dark glass: the windshield and side windows, sitting just outside the cabin.
function makeGlassShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.645, 0.065);
  shape.lineTo(-0.29, 0.458);
  shape.lineTo(-1.1, 0.3);
  shape.lineTo(-0.8, 0.11);
  shape.lineTo(0.3, 0.11);
  shape.lineTo(0.645, 0.065);
  return shape;
}

// Push a side-view outline out across the car's width and turn it to face +Z.
function extrudeAcross(shape, width, material, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 10,
  });
  // The outline was drawn with x = forward, and it was pushed out along z.
  // Rotating it -90 degrees around Y makes "forward" point at +Z and the width run along X.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate((width - bevel * 2) / 2, 0, 0);
  return new THREE.Mesh(geometry, material);
}

// Shared shapes and materials for all four wheels.
function makeWheelParts() {
  const radius = CONFIG.car.wheelRadius;
  const tire = new THREE.CylinderGeometry(radius, radius, 0.3, 28);
  tire.rotateZ(Math.PI / 2); // axle along X
  const rim = new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, 0.31, 20);
  rim.rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(0.03, radius * 1.3, 0.07);
  return {
    tire: tire,
    rim: rim,
    spoke: spoke,
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.8, roughness: 0.35 }),
    spokeMetal: new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 }),
  };
}

// steer turns the wheel left/right; spin rolls it. Spokes make the rolling visible.
function buildWheel(parts, isLeftSide) {
  const steer = new THREE.Group();
  const spin = new THREE.Group();
  steer.add(spin);
  spin.add(new THREE.Mesh(parts.tire, parts.rubber));
  spin.add(new THREE.Mesh(parts.rim, parts.metal));
  let outward = -1;
  if (isLeftSide) {
    outward = 1;
  }
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(parts.spoke, parts.spokeMetal);
    spoke.position.x = outward * 0.16;
    spoke.rotation.x = (i * Math.PI) / 3;
    spin.add(spoke);
  }
  return { steer: steer, spin: spin };
}
