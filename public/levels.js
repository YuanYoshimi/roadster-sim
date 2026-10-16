// levels.js — Owner: B (friend)
// Loads level JSON files from /levels and builds them: ground, props, parked cars, and the goal.
// Never hard-code the world. Every map is a JSON file in levels/ (see levels/blank.json).
//
// Positions are in meters. heading is in degrees: 0 faces +Z, 90 faces +X.
// Prop types: box, wall, ramp, curl (curves up and over, upside down), cone, checkpoint,
// parking_spot, paint (flat color, no collision).
// Car kinds: compact, sedan, suv, pickup, van, semi. Behaviors so far: parked.

import * as THREE from "three";

export async function fetchLevelList() {
  const response = await fetch("/levels/index.json");
  return await response.json();
}

export async function fetchLevel(file) {
  const response = await fetch("/levels/" + file + ".json");
  if (!response.ok) {
    throw new Error("Level not found: " + file);
  }
  return await response.json();
}

// Build a level into the scene and the physics world.
// Returns an object you pass to updateLevel() every frame and removeLevel() when done.
export function buildLevel(level, scene, world, RAPIER) {
  const built = {
    level: level,
    scene: scene,
    world: world,
    RAPIER: RAPIER,
    meshes: [], // everything we added to the scene
    fixedColliders: [], // colliders that don't move
    movingProps: [], // { mesh, body } pairs, like cones you can knock over
    goal: null,
    goalReached: false,
    time: 0,
  };

  buildGround(built, level.ground || { type: "flat", size: 1000 });

  const props = level.props || [];
  for (const prop of props) {
    buildProp(built, prop);
  }

  const cars = level.cars || [];
  for (let i = 0; i < cars.length; i++) {
    buildParkedCar(built, cars[i], i);
  }

  if (level.goal) {
    buildGoal(built, level.goal);
  }

  // TODO (Milestone 5): if level.model is set, load the .glb with GLTFLoader and
  // make a trimesh collider from it (for PLATEAU Tokyo chunks, race tracks, etc.).

  return built;
}

