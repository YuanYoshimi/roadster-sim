# Master Prompt — Roadster Driving Sim (Tokyo Agent Hackathon)

**How to use this file (for humans):**
1. **Yuan** pastes this whole file into Claude Code first. Claude Code sets up the GitHub repo (see "Step 0"), saves this file in the repo as `CLAUDE.md`, and builds the skeleton.
2. **The friend** then clones the repo and starts Claude Code inside it. Claude Code reads `CLAUDE.md` automatically, so the friend only needs the short "Friend's starter prompt" at the bottom of this file.

---

## Current status (update as you go)

- **Looks pass (Oct 16 evening):** **real Suzuka** (`levels/suzuka.json`, built by `tools/build-suzuka.mjs` from OpenStreetMap + NASA SRTM heights: 5.8 km, real elevation, crossover bridge) with terrain shaped around the track, a **speed-adaptive racing line** (G), and circuit dressing for every `track` (curbs only in corners, gravel traps that slow you, guardrails, pit lane, grandstands with a crowd, woods, horizon hills). Physically based sky, photo textures (Poly Haven CC0), rounded traffic cars. Top speed is now per trim (210 / 230 / 233 mph). The stunt camera that swung out while flying was removed (the user didn't like it). Attribution for OSM/SRTM/Poly Haven is in the README "Credits" section; keep it.
- **Realism + demo pass:** real tire model (magic formula, load sensitivity, friction circle), power-limited 1 MW motors with regen, TC/ABS/ESC, anti-roll bars, bump stops, aero drag + downforce with an active wing, thrusters use real air mass and pressure (the car gets lighter), 120 Hz physics. New sculpted car model with a full cockpit (yoke + live screens), telemetry panel (T), procedural sound (M to mute), title screen, guided demo tour, presentation mode (P).
- **Scenarios added:** Figure-8 Circuit (Suzuka-style), Warehouse Store Parking (Costco-style), Rush-Hour Expressway, built from generator props (see Milestone 5).
- **Oct 16 prototype is on `main`:** keyboard driving, fans, all 10 thrusters (BOOST, LIFT, automatic barrel ROLL, yaw, soft landing), 3 trims, Blank + Reveal Curl + Reveal Jump levels, phone yoke over an HTTPS tunnel (tilt works upright or flat; drag-the-yoke fallback). The spec was updated to match the real Oct 15 reveal (see Milestone 3, "Reveal facts"). AI coach and scenario generator are not built yet.
- The repo is **private** for now. Make it public before submitting (command in README).
- `npm run phone` tries cloudflared, then falls back to ngrok (some networks block Cloudflare quick tunnels). `npm run phone:ngrok` skips straight to ngrok.
- Testing tip: `window.game` in the browser console exposes the car, world and camera. `game.frame(time)` steps one frame by hand.

## Who we are and what this is

We're a **team of two**: Yuan and a friend, building at the **Tokyo Agent Hackathon** (+81 Builders) on **Saturday Oct 17, 2026**. Each of us runs our own Claude Code on our own laptop, working in the **same GitHub repo**. Building starts at 10:30 and **submissions close at 16:00 sharp**. Judging is a **3-minute live demo** at our table, and the top 5 teams demo on a projector.

**The project:** a browser driving simulator of Tesla's newly revealed next-gen Roadster. The Roadster was revealed on Oct 15, 2026. Its headline features are fan suction (up to 2 g, enough to drive upside down) and 10 cold-gas thrusters that let it boost, jump, barrel roll and fly (see "Reveal facts" below). Most people have no idea how you'd actually drive a car like this. My sim lets you drive it using **your phone as the steering yoke**: tilt to steer, with on-screen buttons for gas, brake, fans, and thrusters. An **AI coach** teaches you how to use the fans and thrusters while you drive. Later, **AI-generated real-world situations** like busy Tokyo traffic or someone stealing your parking spot drop you into tricky scenarios.

**The pitch in one line:** "Tesla just revealed a car that can stick to the ceiling and fly. Nobody knows how to drive it. Here's a simulator with an AI instructor, controlled with your phone."

## Hackathon rules you must respect

- **The project must use AI and must use at least one sponsor tool.** We use **ai& Inference**, an AI inference API running on GPUs in Japan. It is OpenAI- and Claude-compatible, with open models like Kimi and DeepSeek. Read the base URL, API key, and model name from `.env` (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`). I'll fill these in from the sponsor setup guide. Never hard-code or commit keys. Add `.env.example` and put `.env` in `.gitignore`.
- **Judging criteria (5 pts each):**
  1. Real problem?
  2. Does it work (live demo)?
  3. Does AI make it better?
  4. Is the 3-minute presentation clear?
  5. Is it creative?
- **Submission needs:** a **public code repo**, a project description, and an explanation of how we used the sponsor tool.
- **Working beats perfect.** One working core flow is worth more than ten half-built features. **The app must be runnable and demoable after every milestone.**
- **Do not copy code from other projects.** In particular, do not copy "Roadster Flight Lab" (roadster-flight-lab.oxog.dev), a fan-made sim that is not open source. Write everything ourselves. Normal open-source libraries (three.js, Rapier, ws, express, etc.) are fine.
- **Do not use Tesla's official assets, logos, or 3D models.** The car is described as "inspired by the Tesla Roadster" and is an original stylized model.

## Coding style (important)

- **Write code plainly.** Prefer simple, readable code over clever or "optimal" code. Avoid syntax or functions most people wouldn't know, such as heavy destructuring, chained ternaries, reduce tricks, or clever generics. Use clear variable names and short comments explaining *why*.
- Use plain JavaScript (ES modules), not TypeScript. Keep the number of dependencies small.
- Put all tunable physics and gameplay numbers in **one config file** (`public/config.js`) so I can tweak feel quickly during the event.
- **Commit small and often** (every working change) with a clear message, and follow the team git workflow below.

## Step 0: GitHub repo setup (Yuan's Claude Code does this once, first)

1. Check that `git` and the GitHub CLI `gh` are installed and that `gh auth status` shows Yuan logged in. If not, tell Yuan exactly what to run (`gh auth login`) and wait.
2. Create the project folder `roadster-sim`, run `git init`, and add a `.gitignore` for Node (`node_modules/`, `.env`, `.DS_Store`, `dist/`).
3. Save **this entire prompt** as `CLAUDE.md` in the repo root, so both teammates' Claude Code sessions follow the same instructions.
4. Build the **skeleton** before anything else:
   - Every file in the "Files and ownership" list below exists, with a short comment at the top saying what it's for and who owns it.
   - `npm start` runs and shows a blank 3D scene.
   - `public/shared/protocol.js` defines the shared data formats (see "Shared contracts").
5. Make the first commit, then create a **public** repo and push: `gh repo create roadster-sim --public --source=. --push`. It must be public for the hackathon submission.
6. Add the friend as a collaborator. Ask Yuan for the friend's GitHub username, then run `gh api -X PUT repos/<yuan-username>/roadster-sim/collaborators/<friend-username>`. Tell Yuan the friend must **accept the invite** (email or github.com/notifications) before they can push.
7. Print the clone command for the friend: `git clone https://github.com/<yuan-username>/roadster-sim.git`.

## Team git workflow (both Claude Codes must follow this)

Keep it simple. We're two people with one day, so we use a **lightweight branch workflow**:

- **`main` must always run.** Never push broken code to `main`.
- Each person works on **their own branch**: `yuan` and `friend` (or a short feature branch like `yuan/phone-controller`).
- **Before starting any new task:** `git checkout <my-branch>` then `git pull origin main` (or `git merge main`) to get the teammate's latest work.
- **When a piece works** (aim for every 30–60 minutes): commit, run the app to check nothing broke, then merge into `main` and push. Either:
  - **Quick way:** `git checkout main && git pull && git merge <my-branch> && npm start` (quick check) `&& git push`, then go back to your branch and merge `main` into it.
  - **PR way:** push the branch and open a pull request with `gh pr create --fill`, then merge it with `gh pr merge --merge`. Use the PR way if the change touches files the other person owns.
- After pushing to `main`, tell the human to **tell their teammate** "I pushed X to main, pull it."
- **Merge conflicts:** if a merge conflicts, stop, show the human which files conflict and what each side changed, and resolve them carefully by **keeping both people's changes** where possible. Never resolve a conflict by just deleting the other person's work. Run the app after resolving.
- **Never** force-push (`git push --force`) to `main`, never rewrite shared history, and never commit `.env` or API keys.
- Each person stays mostly **inside the files they own** (below). If you need to change a file the other person owns, keep the change small and mention it in the commit message.

## Files and ownership (split to avoid conflicts)

Split the work so we rarely edit the same file. **Person A = Yuan, Person B = friend.** Swap if we decide otherwise. Update this table in `CLAUDE.md` if we change it.

| File | Owner | What it does |
|---|---|---|
| `server.js` | A | Express static server, WebSocket relay, AI proxy endpoints |
| `public/phone.html`, `public/phone.js` | A | Phone yoke controller |
| `public/coach.js` | A | Sends car state to the server, shows and speaks tips |
| `server/ai.js` | A | ai& calls: coach tips + scenario generator + JSON validation |
| `public/game.html`, `public/game.js` | B | Scene, camera, game loop, HUD, level menu |
| `public/car.js` | B | Car physics: driving, fans, thruster tank, modes |
| `public/car-model.js` | B | Stylized car mesh (swappable for .glb later) |
| `public/effects.js` | B | Particle effects (thruster vapor, fan air) |
| `public/scenery.js` | B | Generator props: `track` (+ terrain, Suzuka dressing), `parking_lot`, `highway` |
| `public/trackside.js` | B | Circuit dressing: corner detection, curbs, gravel traps, guardrails, pit lane, grandstands, horizon hills |
| `public/racing-line.js` | B | Speed-adaptive racing line (green / yellow / red) |
| `public/decor.js` | B | Trees, buildings, Ferris wheel, pit building, hangars, sound walls, overpasses |
| `public/environment.js` | B | Sky, sun, reflections, haze |
| `public/materials.js`, `public/textures/` | B | Photo-textured surfaces (asphalt, grass, concrete, gravel; Poly Haven CC0) |
| `tools/build-suzuka.mjs`, `tools/data/` | B | Builds `levels/suzuka.json` from OpenStreetMap (cached) + SRTM elevation |
| `public/traffic.js` | B | Moving cars and people (highway traffic, lot cruisers, rival, shoppers) |
| `public/vehicles.js` | B | Box-style car/truck meshes (one merged mesh each, fast to draw) |
| `public/level-utils.js` | B | Shared level helpers (merged paint/boxes, colliders, text signs) |
| `public/telemetry.js` | shared | Telemetry panel (T): G-G plot, tires, traces, powertrain, aero, fans, thrusters |
| `public/sound.js` | shared | Procedural Web Audio sound (motor, wind, tire squeal, fans, thrusters, one-shots) |
| `public/tour.js` | shared | Guided demo (4 scenes with live hints) |
| `public/levels.js`, `levels/*.json` | B | Level loader and level files |
| `public/config.js` | shared | All tunable numbers. Small edits only, merge often |
| `public/shared/protocol.js` | shared | Message formats. **Agree before changing** |
| `README.md`, `CLAUDE.md` | shared | Docs |

Person A builds Milestones 2, 4, and 6 (phone, AI coach, AI scenario generator). Person B builds Milestones 1, 3, and 5 (car, physics, levels). Milestone 7 polish is shared. Because A's features plug into B's game, **both sides code against the shared contracts** so they can work in parallel without waiting on each other.

## Shared contracts (`public/shared/protocol.js`)

Define these in the skeleton, on day one, so both people can build against them:

- **Controller input** (phone → server → game, about 30×/s):
  `{ type: "input", steer: -1..1, gas: 0..1, brake: 0..1, fans: true/false, thrust: true/false, lift: true/false, roll: -1|0|1, pitch: -1..1, reset: true/false }`
  (`thrust` = rear BOOST, `lift` = corner thrusters up, `roll` = barrel-roll request left/right, `pitch` -1 = phone tipped forward)
- **Mode change** (phone → game): `{ type: "mode", mode: "performance" | "thrust" | "rocket" }`
- **Car state** (game → coach, every second and on events):
  `{ type: "state", speedKmh, steer, fansOn, tankPercent, mode, airborne, altitude, events: [...], goalText }`
- **Coach tip** (server → game): `{ type: "tip", text, lang }`
- **Level JSON:** the schema in Milestone 5.
- **HTTP endpoints:** `POST /api/coach` (body: car state → returns tip) and `POST /api/scenario` (body: `{ prompt }` → returns a validated level JSON).

Include a **fake input generator** (keyboard) and a **fake tip** so Person B can test the game without the phone or AI. Include a sample car-state object so Person A can test the coach without the game.

## Tech stack

- **Server:** Node.js + `express` (serves static files) + `ws` (WebSocket relay between phone and game). Also proxies AI requests so the API key never reaches the browser.
- **Game (laptop browser):** `three` for rendering and `@dimforge/rapier3d-compat` for physics. Use Rapier's `DynamicRayCastVehicleController` for the car, or a simpler raycast/arcade approach if that turns out faster to get feeling good. Use Vite or plain ES module imports, whichever is simplest. Pick one and keep it simple.
- **Phone controller:** a plain HTML page using `DeviceOrientationEvent` for tilt. It connects to the server over WebSocket.
- **HTTPS for the phone:** iPhones only give motion sensor data over HTTPS and require the user to tap a button to grant permission (`DeviceOrientationEvent.requestPermission()`). Support running behind a **Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:3000`) or similar. Document the exact steps in the README. Use relative/derived URLs everywhere (e.g. `wss://` + current host) so it works both on localhost and through the tunnel.
- The game screen shows a **QR code** of the phone controller URL so anyone at my table can scan and drive. Use a small QR library.

## Features, in priority order (build in this order)

### Milestone 1: Drive a car on a blank world with the keyboard
- Flat ground plane with a grid texture, sky, and basic lighting.
- An **original stylized car model** built from Three.js primitives: a low, angular, wedge-shaped two-seat hypercar in white. Think "Cybertruck design language on a sports car": sharp flat panels, hidden headlights, and a full-width rear light bar. Four wheels that visibly spin and steer. Keep the model in its own module (`car-model.js`) so a `.glb` can be swapped in later.
- Chase camera that follows smoothly. Press C to switch to a cockpit or overhead camera.
- Keyboard fallback controls (always kept working, even after the phone works):
  - W/S: gas/brake-reverse
  - A/D: steer
  - F: toggle fans
  - Space: rear thrusters (BOOST)
  - Shift: lift (Rocket) · Q/E: barrel roll left/right (Rocket) · ↑/↓: lean the lift forward/back
  - 1/2/3: trim (Performance / Thrust / Rocket)
  - R: reset car upright at spawn
- A basic HUD: speed (km/h), fans ON/OFF, thruster tank %, and altitude.

### Milestone 2: Phone as the yoke
- `phone.html` is a landscape, full-screen controller styled like a mobile racing game.
  - **Tilt the phone left and right to steer.** Steering = how far the phone's long edge is tilted from level, so it works whether the phone is held upright like a wheel or flat like a game controller. Dead zone and smoothing. If tilt data isn't arriving, show "tilt: no data" and let the player **drag the yoke** on screen instead.
  - Big on-screen buttons: **GAS** (right side, hold), **BRAKE** (left side, hold), **FANS** (toggle), **BOOST** (rear thrusters, hold), **LIFT** (corner thrusters, hold, Rocket), **ROLL** (tap, Rocket, rolls toward the side you're steering, default right), **MODE**, **CENTER**, **RESET**. Grey out buttons the current trim doesn't have.
  - A "Tap to start" button that requests motion permission on iOS.
  - A "Calibrate / center" button.
  - Show connection status, plus a small readout of the current steering angle so I can debug at the table.
- Send controller state to the server about 30 times per second. The server relays it to the game. The game uses the phone input when connected and falls back to the keyboard otherwise.
- Use **haptic feedback** (`navigator.vibrate`) on thruster fire and collisions where supported.
- Handle disconnects gracefully: if phone input stops, the car coasts to a stop.

### Milestone 3: The Roadster's special physics (the whole point)
Base these on the reveal claims below. Make it **fun and readable** first, realistic second. All numbers go in `config.js`. Present them as Tesla's claims, not verified facts.

#### Reveal facts (Oct 15, 2026 event at SpaceX McGregor; Tesla claims as reported by Electrek, TechCrunch, InsideEVs, Yahoo Autos)
- **What the demo showed:** the car (computer-controlled, no driver) drove up a tall **curved ramp** and went vertical, then **upside down**, held on by fan suction. It came off the top, did a **mid-air barrel roll** powered by the thrusters, and **landed softly on all four wheels** in a white cloud of cold gas. It also **hopped over a lineup of vehicles** (a small robotaxi, pickup, semi, SUV and sedan), clearing the 13.5 ft semi by nearly double its height with the under-car thrusters, and did another roll. Musk: the stunts can be done "whenever you'd like".
- **Fans:** 4 underbody fans (~20 kW each) with a skirt seal. "Up to two g's" of suction, enough to hold the car upside down even when stopped. Cornering "over 2 g".
- **Thrusters (Rocket trim has 10):** 4 rear ports (over 80 kN, "4–5x the force the tires can"), 4 pointing **down at the corners** (lift, hops, roll), and 2 at the **front for yaw**. Air at 5,500–10,000 psi (reports differ).
- **Air tanks:** Thrust trim 200 L; Rocket trim 600 L (the extra 400 L replaces the passenger seat). Full rear thrust lasts about 1.5–2 s on 600 L; hover about 4–6 s. Real refill takes hours.
- **Trims:** Performance (fans + active aero, no thrusters, 0–60 mph under 1.6 s, 210 mph), Thrust (adds rear thrusters, 0–60 under 0.9 s, 230 mph), Rocket (all 10 thrusters, single seat, 0–60 under 0.59 s, over 230 mph, invite only, not street legal). All about 300 mi range. Production planned for 2028.
- **Look:** "Ano White" paint, hidden headlights, full-length taillight, flush aero, gold-tinted visor-like windows, inspired by the SR-71 / F-35, yoke steer-by-wire.
- **Mass:** not announced (reports range from under 1,700 kg to ~2,350 kg). We use 1,800 kg.

#### How we model it
- **Physics engine:** Rapier ray-cast suspension at 120 Hz, with our own tire model on top (`car.js`).
- **Tires:** a simplified Pacejka "magic formula": grip rises with slip angle, peaks around 7–8°, then falls ~15% when sliding. Grip depends on the load on each tire (fans and aero add load; real tires also lose a little grip per kg: load sensitivity). A friction circle shares grip between cornering and driving/braking. Rear tires grip ~10% more (wider), so at the limit the car runs wide instead of spinning. Grass has ~55% grip.
- **Chassis:** dry mass 1,650 kg (+ up to 250 kg of compressed air), 46/54 weight split, ~2.3 Hz springs, bump stops, anti-roll bars, Ackermann steering.
- **Powertrain:** 1 MW, power-limited above low speed, 1/3 front, 2/3 rear (three motors). Regen when you lift off, auto-hold when stopped. Traction control, ABS and stability control (ESC: yaw-rate + sideslip) are on.
- **Aero:** drag (CdA 0.6) and downforce, with an active rear wing that rises above 90 km/h.
- **Results (headless tests):** 0–60 mph 1.56 s (Performance, fans on), 0.49 s (Rocket boost launch); 100–0 km/h in 33 m; cornering 1.15 g fans off / ~3 g fans on.
- **Fans (FANS toggle):** force toward the road along the car's own "down" (2× its weight) while wheels touch, so it works when stopped, on ramps, and **upside down** (2 g suction − 1 g gravity). More downforce = more grip (about 3.3 g cornering). Lower ride height plus a cyan glow and air particles.
- **BOOST (rear thrusters, Thrust + Rocket):** 80 kN forward. Air is tracked in kg (600 L ≈ 250 kg at 380 bar). Air used = force / 600 m/s exhaust speed (~133 kg/s at full), so 600 L lasts ~1.9 s; thrust fades ~35% as tank pressure drops; the car gets lighter as air is used.
- **LIFT (corner thrusters, Rocket, hold):** 1.35× weight upward; tip the phone forward/back to lean it. About 6 s of hover on a full tank.
- **ROLL (Rocket, tap):** automatic, like the reveal car. On the ground the corner thrusters first kick the car up (~3 m hop), then one side's corner thrusters spin it 360° around its long axis in ~0.85 s, and it stops upright. Rolls toward the side you're steering. Off the top of the curl (upside down) it does 1.5 turns and lands upright. Costs 50 L (+40 L for the hop).
- **Yaw thrusters (Rocket, in the air):** steering turns the car while flying.
- **Soft landing (Rocket, automatic):** when falling too fast to stop, the corner thrusters fire just in time to touch down at about 3 m/s.
- **Landing assist (all trims):** auto-levels the car near the ground. R / RESET if it flips.
- **Trims** switch from the HUD, phone MODE, or keys 1/2/3. **Rocket is the default** because it has every demo feature. Buttons a trim doesn't have do nothing (greyed out on the phone).
- **Camera:** the chase camera stays behind the car, also while flying and rolling. (A "stunt camera" that swung out to the side was removed: the user didn't like it.)
- **Top speed per trim** (reveal claims): Performance 338 km/h (210 mph), Thrust 370 km/h (230 mph), Rocket 375 km/h ("over 230 mph"). `CONFIG.car.topSpeedKmh`.
- **Surfaces:** grass 55% grip; gravel traps 45% grip plus drag (about 0.5 g of slowing), like real gravel.

### Milestone 4: AI coach (the main AI feature and the sponsor tool usage)
- Every few seconds, and immediately on key events, the game sends a short **car state summary** to the server. Key events include:
  - Entering a turn too fast with fans off
  - The tank running empty
  - First thruster use
  - A crash or flip
  - A big jump
- The summary includes: speed, steering, fans on/off, tank %, mode, airborne yes/no, recent events, and the current scenario goal. The server calls **ai&** (OpenAI-compatible chat completions) with a system prompt making the model a **calm, concise driving instructor for this specific car**.
- The coach gives **one short tip at a time** (max ~15 words). Examples:
  - "Fans on before that corner. They give grip even at low speed."
  - "Save your air. You only get about two seconds of thrust."
- **Rate limit:** at most one tip every ~4 seconds, and never queue up stale tips. Event-triggered tips take priority.
- Show tips as a subtitle bar on the game screen, and **speak them with the browser's `speechSynthesis`**. Use a toggle to mute.
- **Language toggle EN / 日本語:** the event is bilingual, so the coach can speak either language.
- **Fallback:** if the AI call fails or takes longer than ~3 s, show a rule-based tip instead so the demo never breaks.
- Add a **"Tutorial" mode:** a short guided sequence (drive → turn with fans off and slide → turn with fans on → thrust launch → jump), with the AI coach narrating each step.

### Milestone 5: Level system (build it so worlds can be added later)
**Never hard-code the world.** Every map is a JSON level file in `levels/` loaded by `levels.js`. Use this schema (extend as needed, but keep it simple):

```json
{
  "name": "Blank Test Area",
  "description": "Empty space to learn the car.",
  "spawn": { "x": 0, "y": 1, "z": 0, "heading": 0 },
  "ground": { "type": "flat", "size": 500 },
  "model": null,
  "props": [
    { "type": "ramp", "x": 0, "z": 60, "width": 8, "length": 20, "angle": 18 },
    { "type": "box", "x": 20, "z": 30, "w": 4, "h": 2, "d": 8, "color": "#888888" }
  ],
  "cars": [
    { "x": 10, "z": 80, "heading": 0, "behavior": "parked" }
  ],
  "goal": { "type": "reach", "x": 0, "z": 200, "radius": 5, "text": "Reach the green zone" },
  "checkpoints": []
}
```

- Prop types to start: `box`, `ramp`, `curl` (the reveal's curved ramp that bends up and over until upside down: `radius`, `width`, `degrees`), `wall`, `cone`, `checkpoint`, `parking_spot`, `paint` (flat color, no collision).
- Parked car kinds: `compact` (robotaxi-sized), `sedan`, `suv`, `pickup`, `van`, `semi`. Generic shapes only, never Tesla models.
- **Generator props** (in `scenery.js`) build a whole scene from a few numbers, which keeps levels short and easy for the AI scenario generator (Milestone 6) to write:
  - `track`: `points` [[x, z, height, bridgeLift]...] joined into a smooth closed loop (on flat ground heights make bridges), `width`, `startAt`, `checkpoints`, `racingLine` (true = speed-adaptive line), `scenery` (`"suzuka"` or `"countryside"`), `barriers` (false = no gravel/guardrails). Builds the road with a 1 m asphalt shoulder, curbs in corners, gravel traps, guardrails, bridge walls and pillars, the start line, and lap gates. Use with ground type `grass` (less grip off track) and goal type `lap`. With `"ground": { "terrain": true }` the heights are real elevation and the hilly ground is built around the track (only `bridgeLift` makes a bridge).
  - `parking_lot`: `pairs`, `spotsPerRow`, `freeSpot` [pair, row, index], `rival`, `rivalSpeedKmh`, `cruisers`, `shoppers`, `carts`, `seed`. A full lot with one open spot, cars hunting for parking, a rival heading for your spot, shoppers, and a store. Use with goal type `park`.
  - `highway`: `length`, `lanesEachWay`, `laneWidth`, `traffic` { `count`, `oncoming`, `speedsKmh` per lane, `jam` { `z`, `length` } }. Divided highway driving on the left (Japan), guard rails, lamps, exit signs, traffic that keeps a safe gap and queues, and an accident jam across every lane.
- Car behaviors (in `cars` or made by generators): `parked`, `stopped`, `path` (follows `path` points, `loop`), `rival` (path ending in your spot), `lane` (highway traffic), `walker` (shoppers). Moving ones are kinematic bodies that slow down or wait for the player.
- Goal types: `reach` (green zone, optional `timeLimit`), `lap` (gates + lap timer), `park` (stop lined up in the open spot before the rival).
- Ground types: `flat` (concrete) and `grass` (less grip, `CONFIG.surfaces.grassGrip`), optionally `"terrain": true` (track levels only). `"decor": "testsite"` adds hangars, trees and hills around a test pad.
- Car behaviors to start: `parked`, `drive_straight` (constant speed along heading), `follow_path` (list of points), `rival_to_spot` (drives toward a parking spot).
- `"model"` can later point to a `.glb` file (e.g. a Tokyo street chunk from Project PLATEAU, or a racetrack). Load it with GLTFLoader and generate a static trimesh collider from it. Write this loader path even if no `.glb` exists yet.
- A **level select menu** on the game screen (and ideally the phone).
- Levels to include:
  1. `blank.json`: flat ground, one ramp, a few cones. **Default.**
  2. `reveal-curl.json`: the reveal's main stunt. A runway into a 10 m radius curl. Fans on, drive up and over (upside down at ~20 m), ROLL off the top, soft-land in the green zone.
  3. `tesla-event.json` ("Reveal Jump"): a runway, a big ramp, and the reveal lineup to **jump over** (compact robotaxi, pickup, semi, SUV, sedan). Hold LIFT for height, tap ROLL for style. Goal: clear them all and land.
  4. `suzuka.json` ("Suzuka Circuit (real layout)"): generated by `node tools/build-suzuka.mjs`. Real layout and elevation, 16 gates, racing line, grandstands, pit lane.
  5. `circuit.json` ("Figure-8 Circuit, Suzuka-style"): ~2.7 km figure-8 with a bridge crossover, gravel and grass runoff, 12 gates, lap timer. (Inspired by Suzuka's layout, not an exact copy.)
  6. `warehouse-parking.json` ("Warehouse Store Parking, Costco-style"): full lot, one open spot, a rival SUV heading for it (~33 s), cruisers and shoppers. Park first, or fly over the rows. No real store branding.
  7. `expressway.json` ("Rush-Hour Expressway"): 2.4 km, 3 lanes each way, ~70 moving cars, an accident jam at 1.3 km blocking every lane. Reach the exit in 80 s (fly over the jam with LIFT).
- Ideas, not built yet:
  - `parking-steal.json`: a simple block-city street. A free parking spot is ahead, and a rival car is heading for it. Goal: get into the spot first. You'll need the thruster and/or fans to win.
  - `slalom.json`: cones and checkpoints with a timer. Teaches fan grip.
- Later, optionally: `tokyo-shibuya.json` using a PLATEAU model chunk (free 3D Tokyo city data, free for commercial use, FBX → convert to glb). **Not in the first build.**

### Milestone 6: AI scenario generator (second AI feature)
- A text box on the game screen: "Describe a situation…" (e.g. "rush hour in Shibuya and someone is trying to steal my parking spot", "icy mountain road with a jump at the end").
- The server sends this to **ai&** with a system prompt that includes the **level JSON schema** and allowed prop/behavior types, and asks for **JSON only**.
- The server **validates** the result: parse it, check types, clamp positions and counts to sane limits, and fill defaults. If invalid, retry once, then fall back to a preset level. Then the game loads it immediately.
- The AI coach knows the generated scenario's `goal` and coaches toward it.

### Milestone 7: Demo polish (only if time allows)
- A title screen: "Learn to drive the impossible car." Large QR code to join with your phone.
- Simple sound effects: motor hum by speed, fan whine, thruster blast.
- Particle effects, plus screen shake on thrust and landing.
- **Stunt replay** of the last 10 seconds (record position and rotation each frame, then play back).
- Score per level (time, flips, clean landing).
- A small "physics facts" panel explaining the real reveal claims (2 g fan suction that works at standstill and upside down, 10 thrusters, 80 kN, 600 L of air ≈ 1.5–2 s of full thrust, 0–60 under 0.59 s). Present these as Tesla's claims, not verified facts.

## Things the humans do (not Claude Code)
- Get ai& credentials from the sponsor guide. Each person puts them in their own local `.env`. Share the key privately (e.g. a DM), **never in the repo**.
- Yuan: make sure `gh auth login` is done. Friend: make sure you have a GitHub account and accept the collaborator invite.
- Record a **backup demo video** before 16:00 in case the live demo breaks.
- Fill in the submission form at 16:00.

## Deliverables Claude Code should produce
- A working app: `npm install` then `npm start`, open the game on the laptop, scan the QR code with a phone, and drive.
- A **README.md** containing:
  - A one-paragraph pitch
  - Setup steps (including the Cloudflare tunnel steps for the phone)
  - Controls
  - How the AI coach and scenario generator use **ai&** (needed for the submission form)
  - How to add a new level
  - A note that the car is an original model inspired by the Tesla Roadster and is not affiliated with Tesla
- `.env.example` with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `PORT`.

## How to work
1. **Yuan's session:** do Step 0 (repo + skeleton + contracts), push to `main`, and give Yuan the clone command for the friend. Then continue with Person A's milestones on the `yuan` branch.
2. **Friend's session:** clone, `npm install`, create the `friend` branch, and build Person B's milestones.
3. Before each task, pull the latest `main`. After each working piece, merge to `main` following the team git workflow, and tell your human to tell their teammate.
4. After each milestone: make sure it runs, give your human a 2–3 line summary of what to test, and move on. Don't start the next milestone if the current one is broken.
5. If a feature is taking too long, simplify it rather than leaving it half-working. Say what you cut.
6. **Time checkpoints for the day** (both people):
   - **11:00:** skeleton and contracts on `main`, both people building
   - **12:30 (lunch):** car drives with the keyboard (B), and the phone sends input that moves the car (A). **Merge both into `main` and test together.**
   - **~13:45:** fans and thruster physics (B), and the AI coach giving tips (A). Merge and test together.
   - **~14:45:** levels incl. the Tesla event jump (B), and the scenario generator (A).
   - **15:30: feature freeze.** Only bug fixes after this, on `main`, one person at a time.
   - **15:30–16:00:** final merge, README, backup demo recording, submission.
7. **Demo laptop:** pick ONE laptop to run the demo from. At 15:30, that person pulls the final `main` and tests the full flow with a phone.

---

## Friend's starter prompt (paste into the friend's Claude Code)

```
I'm Yuan's teammate for the Tokyo Agent Hackathon. I just cloned the roadster-sim repo.
Read CLAUDE.md in this repo. It has the full plan, the team git workflow, and file ownership.
I am Person B (car, physics, levels). Do this:
1. Run npm install and check that npm start works.
2. Create and switch to my branch: git checkout -b friend
3. Copy .env.example to .env (I'll paste the AI key myself).
4. Start on my milestones in order, staying inside the files I own.
Before each task, pull the latest main. After each working piece, follow the merge steps
in CLAUDE.md and tell me when to let Yuan know I pushed.
```
