// config.js — Owner: shared (small edits only, merge often)
// Every tunable physics and gameplay number lives here, so we can tweak the feel quickly.
// Units: meters, kilograms, seconds, newtons, radians (unless the name says Deg or Kmh).
// Numbers marked "reveal" are Tesla's claims from the Oct 15, 2026 event (not verified).

export const CONFIG = {
  physics: {
    gravity: 9.81,
    timestep: 1 / 60, // physics runs at a fixed 60 steps per second
    maxStepsPerFrame: 4, // if the laptop lags, don't try to catch up forever
  },

  car: {
    mass: 1800, // not announced; reports range from "under 1,700" to ~2,350 kg
    // Physics box for the body (half sizes). The 3D model is drawn to roughly match.
    halfWidth: 0.95,
    halfHeight: 0.3,
    halfLength: 2.15,
    centerOfMassY: -0.25, // lower center of mass = harder to flip over

    // Wheels. Positions are relative to the center of the body.
    wheelRadius: 0.36,
    wheelX: 0.83,
    wheelY: -0.1,
    wheelFrontZ: 1.25,
    wheelRearZ: -1.25,
    suspensionRestLength: 0.3,
    suspensionStiffness: 38, // higher = stiffer (Rapier multiplies this by the car's mass)
    suspensionCompression: 2.0, // damping while compressing
    suspensionRelaxation: 2.5, // damping while extending
    maxSuspensionForce: 200000, // high, so the fans can push the car down hard

    // Tire grip. Roughly "how many g the car can corner with" before it slides wide.
    grip: 1.2,

    // Driving
    // Per wheel, all-wheel drive. More than the tires can grip, so fans help launches.
    // Tuned so fans + motor alone do 0-60 mph in about 1.6 s (reveal: Performance trim "under 1.6 s").
    engineForce: 9500,
    reverseForce: 2500,
    brakeForce: 90, // braking impulse per wheel per step
    coastBrake: 2, // tiny brake when no pedal is pressed, so the car rolls to a stop
    topSpeedKmh: 338, // reveal: 210 mph on the motor alone (thrusters can push past it)
    airDrag: 0.4, // force = airDrag * speed^2

    // Steering gets smaller at high speed so the car stays drivable.
    maxSteerAngle: 0.5, // at a standstill
    highSpeedSteerAngle: 0.12, // at highSpeedForSteerKmh
    highSpeedForSteerKmh: 200,
    steerSpeed: 5, // how fast the wheels turn toward the target angle

    spawnHeight: 1.0, // drop the car from a little above the spawn point
  },

  fans: {
    // Four underbody fans suck the car onto whatever it's driving on. Works even when stopped.
    // Reveal: "up to two g's", enough to drive upside down (2 g suction - 1 g gravity = 1 g left).
    downforceG: 2.0, // extra force toward the road, as a multiple of the car's weight
    extraGrip: 1.0, // grip multiplier on top of the extra downforce (1 = no extra)
    spinUpSeconds: 0.35, // fans take a moment to spin up and down
  },

  thrusters: {
    // Cold-gas thrusters fed by a compressed-air tank. Reveal: 10 thrusters on the Rocket trim:
    // 4 rear (push forward), 4 pointing down at the corners (lift/roll), 2 at the front (yaw).
    rearForce: 80000, // newtons from the 4 rear ports (reveal: "over 80 kN", about 4.5 g here)
    tankLitersThrust: 200, // reveal: Thrust trim stores 200 L
    tankLitersRocket: 600, // reveal: Rocket trim adds 400 L more (it replaces the passenger seat)
    // Air use scales with force. At full rear thrust 600 L lasts ~1.8 s (estimates say 1.5-2 s).
    litersPerSecondAtFullRear: 330,
    refillSeconds: 10, // empty to full. The real car needs hours; this is a game.
    refillDelay: 0.6, // wait this long after thrusting before refilling
  },

  rocket: {
    // Rocket trim only.
    // LIFT (hold): the 4 corner thrusters push up. Tilt the phone to lean the push forward/back.
    liftG: 1.35, // more than 1 so you rise; tap it to hover
    maxTiltDeg: 35, // how far the push can lean forward/back
    yawRate: 1.6, // front yaw thrusters: how fast you can turn while flying (radians per second)

    // ROLL (tap): the corner thrusters on one side fire, spinning the car around its long axis.
    // It's automatic like the reveal car: it hops if needed, rolls, and stops upright.
    rollSeconds: 0.85, // time for one 360-degree roll
    rollHopSpeed: 7.5, // upward kick when rolling from the ground (about a 3 m hop)
    rollAirLiters: 50, // air used by one roll
    hopAirLiters: 40, // air used by the hop

    // Soft landing: when falling fast near the ground, the down thrusters fire on their own
    // (reveal: the car "eased itself to a landing").
    autoLandingBurn: true,
    landingBurnG: 2.5, // push of the burn, as a multiple of the car's weight
    touchdownSpeed: 3, // the burn aims to touch down at about this speed (m/s)
  },

  surfaces: {
    grassGrip: 0.55, // grip multiplier off the track on grass (fans still help)
  },

  air: {
    // Help the car land the right way up.
    landingAssistHeight: 4.0, // start leveling the car when this close to the ground
    levelSpeed: 3.0, // how strongly the car rotates back to level
    levelBlend: 4.0, // how quickly that correction takes over
    flipResetSeconds: 1.5, // upside down this long = show "press R"
  },

  camera: {
    chaseDistance: 7.5,
    chaseHeight: 2.6,
    chaseLookAhead: 3.0,
    chaseSmoothing: 6.0, // higher = camera sticks closer to the car
    baseFov: 62,
    fastFov: 78, // the camera widens with speed to feel faster
    fastFovKmh: 220,
    shakeOnThrust: 0.06,
    stuntDistance: 18, // side camera during rolls, curls and big jumps
    stuntHeight: 3,
  },

  phone: {
    sendRateHz: 30, // how often the phone sends its controls
    timeoutMs: 600, // no phone message for this long = phone disconnected
    steerMaxDeg: 30, // tilting the phone's long edge this far from level = full steering
    steerDeadZoneDeg: 3, // small wobbles near center are ignored
    steerSmoothing: 0.35, // 0..1, lower = smoother but slower
    pitchMaxDeg: 25, // tilting the phone this far forward/back = full pitch
    invertSteer: false, // flip this if steering goes the wrong way on some phone
  },

  network: {
    stateRateHz: 5, // how often the game tells the phone its speed, tank, etc.
  },
};