// Call every frame. Returns true once, on the frame the car reaches the goal.
export function updateLevel(built, carPosition, carAirborne, dt) {
  built.time = built.time + dt;

  // Cones and other loose things: copy their physics pose onto their mesh.
  for (const item of built.movingProps) {
    const p = item.body.translation();
    const r = item.body.rotation();
    item.mesh.position.set(p.x, p.y, p.z);
    item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  if (!built.goal) {
    return false;
  }
  // Gentle pulse so the goal is easy to spot.
  built.goal.ring.material.opacity = 0.25 + 0.15 * Math.sin(built.time * 3);
  const dx = carPosition.x - built.goal.x;
  const dz = carPosition.z - built.goal.z;
  const inside = Math.sqrt(dx * dx + dz * dz) < built.goal.radius;
  if (inside && !carAirborne && !built.goalReached) {
    built.goalReached = true;
    return true;
  }
  return false;
}

export function removeLevel(built) {
  for (const mesh of built.meshes) {
    built.scene.remove(mesh);
  }
  for (const collider of built.fixedColliders) {
    built.world.removeCollider(collider, false);
  }
  for (const item of built.movingProps) {
    built.world.removeRigidBody(item.body);
  }
  built.meshes = [];
  built.fixedColliders = [];
  built.movingProps = [];
}

// ---------- Builders ----------

function buildGround(built, ground) {
  const size = ground.size || 1000;
  const texture = makeGridTexture();
  texture.repeat.set(size / 10, size / 10); // one texture tile = 10 m
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  addMesh(built, mesh);

  // A thick slab, so fast cars can't tunnel through a thin floor.
  const collider = built.RAPIER.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(0, -0.5, 0).setFriction(1.0);
  built.fixedColliders.push(built.world.createCollider(collider));
}

function buildProp(built, prop) {
  if (prop.type === "box") {
    const w = prop.w || 2;
    const h = prop.h || 2;
    const d = prop.d || 2;
    addSolidBox(built, prop.x, (prop.y || 0) + h / 2, prop.z, w, h, d, prop.heading || 0, prop.color || "#8a8f98");
  } else if (prop.type === "wall") {
    // A wall runs along its heading direction.
    const height = prop.height || 3;
    addSolidBox(built, prop.x, height / 2, prop.z, prop.thickness || 0.6, height, prop.length || 20, prop.heading || 0, prop.color || "#a3a8b0");
  } else if (prop.type === "ramp") {
    buildRamp(built, prop);
  } else if (prop.type === "curl") {
    buildCurl(built, prop);
  } else if (prop.type === "cone") {
    buildCone(built, prop);
  } else if (prop.type === "checkpoint") {
    buildCheckpoint(built, prop);
  } else if (prop.type === "parking_spot") {
    buildParkingSpot(built, prop);
  } else if (prop.type === "paint") {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(prop.w || 10, prop.d || 10),
      new THREE.MeshStandardMaterial({ color: prop.color || "#2b2e33", roughness: 0.9 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = THREE.MathUtils.degToRad(prop.heading || 0);
    mesh.position.set(prop.x, 0.01, prop.z);
    mesh.receiveShadow = true;
    addMesh(built, mesh);
  } else {
    console.warn("Unknown prop type, skipping:", prop.type);
  }
}

// A wedge that rises toward its heading direction. (x, z) is the middle of its footprint.
function buildRamp(built, prop) {
  const width = prop.width || 8;
  const length = prop.length || 20;
  const angle = THREE.MathUtils.degToRad(prop.angle || 15);
  const height = length * Math.tan(angle);
  const rotation = headingToQuaternion(prop.heading || 0);

  // Physics: the six corners of the wedge.
  const halfW = width / 2;
  const halfL = length / 2;
  const corners = new Float32Array([
    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    -halfW, 0, halfL,
    halfW, 0, halfL,
    -halfW, height, halfL,
    halfW, height, halfL,
  ]);
  const collider = built.RAPIER.ColliderDesc.convexHull(corners)
    .setTranslation(prop.x, 0, prop.z)
    .setRotation(rotation)
    .setFriction(1.0);
  built.fixedColliders.push(built.world.createCollider(collider));

  // Graphics: a triangle side view pushed out across the ramp's width.
  const side = new THREE.Shape();
  side.moveTo(-halfL, 0);
  side.lineTo(halfL, 0);
  side.lineTo(halfL, height);
  side.lineTo(-halfL, 0);
  const geometry = new THREE.ExtrudeGeometry(side, { depth: width, bevelEnabled: false });
  geometry.rotateY(-Math.PI / 2); // side view x -> world z, width -> world x
  geometry.translate(halfW, 0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: prop.color || "#e2a93b", roughness: 0.7, flatShading: true })
  );
  mesh.position.set(prop.x, 0, prop.z);
  mesh.quaternion.copy(rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addMesh(built, mesh);
}

// The reveal's curved ramp: it starts flat on the ground and bends up and over, so a car
// driving in ends up upside down at the top (with the fans on, it sticks there).
// (x, z) is where the curve starts, and it bends toward the heading direction.
// radius = size of the curve, degrees = how far it bends (180 = fully upside down).
function buildCurl(built, prop) {
  const radius = prop.radius || 10;
  const width = prop.width || 8;
  const degrees = prop.degrees || 180;
  const steps = 60;
  const rotation = headingToQuaternion(prop.heading || 0);

  // Two points (left and right edge) for each step along the curve.
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = THREE.MathUtils.degToRad((degrees * i) / steps);
    const z = radius * Math.sin(angle);
    const y = radius - radius * Math.cos(angle);
    points.push(-width / 2, y, z);
    points.push(width / 2, y, z);
  }
  // Two triangles per step make the driving surface.
  const triangles = [];
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    triangles.push(a, a + 2, a + 1);
    triangles.push(a + 1, a + 2, a + 3);
  }
  const vertices = new Float32Array(points);
  const indices = new Uint32Array(triangles);

  const collider = built.RAPIER.ColliderDesc.trimesh(vertices, indices)
    .setTranslation(prop.x, 0, prop.z)
    .setRotation(rotation)
    .setFriction(1.0);
  built.fixedColliders.push(built.world.createCollider(collider));

  // Graphics: a solid curved band. Its inside face is the driving surface; the outside gives it
  // thickness so it still looks solid when seen from the side.
  const group = new THREE.Group();
  const thickness = 0.6;
  const profile = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const angle = THREE.MathUtils.degToRad((degrees * i) / steps);
    const z = radius * Math.sin(angle);
    const y = radius - radius * Math.cos(angle);
    if (i === 0) {
      profile.moveTo(z, y);
    } else {
      profile.lineTo(z, y);
    }
  }
  for (let i = steps; i >= 0; i--) {
    const angle = THREE.MathUtils.degToRad((degrees * i) / steps);
    profile.lineTo((radius + thickness) * Math.sin(angle), radius - (radius + thickness) * Math.cos(angle));
  }
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false });
  geometry.rotateY(-Math.PI / 2); // side view x -> world z, width -> world x
  geometry.translate(width / 2, 0, 0);
  const band = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: prop.color || "#e2a93b", roughness: 0.7, flatShading: true })
  );
  band.position.y = 0.01; // a hair above the ground so they don't flicker
  band.receiveShadow = true;
  band.castShadow = true;
  group.add(band);

  // Rails along both edges so the shape reads clearly from far away.
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.5, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const railPoints = [];
    for (let i = 0; i <= steps; i++) {
      railPoints.push(new THREE.Vector3(points[i * 6 + 3] * side, points[i * 6 + 4], points[i * 6 + 5]));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), steps, 0.18, 8), railMaterial);
    rail.castShadow = true;
    group.add(rail);
  }

  // A support frame behind the curve (no collisions, it's out of the car's way).
  const top = radius * 2;
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, top + 0.6, 0.5), railMaterial);
    column.position.set(side * (width / 2 + 0.6), (top + 0.6) / 2, radius + 1.5);
    column.castShadow = true;
    group.add(column);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.7, 0.4, radius + 1.8), railMaterial);
  beam.position.set(0, top + 0.6, (radius + 1.5) / 2);
  group.add(beam);

  group.position.set(prop.x, 0, prop.z);
  group.quaternion.copy(rotation);
  addMesh(built, group);
}

