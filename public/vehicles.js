// vehicles.js — Owner: B (friend)
// Simple box-shaped cars, vans and trucks for parked cars and traffic. Generic shapes only,
// never real car models. Each vehicle is ONE mesh: its parts are merged into a single
// geometry with the colors baked in, so a parking lot full of cars stays fast to draw.
// Vehicles face +Z, with their origin on the ground at the center.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const CAR_SIZES = {
  compact: { length: 3.6, width: 1.8, height: 1.4 }, // small two-seat robotaxi
  sedan: { length: 4.8, width: 1.85, height: 1.45 },
  suv: { length: 4.9, width: 2.0, height: 1.8 },
  pickup: { length: 5.8, width: 2.05, height: 1.9 },
  van: { length: 5.2, width: 2.0, height: 2.2 },
  semi: { length: 16, width: 2.6, height: 4.0 },
};

export const CAR_COLORS = ["#c0392b", "#2c3e50", "#7f8c8d", "#1f6fb2", "#d4ac0d", "#ecf0f1", "#16a085", "#5b2c6f", "#1b1b1b", "#b9bec5"];

export function getCarSize(kind) {
  if (CAR_SIZES[kind]) {
    return CAR_SIZES[kind];
  }
  return CAR_SIZES.sedan;
}

// One shared material: the colors live in the geometry.
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
const geometryCache = {};

export function makeCarMesh(kind, color) {
  const key = kind + color;
  if (!geometryCache[key]) {
    geometryCache[key] = buildCarGeometry(kind, color);
  }
  const mesh = new THREE.Mesh(geometryCache[key], material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCarGeometry(kind, color) {
  const size = getCarSize(kind);
  const w = size.width;
  const h = size.height;
  const l = size.length;
  const clearance = 0.3;
  const paint = new THREE.Color(color);
  const glass = new THREE.Color("#14181e");
  const rubber = new THREE.Color("#151515");
  const parts = [];

  if (kind === "semi") {
    // Cab at the front, a long box trailer behind it.
    parts.push(box(w, 2.6, 3.0, 0, clearance + 1.3, l / 2 - 1.5, paint));
    parts.push(box(w * 0.9, 0.8, 0.1, 0, clearance + 2.1, l / 2 + 0.01, glass));
    parts.push(box(w, h - 0.5, l - 3.4, 0, 0.5 + (h - 0.5) / 2, -1.7, new THREE.Color("#d9d9d9")));
  } else if (kind === "pickup") {
    const lower = h * 0.5;
    parts.push(box(w, lower, l, 0, clearance + lower / 2, 0, paint));
    const cabin = h - lower - clearance;
    parts.push(box(w * 0.92, cabin, l * 0.38, 0, clearance + lower + cabin / 2, l * 0.1, glass));
  } else {
    const lower = h * 0.45;
    parts.push(box(w, lower, l, 0, clearance + lower / 2, 0, paint));
    const cabin = h - lower - clearance;
    let cabinLength = l * 0.5;
    if (kind === "van" || kind === "suv") {
      cabinLength = l * 0.75;
    }
    parts.push(box(w * 0.92, cabin, cabinLength, 0, clearance + lower + cabin / 2, -l * 0.05, glass));
  }

  // Head and tail lights, so you can tell which way traffic is going.
  const lightY = clearance + 0.35;
  for (const side of [-1, 1]) {
    parts.push(box(0.35, 0.12, 0.05, side * (w / 2 - 0.3), lightY, l / 2 + 0.02, new THREE.Color("#f6f2dc")));
    parts.push(box(0.35, 0.12, 0.05, side * (w / 2 - 0.3), lightY, -l / 2 - 0.02, new THREE.Color("#ff2a2a")));
  }

  // Four wheels.
  const radius = 0.38;
  const axleZ = l / 2 - 1.0;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(radius, radius, 0.3, 14);
      wheel.rotateZ(Math.PI / 2);
      parts.push(colored(wheel, sideX * (w / 2 - 0.1), radius, sideZ * axleZ, rubber));
    }
  }
  return mergeGeometries(parts);
}

// A person pushing a shopping cart (for the parking lot). Faces +Z.
let shopperGeometry = null;
export function makeShopperMesh(shirtColor) {
  if (!shopperGeometry) {
    shopperGeometry = {};
  }
  if (!shopperGeometry[shirtColor]) {
    const parts = [];
    parts.push(box(0.4, 0.8, 0.3, 0, 0.4, -0.35, new THREE.Color("#2b3442"))); // legs
    parts.push(box(0.5, 0.65, 0.32, 0, 1.12, -0.35, new THREE.Color(shirtColor))); // body
    const head = new THREE.SphereGeometry(0.15, 10, 8);
    parts.push(colored(head, 0, 1.6, -0.35, new THREE.Color("#e0b48f")));
    parts.push(box(0.6, 0.55, 0.8, 0, 0.75, 0.35, new THREE.Color("#c7ccd3"))); // cart
    shopperGeometry[shirtColor] = mergeGeometries(parts);
  }
  const mesh = new THREE.Mesh(shopperGeometry[shirtColor], material);
  mesh.castShadow = true;
  return mesh;
}

function box(w, h, d, x, y, z, color) {
  return colored(new THREE.BoxGeometry(w, h, d), x, y, z, color);
}

// Move a geometry into place and paint every vertex one color.
function colored(geometry, x, y, z, color) {
  geometry.translate(x, y, z);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
