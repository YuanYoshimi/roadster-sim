# Master Prompt — Roadster Driving Sim (Tokyo Agent Hackathon)

**How to use this file (for humans):**
1. **Yuan** pastes this whole file into Claude Code first. Claude Code sets up the GitHub repo (see "Step 0"), saves this file in the repo as `CLAUDE.md`, and builds the skeleton.
2. **The friend** then clones the repo and starts Claude Code inside it. Claude Code reads `CLAUDE.md` automatically, so the friend only needs the short "Friend's starter prompt" at the bottom of this file.

---

## Current status (update as you go)

- **Oct 16 prototype is on `main`:** keyboard driving, fans, thrusters, 3 modes, landing assist, Blank + Reveal Jump levels, phone yoke over an HTTPS tunnel. AI coach and scenario generator are not built yet.
- The repo is **private** for now. Make it public before submitting (command in README).
- `npm run phone` tries cloudflared, then falls back to ngrok (some networks block Cloudflare quick tunnels). `npm run phone:ngrok` skips straight to ngrok.
- Testing tip: `window.game` in the browser console exposes the car, world and camera. `game.frame(time)` steps one frame by hand.

## Who we are and what this is

We're a **team of two**: Yuan and a friend, building at the **Tokyo Agent Hackathon** (+81 Builders) on **Saturday Oct 17, 2026**. Each of us runs our own Claude Code on our own laptop, working in the **same GitHub repo**. Building starts at 10:30 and **submissions close at 16:00 sharp**. Judging is a **3-minute live demo** at our table, and the top 5 teams demo on a projector.

**The project:** a browser driving simulator of Tesla's newly revealed next-gen Roadster. The Roadster was revealed on Oct 15, 2026. Its headline features are fan suction downforce and cold-gas thrusters that let it jump and fly. Most people have no idea how you'd actually drive a car like this. My sim lets you drive it using **your phone as the steering yoke**: tilt to steer, with on-screen buttons for gas, brake, fans, and thrusters. An **AI coach** teaches you how to use the fans and thrusters while you drive. Later, **AI-generated real-world situations** like busy Tokyo traffic or someone stealing your parking spot drop you into tricky scenarios.

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
| `public/levels.js`, `levels/*.json` | B | Level loader and level files |
| `public/config.js` | shared | All tunable numbers. Small edits only, merge often |
| `public/shared/protocol.js` | shared | Message formats. **Agree before changing** |
| `README.md`, `CLAUDE.md` | shared | Docs |

Person A builds Milestones 2, 4, and 6 (phone, AI coach, AI scenario generator). Person B builds Milestones 1, 3, and 5 (car, physics, levels). Milestone 7 polish is shared. Because A's features plug into B's game, **both sides code against the shared contracts** so they can work in parallel without waiting on each other.

## Shared contracts (`public/shared/protocol.js`)

Define these in the skeleton, on day one, so both people can build against them:

- **Controller input** (phone → server → game, about 30×/s):
  `{ type: "input", steer: -1..1, gas: 0..1, brake: 0..1, fans: true/false, thrust: true/false, pitch: -1..1, reset: true/false }`
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
  - Space: thruster
  - R: reset car upright at spawn
- A basic HUD: speed (km/h), fans ON/OFF, thruster tank %, and altitude.

### Milestone 2: Phone as the yoke
- `phone.html` is a landscape, full-screen controller styled like a mobile racing game.
  - **Tilt the phone left and right like a steering wheel to steer** (use the phone's roll angle, with a dead zone and smoothing).
  - Big on-screen buttons: **GAS** (right side, hold), **BRAKE** (left side, hold), **FANS** (toggle), **THRUST** (hold), **RESET**.
  - A "Tap to start" button that requests motion permission on iOS.
  - A "Calibrate / center" button.
  - Show connection status, plus a small readout of the current steering angle so I can debug at the table.
- Send controller state to the server about 30 times per second. The server relays it to the game. The game uses the phone input when connected and falls back to the keyboard otherwise.
- Use **haptic feedback** (`navigator.vibrate`) on thruster fire and collisions where supported.
- Handle disconnects gracefully: if phone input stops, the car coasts to a stop.

### Milestone 3: The Roadster's special physics (the whole point)
Base these on the reported reveal claims. Make it **fun and readable** first, realistic second. All numbers go in `config.js`.

- **Normal driving:** mass about 1,800 kg, grip about 1.2 g. The car slides if you take a turn too fast with the fans off.
- **Fan suction (FANS toggle):** fans pull air from under the car, so they work **even when stopped**. When on:
  - Add a strong downward force (up to about 2× the car's weight).
  - Increase tire grip a lot, so you can corner at speeds where the car normally slides.
  - Show a visual effect: lower ride height, a subtle air distortion or particles under the car, and a whine sound if audio is easy.
  - Fans use battery or energy. Add a simple "energy" bar if it adds a decision. Optional.
- **Cold-gas thrusters (THRUST, hold):** a big push in the car's forward direction, with a large plume particle effect and sound.
  - The car has an **air tank** that empties fast: about **2 seconds of full thrust** from a full tank. It refills slowly while not thrusting.
  - The thruster button does nothing when the tank is empty, and the HUD flashes.
- **Drive modes**, selectable from the HUD or phone, based on the three reveal trims:
  - **Performance:** fans only, no thrusters.
  - **Thrust:** fans plus rear thrusters (default).
  - **Rocket:** adds upward thrusters for hops or short hovers. In Rocket mode, holding THRUST while tilting the phone forward/back pitches upward thrust for a short flight (about 4–5 seconds of hover max on a full tank). Add a **landing assist** that auto-levels the car when it's close to the ground.
- Make sure the car can drive off the ramp and **jump**, and recovers nicely (R to reset if it flips).

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

- Prop types to start: `box`, `ramp`, `wall`, `cone`, `checkpoint`, `parking_spot`.
- Car behaviors to start: `parked`, `drive_straight` (constant speed along heading), `follow_path` (list of points), `rival_to_spot` (drives toward a parking spot).
- `"model"` can later point to a `.glb` file (e.g. a Tokyo street chunk from Project PLATEAU, or a racetrack). Load it with GLTFLoader and generate a static trimesh collider from it. Write this loader path even if no `.glb` exists yet.
- A **level select menu** on the game screen (and ideally the phone).
- Levels to include:
  1. `blank.json`: flat ground, one ramp, a few cones. **Default.**
  2. `tesla-event.json`: recreation of the reveal stunt. A runway, a big ramp, and a row of parked box-shaped vehicles to **jump over** (different sizes: sedan, SUV, pickup, semi). Goal: clear them all and land.
  3. `parking-steal.json`: a simple block-city street. A free parking spot is ahead, and a rival car is heading for it. Goal: get into the spot first. You'll need the thruster and/or fans to win.
  4. `slalom.json`: cones and checkpoints with a timer. Teaches fan grip.
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
- A small "physics facts" panel explaining the real reveal claims (fans work at standstill, about 2 s of thrust, etc.). Present these as Tesla's claims, not verified facts.

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