// Cones are light and loose, so you can knock them flying.
function buildCone(built, prop) {
  const halfHeight = 0.35;
  const radius = 0.22;
  const bodyDesc = built.RAPIER.RigidBodyDesc.dynamic().setTranslation(prop.x, halfHeight, prop.z);
  const body = built.world.createRigidBody(bodyDesc);
  built.world.createCollider(built.RAPIER.ColliderDesc.cone(halfHeight, radius).setMass(4).setFriction(0.8), body);

  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, halfHeight * 2, 16),
    new THREE.MeshStandardMaterial({ color: "#ff6a1a", roughness: 0.6 })
  );
  mesh.castShadow = true;
  addMesh(built, mesh);
  built.movingProps.push({ mesh: mesh, body: body });
}

function buildCheckpoint(built, prop) {
  const radius = prop.radius || 6;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.25, 8, 48),
    new THREE.MeshBasicMaterial({ color: "#3ad1ff", transparent: true, opacity: 0.6 })
  );
  ring.position.set(prop.x, radius + 0.5, prop.z);
  ring.rotation.y = THREE.MathUtils.degToRad(prop.heading || 0);
  addMesh(built, ring);
}

function buildParkingSpot(built, prop) {
  const w = prop.w || 2.8;
  const d = prop.d || 5.5;
  const group = new THREE.Group();
  const lineMaterial = new THREE.MeshBasicMaterial({ color: "#f5f5f5" });
  const lines = [
    { x: -w / 2, z: 0, sx: 0.12, sz: d },
    { x: w / 2, z: 0, sx: 0.12, sz: d },
    { x: 0, z: -d / 2, sx: w, sz: 0.12 },
  ];
  for (const line of lines) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(line.sx, line.sz), lineMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(line.x, 0.02, line.z);
    group.add(mesh);
  }
  group.position.set(prop.x, 0, prop.z);
  group.rotation.y = THREE.MathUtils.degToRad(prop.heading || 0);
  addMesh(built, group);
}

// Simple box-shaped vehicles for jumping over or getting in the way.
const CAR_SIZES = {
  compact: { length: 3.6, width: 1.8, height: 1.4 }, // small two-seat robotaxi
  sedan: { length: 4.8, width: 1.85, height: 1.45 },
  suv: { length: 4.9, width: 2.0, height: 1.8 },
  pickup: { length: 5.8, width: 2.05, height: 1.9 },
  van: { length: 5.2, width: 2.0, height: 2.2 },
  semi: { length: 16, width: 2.6, height: 4.0 },
};
const CAR_COLORS = ["#c0392b", "#2c3e50", "#7f8c8d", "#1f6fb2", "#d4ac0d", "#ecf0f1", "#16a085", "#5b2c6f"];

