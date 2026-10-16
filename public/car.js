// car.js — Owner: B (friend)
// Car physics: driving, fan suction, the thruster air tank, drive modes, and landing assist.
// Uses Rapier's ray-cast vehicle: each wheel is a ray with a spring, which is simple and stable.
// Pass scene = null to run the physics without any graphics (handy for testing in Node).

import * as THREE from "three";
import { CONFIG } from "./config.js";
import { buildCarModel } from "./car-model.js";
import { Particles } from "./effects.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = CONFIG.physics.gravity;
// Distance from the body's center down to the ground when the car sits at rest.
const REST_HEIGHT = 0.7;

export class Car {
  constructor(RAPIER, world, scene) {
    this.RAPIER = RAPIER;
    this.world = world;
    const c = CONFIG.car;

    // ----- Physics body -----
    // CCD stops a fast car from passing straight through thin things like the curl ramp.
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true).setTranslation(0, 2, 0)
    );
    const colliderDesc = RAPIER.ColliderDesc.cuboid(c.halfWidth, c.halfHeight, c.halfLength)
      .setMassProperties(
        c.mass,
        { x: 0, y: c.centerOfMassY, z: 0 },
        boxInertia(c.mass, c.halfWidth * 2, c.halfHeight * 2, c.halfLength * 2),
        { x: 0, y: 0, z: 0, w: 1 }
      )
      .setFriction(0.5);
    this.collider = world.createCollider(colliderDesc, this.body);

    // ----- Wheels -----
    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1; // Y is up
    this.vehicle.setIndexForwardAxis = 2; // Z is forward (Rapier's setter really is named this)
    // +X is the car's LEFT side, because the car faces +Z.
    const wheelSpots = [
      { x: c.wheelX, z: c.wheelFrontZ }, // 0: front left
      { x: -c.wheelX, z: c.wheelFrontZ }, // 1: front right
      { x: c.wheelX, z: c.wheelRearZ }, // 2: rear left
      { x: -c.wheelX, z: c.wheelRearZ }, // 3: rear right
    ];
    this.wheelSpots = wheelSpots;
    for (let i = 0; i < 4; i++) {
      // The axle points along -X. With that, positive engine force drives toward +Z.
      this.vehicle.addWheel(
        { x: wheelSpots[i].x, y: c.wheelY, z: wheelSpots[i].z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        c.suspensionRestLength,
        c.wheelRadius
      );
      this.vehicle.setWheelSuspensionStiffness(i, c.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, c.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, c.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionForce(i, c.maxSuspensionForce);
      this.vehicle.setWheelFrictionSlip(i, c.grip);
    }

    // ----- Gameplay state -----
    this.mode = "rocket";
    this.fansOn = false;
    this.fanPower = 0; // 0..1, follows fansOn with a short spin-up
    this.tankCapacity = CONFIG.thrusters.tankLitersRocket; // liters, depends on the trim
    this.tankLiters = this.tankCapacity;
    this.tank = 100; // percent, for the HUD and phone
    this.refillTimer = 0;
    this.thrusting = false; // rear thrusters firing this step
    this.lifting = false; // downward (corner) thrusters firing this step, from LIFT
    this.landingBurn = false; // corner thrusters softening a landing by themselves
    this.tankEmptyPressed = false; // pressing a thruster button with an empty tank (HUD flashes)
    // Barrel roll
    this.rolling = false;
    this.rollDirection = 1; // +1 = roll right, -1 = roll left
    this.rollTurned = 0; // how far we've rolled so far (radians)
    this.rollTime = 0;
    this.lastRollInput = 0;
    this.hopTime = 0; // > 0 while the hop burst is showing
    this.yawThrust = 0; // -1/0/+1, front yaw thrusters (for the effect)
    this.braking = 0;
    this.steerAngle = 0;
    this.speedKmh = 0;
    this.airborne = false;
    this.airTime = 0;
    this.altitude = 0;
    this.upsideDownTime = 0;
    this.needsReset = false;
    this.usedThrustBefore = false;
    this.events = [];
    this.lastVelocity = new THREE.Vector3();
    this.crashCooldown = 0;
    this.spawn = { x: 0, y: 0, z: 0, heading: 0 };
    // The game can set this to a function(collider) that returns a grip multiplier
    // for whatever a wheel is touching (for example less grip on grass).
    this.surfaceGrip = null;

    // Physics runs at a fixed rate, but the screen may refresh faster.
    // We remember the last two physics poses and draw the car in between them.
    this.prevPosition = new THREE.Vector3();
    this.currPosition = new THREE.Vector3();
    this.prevQuaternion = new THREE.Quaternion();
    this.currQuaternion = new THREE.Quaternion();

    // ----- Graphics (skipped when testing without a scene) -----
    this.model = null;
    if (scene) {
      this.model = buildCarModel();
      scene.add(this.model.root);
      this.plume = new Particles(scene, 1200, 0xd8ecff, 1.0);
      this.plume.drag = 4.0;
      this.fanAir = new Particles(scene, 300, 0x3fc8ff, 0.3);
    }
  }

  // Put the car back at the spawn point, upright, with a full tank.
  reset(spawn) {
    if (spawn) {
      this.spawn = spawn;
    }
    const s = this.spawn;
    const heading = THREE.MathUtils.degToRad(s.heading || 0);
    const rotation = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, heading);
    this.body.setTranslation({ x: s.x, y: (s.y || 0) + CONFIG.car.spawnHeight, z: s.z }, true);
    this.body.setRotation(rotation, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.tankLiters = this.tankCapacity;
    this.tank = 100;
    this.rolling = false;
    this.steerAngle = 0;
    this.airTime = 0;
    this.upsideDownTime = 0;
    this.needsReset = false;
    this.lastVelocity.set(0, 0, 0);
    this.savePose();
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);
  }

  // The three trims from the reveal. Switching trims gives you that trim's full air tank.
  // performance: fans only. thrust: fans + 4 rear thrusters (200 L).
  // rocket: all 10 thrusters: rear, 4 corner (lift and roll), 2 front (yaw) (600 L).
  setMode(mode) {
    this.mode = mode;
    if (mode === "rocket") {
      this.tankCapacity = CONFIG.thrusters.tankLitersRocket;
    } else if (mode === "thrust") {
      this.tankCapacity = CONFIG.thrusters.tankLitersThrust;
    } else {
      this.tankCapacity = 0;
    }
    this.tankLiters = this.tankCapacity;
    this.rolling = false;
    this.updateTankPercent();
  }

  hasRearThrusters() {
    return this.mode === "thrust" || this.mode === "rocket";
  }

  hasCornerThrusters() {
    return this.mode === "rocket";
  }

  // One physics step. Call this BEFORE world.step().
  step(input, dt) {
    const c = CONFIG.car;
    const body = this.body;
    const vehicle = this.vehicle;
    const mass = c.mass;

    // Rapier keeps added forces between steps, so clear last step's forces first.
    body.resetForces(true);

    const forward = this.getForward();
    const up = this.getUp();
    const velocity = toVector3(body.linvel());
    // Speed along the car's nose (negative when reversing). We don't use Rapier's
    // currentVehicleSpeed() because it also counts falling speed.
    const speed = velocity.dot(forward);
    this.speedKmh = Math.abs(speed) * 3.6;

    // ----- Steering: smaller angle at high speed, and the wheels turn smoothly -----
    const speedFactor = Math.min(1, this.speedKmh / c.highSpeedForSteerKmh);
    const maxAngle = c.maxSteerAngle + (c.highSpeedSteerAngle - c.maxSteerAngle) * speedFactor;
    // Rapier: a positive angle turns LEFT. Our input: +1 means RIGHT. So flip the sign.
    const targetAngle = -input.steer * maxAngle;
    this.steerAngle = moveToward(this.steerAngle, targetAngle, c.steerSpeed * dt);
    vehicle.setWheelSteering(0, this.steerAngle);
    vehicle.setWheelSteering(1, this.steerAngle);

    // ----- Gas, brake, and reverse -----
    let engine = 0;
    let brake = 0;
    if (input.gas > 0) {
      // The motor pushes less as we get near top speed.
      const room = Math.max(0, 1 - this.speedKmh / c.topSpeedKmh);
      engine = input.gas * c.engineForce * room;
    }
    if (input.brake > 0) {
      if (speed > 1) {
        // Moving forward: brake.
        brake = input.brake * c.brakeForce;
        engine = 0;
      } else if (input.gas === 0) {
        // Stopped or rolling back: the brake pedal means reverse.
        engine = -input.brake * c.reverseForce;
      }
    }
    if (input.gas === 0 && input.brake === 0) {
      brake = c.coastBrake;
    }
    this.braking = 0;
    if (brake > c.coastBrake) {
      this.braking = 1;
    }
    for (let i = 0; i < 4; i++) {
      vehicle.setWheelEngineForce(i, engine);
      vehicle.setWheelBrake(i, brake);
    }

    // ----- Fans: suck the car onto whatever it's driving on -----
    let fanTarget = 0;
    if (this.fansOn) {
      fanTarget = 1;
    }
    this.fanPower = moveToward(this.fanPower, fanTarget, dt / CONFIG.fans.spinUpSeconds);
    const contacts = this.countWheelContacts();
    // (Skipped during a barrel roll, so the fans don't fight the hop.)
    if (this.fanPower > 0 && contacts > 0 && !this.rolling) {
      // Pull along the car's own "down", so it also sticks to ramps and slopes.
      const suction = this.fanPower * CONFIG.fans.downforceG * mass * GRAVITY * (contacts / 4);
      body.addForce(scaled(up, -suction), true);
    }
    // More downforce already means more grip. extraGrip can add even more.
    // Each wheel also checks what it's driving on (grass is slippery).
    const grip = c.grip * (1 + (CONFIG.fans.extraGrip - 1) * this.fanPower);
    for (let i = 0; i < 4; i++) {
      let surface = 1;
      const ground = vehicle.wheelGroundObject(i);
      if (ground && this.surfaceGrip) {
        surface = this.surfaceGrip(ground);
      }
      vehicle.setWheelFrictionSlip(i, grip * surface);
    }

    // ----- Thrusters and the air tank -----
    this.thrusting = false;
    this.lifting = false;
    this.landingBurn = false;
    let airUsed = 0; // liters this step
    const rocket = CONFIG.rocket;
    const wantsThrust = input.thrust && this.hasRearThrusters();
    const wantsLift = input.lift && this.hasCornerThrusters();
    this.tankEmptyPressed = (wantsThrust || wantsLift) && this.tankLiters <= 0;

    // Rear thrusters push the car forward.
    if (wantsThrust && this.tankLiters > 0) {
      this.thrusting = true;
      body.addForce(scaled(forward, CONFIG.thrusters.rearForce), true);
      airUsed = airUsed + this.airForForce(CONFIG.thrusters.rearForce, dt);
      if (!this.usedThrustBefore) {
        this.usedThrustBefore = true;
        this.addEvent("first_thrust");
      }
    }

    // LIFT: the four corner thrusters push up. Tipping the phone forward (pitch -1) leans the push forward.
    if (wantsLift && this.tankLiters > 0) {
      this.lifting = true;
      const lean = THREE.MathUtils.degToRad(-input.pitch * rocket.maxTiltDeg);
      const direction = scaled(up, Math.cos(lean)).addScaledVector(forward, Math.sin(lean));
      const liftForce = rocket.liftG * mass * GRAVITY;
      body.addForce(scaled(direction, liftForce), true);
      airUsed = airUsed + this.airForForce(liftForce, dt);
    }

    // Soft landing: if we're falling too fast to stop before the ground, the corner thrusters
    // brake the fall. They start just in time, like a rocket landing.
    const fallSpeed = -velocity.y;
    const brakeAcceleration = (rocket.landingBurnG - 1) * GRAVITY;
    const brakeDistance = (fallSpeed * fallSpeed - rocket.touchdownSpeed * rocket.touchdownSpeed) / (2 * brakeAcceleration);
    const fallingFast = fallSpeed > rocket.touchdownSpeed && this.altitude < brakeDistance + 0.5;
    if (this.hasCornerThrusters() && rocket.autoLandingBurn && this.airborne && fallingFast &&
        !this.lifting && !this.rolling && up.y > 0.5 && this.tankLiters > 0) {
      this.landingBurn = true;
      const burnForce = rocket.landingBurnG * mass * GRAVITY;
      body.addForce({ x: 0, y: burnForce, z: 0 }, true);
      airUsed = airUsed + this.airForForce(burnForce, dt);
    }

    // ROLL: start a barrel roll when the button is first pressed.
    const rollPressed = input.roll !== 0 && this.lastRollInput === 0;
    this.lastRollInput = input.roll;
    if (rollPressed && this.hasCornerThrusters() && !this.rolling) {
      this.startRoll(input.roll);
    }
    if (this.rolling) {
      this.continueRoll(dt);
    }
    if (this.hopTime > 0) {
      this.hopTime = this.hopTime - dt;
    }

    // Take the air out of the tank, or refill it when the thrusters are quiet.
    if (airUsed > 0) {
      this.tankLiters = this.tankLiters - airUsed;
      this.refillTimer = CONFIG.thrusters.refillDelay;
      if (this.tankLiters <= 0) {
        this.tankLiters = 0;
        this.addEvent("tank_empty");
      }
    } else if (wantsThrust || wantsLift) {
      // Holding a thruster button on an empty tank does nothing, and doesn't refill either.
    } else if (this.refillTimer > 0) {
      this.refillTimer = this.refillTimer - dt;
    } else {
      const refillPerSecond = this.tankCapacity / CONFIG.thrusters.refillSeconds;
      this.tankLiters = Math.min(this.tankCapacity, this.tankLiters + refillPerSecond * dt);
    }
    this.updateTankPercent();

    // ----- Air drag (keeps top speed sane while thrusting) -----
    const speedSquared = velocity.lengthSq();
    if (speedSquared > 1) {
      const drag = velocity.clone().normalize().multiplyScalar(-c.airDrag * speedSquared);
      body.addForce(drag, true);
    }

    // ----- In the air (the barrel roll takes over the spin while it runs) -----
    this.yawThrust = 0;
    if (this.airborne && !this.rolling) {
      if (this.mode === "rocket") {
        // Flying: stay level like a drone, and turn with the front yaw thrusters.
        this.levelOut(-input.steer * rocket.yawRate, dt);
        if (Math.abs(input.steer) > 0.15) {
          this.yawThrust = Math.sign(input.steer);
        }
      } else if (this.altitude < CONFIG.air.landingAssistHeight) {
        // Landing assist: rotate back to level before touching down.
        this.levelOut(null, dt);
      }
    }

    vehicle.updateVehicle(dt);
  }

  // Call this AFTER world.step(). Reads where the car ended up and detects events.
  afterStep(dt) {
    const body = this.body;

    // Airborne = no wheel touching anything.
    const wasAirborne = this.airborne;
    this.airborne = this.countWheelContacts() === 0;
    if (this.airborne) {
      this.airTime = this.airTime + dt;
    } else {
      if (wasAirborne && this.airTime > 0.4) {
        this.addEvent("landing");
        if (this.airTime > 1.2) {
          this.addEvent("big_jump");
        }
      }
      this.airTime = 0;
    }

    // Altitude: cast a ray straight down, ignoring the car itself.
    const position = body.translation();
    const ray = new this.RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 500, true, undefined, undefined, undefined, body);
    if (hit) {
      this.altitude = Math.max(0, hit.timeOfImpact - REST_HEIGHT);
    } else {
      this.altitude = 0;
    }

    // Crash: the sideways/forward speed changed a lot in one step (thrusters can't do that).
    // We ignore up/down speed, so a normal landing doesn't count as a crash.
    const velocity = toVector3(body.linvel());
    velocity.y = 0;
    const change = velocity.distanceTo(this.lastVelocity);
    this.lastVelocity.copy(velocity);
    this.crashCooldown = this.crashCooldown - dt;
    if (change > 6 && this.crashCooldown <= 0) {
      this.addEvent("crash");
      this.crashCooldown = 1.0;
    }

    // Upside down for a while = tell the player to reset. Driving upside down on a ramp with the
    // fans on is allowed (wheels still touching), so only count it when no wheel is touching.
    if (this.getUp().y < 0.1 && this.countWheelContacts() === 0) {
      this.upsideDownTime = this.upsideDownTime + dt;
    } else {
      this.upsideDownTime = 0;
    }
    if (this.upsideDownTime > CONFIG.air.flipResetSeconds && !this.needsReset) {
      this.needsReset = true;
      this.addEvent("flip");
    }
    if (this.upsideDownTime === 0) {
      this.needsReset = false;
    }

    this.savePose();
  }

  // Draw the car. alpha (0..1) says how far we are between the last two physics steps.
  updateVisuals(alpha, dt, time) {
    if (!this.model) {
      return;
    }
    const model = this.model;
    model.root.position.lerpVectors(this.prevPosition, this.currPosition, alpha);
    model.root.quaternion.slerpQuaternions(this.prevQuaternion, this.currQuaternion, alpha);

    // Wheels: move with the suspension, turn with the steering, and roll.
    const c = CONFIG.car;
    for (let i = 0; i < 4; i++) {
      let suspension = this.vehicle.wheelSuspensionLength(i);
      if (suspension === null) {
        suspension = c.suspensionRestLength;
      }
      const wheel = model.wheels[i];
      wheel.steer.position.set(this.wheelSpots[i].x, c.wheelY - suspension, this.wheelSpots[i].z);
      wheel.steer.rotation.y = this.vehicle.wheelSteering(i) || 0;
      wheel.spin.rotation.x = this.vehicle.wheelRotation(i) || 0;
    }

    // Which of the four corner thrusters are firing (order: front-left, front-right, rear-left, rear-right).
    // A roll to the right pushes the LEFT side up, so the left pair fires.
    let cornerFiring = [false, false, false, false];
    if (this.lifting || this.landingBurn || this.hopTime > 0) {
      cornerFiring = [true, true, true, true];
    } else if (this.rolling && this.rollDirection > 0) {
      cornerFiring = [true, false, true, false];
    } else if (this.rolling) {
      cornerFiring = [false, true, false, true];
    }

    model.setFans(this.fanPower, time);
    model.setThrust(this.thrusting, time);
    model.setCornerThrusters(cornerFiring, time);
    model.setYawThrusters(this.yawThrust, time);
    model.setBraking(this.braking);

    // Particles: thruster plumes and air rushing out from under the car.
    model.root.updateMatrixWorld();
    const carVelocity = toVector3(this.body.linvel());
    const forward = this.getForward();
    const up = this.getUp();
    // Cold gas makes a white vapor cloud, not a flame. The puffs shoot out, slow down
    // quickly, and hang in the air, so a trail is left behind the car.
    if (this.thrusting) {
      for (const nozzle of model.rearNozzles) {
        for (let n = 0; n < 5; n++) {
          const spot = model.root.localToWorld(nozzle.clone());
          const push = scaled(forward, -(9 + Math.random() * 7)).add(randomVector(4));
          this.plume.emit(spot, push.add(carVelocity), 0.6 + Math.random() * 0.4);
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      if (!cornerFiring[i]) {
        continue;
      }
      for (let n = 0; n < 3; n++) {
        const spot = model.root.localToWorld(model.liftNozzles[i].clone());
        const push = scaled(up, -(8 + Math.random() * 5)).add(randomVector(4));
        this.plume.emit(spot, push.add(carVelocity), 0.6 + Math.random() * 0.4);
      }
    }
    if (this.yawThrust !== 0) {
      // Turning right pushes the nose right, so the thruster on the left of the nose fires outward.
      let index = 0;
      if (this.yawThrust < 0) {
        index = 1;
      }
      const nozzle = model.yawNozzles[index];
      const outward = new THREE.Vector3(Math.sign(nozzle.x), 0, 0).applyQuaternion(model.root.quaternion);
      for (let n = 0; n < 2; n++) {
        const spot = model.root.localToWorld(nozzle.clone());
        this.plume.emit(spot, scaled(outward, 8 + Math.random() * 4).add(carVelocity), 0.4);
      }
    }
    if (this.fanPower > 0.2 && !this.airborne) {
      for (let n = 0; n < 3; n++) {
        // Air shoots out sideways from under the car.
        let side = 1;
        if (Math.random() < 0.5) {
          side = -1;
        }
        const local = new THREE.Vector3(side * 1.0, -0.6, (Math.random() - 0.5) * 3.6);
        const spot = model.root.localToWorld(local);
        const sideways = new THREE.Vector3(side * 6, 0.5, 0).applyQuaternion(model.root.quaternion);
        this.fanAir.emit(spot, sideways.add(carVelocity).add(randomVector(1)), 0.25);
      }
    }
    this.plume.update(dt);
    this.fanAir.update(dt);
  }

  // Events since the last call (crash, landing, tank_empty, ...). Reading them clears the list.
  takeEvents() {
    const list = this.events;
    this.events = [];
    return list;
  }

  addEvent(name) {
    this.events.push(name);
    if (this.events.length > 10) {
      this.events.shift();
    }
  }

  // ----- Barrel roll -----
  // Like the reveal car, the roll is computer-controlled: the player just asks for it.
  // On the ground, the four corner thrusters first kick the car up so it has room to spin.

  startRoll(direction) {
    const rocket = CONFIG.rocket;
    let airNeeded = rocket.rollAirLiters;
    if (!this.airborne) {
      airNeeded = airNeeded + rocket.hopAirLiters;
    }
    if (this.tankLiters < airNeeded) {
      this.addEvent("tank_empty");
      return;
    }
    this.tankLiters = this.tankLiters - airNeeded;
    this.refillTimer = CONFIG.thrusters.refillDelay;

    if (!this.airborne) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: v.x, y: Math.max(v.y, 0) + rocket.rollHopSpeed, z: v.z }, true);
      this.hopTime = 0.25;
    }
    this.rolling = true;
    this.rollDirection = direction;
    this.rollTurned = 0;
    this.rollTime = 0;
    this.addEvent("barrel_roll");
  }

  continueRoll(dt) {
    this.rollTime = this.rollTime + dt;
    // Give the hop a moment to lift the wheels off the ground before spinning.
    if (!this.airborne && this.rollTime < 0.15) {
      return;
    }
    // Spin around the car's own nose-to-tail line. A positive spin around "forward" lifts the
    // left side (+X), which is a roll to the RIGHT. Any other spin is cancelled so the roll is clean.
    const rate = (2 * Math.PI) / CONFIG.rocket.rollSeconds;
    const spin = this.getForward().multiplyScalar(rate * this.rollDirection);
    this.body.setAngvel(spin, true);
    this.rollTurned = this.rollTurned + rate * dt;

    // Stop after most of a full turn, as soon as the car is upright again.
    // (Starting upside down, e.g. off the curl ramp, that's 1.5 turns, which looks great.)
    const upright = this.getUp().y > 0.97;
    if ((this.rollTurned > Math.PI * 1.5 && upright) || this.rollTime > 3) {
      this.rolling = false;
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  // Liters of air used by a thruster pushing with this force for dt seconds.
  airForForce(force, dt) {
    return (force / CONFIG.thrusters.rearForce) * CONFIG.thrusters.litersPerSecondAtFullRear * dt;
  }

  updateTankPercent() {
    if (this.tankCapacity > 0) {
      this.tank = (this.tankLiters / this.tankCapacity) * 100;
    } else {
      this.tank = 0;
    }
  }

  // ----- Helpers -----

  // Rotate the car back toward level by adjusting its spin, like a gyroscope.
  // yawTarget: how fast to turn left/right, or null to keep turning as it already is.
  levelOut(yawTarget, dt) {
    const up = this.getUp();
    // Spinning around (up x worldUp) rotates "up" toward the sky.
    const correction = new THREE.Vector3().crossVectors(up, WORLD_UP).multiplyScalar(CONFIG.air.levelSpeed);
    const spin = toVector3(this.body.angvel());
    let yaw = spin.dot(WORLD_UP);
    if (yawTarget !== null) {
      yaw = yawTarget;
    }
    const target = correction.addScaledVector(WORLD_UP, yaw);
    const blend = 1 - Math.exp(-CONFIG.air.levelBlend * dt);
    spin.lerp(target, blend);
    this.body.setAngvel(spin, true);
  }

  countWheelContacts() {
    let count = 0;
    for (let i = 0; i < 4; i++) {
      if (this.vehicle.wheelIsInContact(i)) {
        count = count + 1;
      }
    }
    return count;
  }

  getForward() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.getQuaternion());
  }

  getUp() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.getQuaternion());
  }

  getQuaternion() {
    const r = this.body.rotation();
    return new THREE.Quaternion(r.x, r.y, r.z, r.w);
  }

  getPosition() {
    return toVector3(this.body.translation());
  }

  savePose() {
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);
    this.currPosition.copy(toVector3(this.body.translation()));
    this.currQuaternion.copy(this.getQuaternion());
  }
}

// Rotational inertia of a solid box. Rapier needs this because we set the mass by hand.
function boxInertia(mass, width, height, length) {
  return {
    x: (mass / 12) * (height * height + length * length),
    y: (mass / 12) * (width * width + length * length),
    z: (mass / 12) * (width * width + height * height),
  };
}

function toVector3(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function scaled(v, amount) {
  return v.clone().multiplyScalar(amount);
}

function randomVector(size) {
  return new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size);
}

function moveToward(current, target, maxChange) {
  if (current < target) {
    return Math.min(target, current + maxChange);
  }
  return Math.max(target, current - maxChange);
}