function buildParkedCar(built, car, index) {
  let size = CAR_SIZES[car.kind];
  if (!size) {
    size = CAR_SIZES.sedan;
  }
  const rotation = headingToQuaternion(car.heading || 0);
  const color = car.color || CAR_COLORS[index % CAR_COLORS.length];

  const collider = built.RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.length / 2)
    .setTranslation(car.x, size.height / 2, car.z)
    .setRotation(rotation);
  built.fixedColliders.push(built.world.createCollider(collider));

  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: color, roughness: 0.45, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: "#14181e", roughness: 0.2, metalness: 0.6 });
  const clearance = 0.3;

  if (car.kind === "semi") {
    // Cab at the front, a long box trailer behind it.
    addPart(group, size.width, 2.6, 3.0, 0, clearance + 1.3, size.length / 2 - 1.5, paint);
    addPart(group, size.width * 0.9, 0.8, 0.1, 0, clearance + 2.1, size.length / 2 + 0.01, glass);
    addPart(group, size.width, size.height - 0.5, size.length - 3.4, 0, 0.5 + (size.height - 0.5) / 2, -1.7, new THREE.MeshStandardMaterial({ color: "#d9d9d9", roughness: 0.6 }));
  } else if (car.kind === "pickup") {
    const lowerHeight = size.height * 0.5;
    addPart(group, size.width, lowerHeight, size.length, 0, clearance + lowerHeight / 2, 0, paint);
    addPart(group, size.width * 0.92, size.height - lowerHeight - clearance, size.length * 0.38, 0, clearance + lowerHeight + (size.height - lowerHeight - clearance) / 2, size.length * 0.1, glass);
  } else {
    const lowerHeight = size.height * 0.45;
    const cabinHeight = size.height - lowerHeight - clearance;
    addPart(group, size.width, lowerHeight, size.length, 0, clearance + lowerHeight / 2, 0, paint);
    let cabinLength = size.length * 0.5;
    if (car.kind === "van" || car.kind === "suv") {
      cabinLength = size.length * 0.75;
    }
    addPart(group, size.width * 0.92, cabinHeight, cabinLength, 0, clearance + lowerHeight + cabinHeight / 2, -size.length * 0.05, glass);
  }

  // Four wheels (a real semi has more, but the trailer hides them).
  const wheelRadius = 0.38;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.3, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  const rubber = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 });
  const axleZ = size.length / 2 - 1.0;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.position.set(sideX * (size.width / 2 - 0.1), wheelRadius, sideZ * axleZ);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  group.position.set(car.x, 0, car.z);
  group.quaternion.copy(rotation);
  addMesh(built, group);
}

function buildGoal(built, goal) {
  const radius = goal.radius || 6;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 3, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: "#39ff88", transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.set(goal.x, 1.5, goal.z);
  addMesh(built, ring);
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color: "#39ff88", transparent: true, opacity: 0.35, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(goal.x, 0.03, goal.z);
  addMesh(built, pad);
  built.goal = { x: goal.x, z: goal.z, radius: radius, text: goal.text || "", ring: ring };
}

// ---------- Small helpers ----------

function addSolidBox(built, x, y, z, w, h, d, heading, color) {
  const rotation = headingToQuaternion(heading);
  const collider = built.RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(rotation);
  built.fixedColliders.push(built.world.createCollider(collider));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 }));
  mesh.position.set(x, y, z);
  mesh.quaternion.copy(rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addMesh(built, mesh);
}

function addPart(group, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addMesh(built, mesh) {
  built.scene.add(mesh);
  built.meshes.push(mesh);
}

function headingToQuaternion(headingDeg) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(headingDeg));
}

// Asphalt-gray tile with a light line every 5 m and a brighter one every 10 m.
let gridTexture = null;
function makeGridTexture() {
  if (gridTexture) {
    return gridTexture.clone();
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3b4048";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#4a5059";
  ctx.fillRect(127, 0, 2, 256);
  ctx.fillRect(0, 127, 256, 2);
  ctx.fillStyle = "#636a75";
  ctx.fillRect(0, 0, 3, 256);
  ctx.fillRect(0, 0, 256, 3);
  gridTexture = new THREE.CanvasTexture(canvas);
  gridTexture.wrapS = THREE.RepeatWrapping;
  gridTexture.wrapT = THREE.RepeatWrapping;
  gridTexture.colorSpace = THREE.SRGBColorSpace;
  gridTexture.anisotropy = 8;
  return gridTexture.clone();
}
