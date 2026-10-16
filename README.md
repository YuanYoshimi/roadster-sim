# Roadster Sim

**Tesla just revealed a car that can stick to the road with fans and fly with thrusters. Nobody knows how to drive it. This is a browser simulator for it, and your phone is the steering wheel.**

Hold your phone sideways and tilt it to steer. Use the on-screen buttons for gas, brake, fan suction and the cold-gas thrusters. Like the real reveal car:
- the fans pull with 2 g, so you can corner at about 3 g or **drive upside down** on the curl ramp;
- 4 rear thrusters (**BOOST**) push with 80 kN from a compressed-air tank;
- 4 corner thrusters (**LIFT**) let you hop and hover;
- one tap of **ROLL** does an automatic **mid-air barrel roll** that lands upright.

An AI coach powered by **ai& Inference** is coming next.

> Built at the Tokyo Agent Hackathon (+81 Builders), Oct 17 2026.
> The car is an **original stylized model inspired by the Tesla Roadster**. This project is **not affiliated with Tesla**, and it uses no Tesla assets, logos or 3D models. Physics numbers are based on Tesla's claims at the Oct 15, 2026 reveal, as reported in the press (2 g fan suction, 10 thrusters, over 80 kN, 200 L / 600 L air tanks, 0–60 mph under 0.59 s for the Rocket trim). They are presented as claims, not verified facts. The details are in `CLAUDE.md` under "Reveal facts".

## Status: prototype

| Works | Not built yet |
|---|---|
| Driving, fans (incl. upside down), BOOST, LIFT, barrel ROLL, soft landing, 3 trims | AI coach (Milestone 4) |
| Phone yoke over HTTPS tunnel (tilt upright or flat, drag fallback) | AI scenario generator (Milestone 6) |
| 6 levels: Blank, Reveal Curl, Reveal Jump, Figure-8 Circuit, Warehouse Parking, Rush-Hour Expressway | Sound, AI-generated scenarios |

## Setup

You need Node.js 20.12 or newer.

```
npm install
npm start
```

Open http://localhost:3000 on the laptop. Keyboard controls work right away.

### Phone setup (iPhone)

iPhones only share tilt data with **HTTPS** pages, so the server opens a temporary public HTTPS address (a "tunnel") for the laptop.

1. Install a tunnel tool (one is enough):
   - **cloudflared** (preferred, no account): `brew install cloudflared`, or download `cloudflared-darwin-arm64.tgz` from https://github.com/cloudflare/cloudflared/releases and put the `cloudflared` file somewhere on your PATH.
   - **ngrok** (backup, needs a free account): https://ngrok.com/download, then `ngrok config add-authtoken <your-token>`.
2. Start the server with the tunnel:
   ```
   npm run phone
   ```
   It tries cloudflared first. If that doesn't connect within 20 s (some Wi-Fi networks block it), it switches to ngrok. To go straight to ngrok, use `npm run phone:ngrok`.
3. Open http://localhost:3000 on the laptop. The QR code at the bottom left now shows the HTTPS phone link (it's also printed in the terminal).
4. Scan it with the iPhone camera. If ngrok shows a warning page, tap **Visit Site**.
5. On the phone, turn off **Portrait Orientation Lock**, hold the phone sideways, tap **Tap to start**, then tap **Allow** for motion access.
6. Hold the phone the way you want "straight ahead" to feel and tap **CENTER**.

The tunnel address changes each time you restart `npm run phone`, so rescan the QR code after a restart.

## Controls

| Action | Phone | Keyboard |
|---|---|---|
| Steer | Tilt the phone left/right (upright or flat), or drag the yoke | A / D (or ← / →) |
| Gas / brake + reverse | GAS / BRAKE (hold) | W / S |
| Fans on/off | FANS | F |
| Rear thrusters | BOOST (hold) | Space |
| Lift: hop / hover (Rocket) | LIFT (hold), tip the phone forward/back to lean | Shift, ↑ / ↓ to lean |
| Barrel roll (Rocket) | ROLL (tap, rolls toward the side you're steering) | Q (left) / E (right) |
| Trim | MODE | 1 / 2 / 3 |
| Reset car | RESET | R |
| Camera (chase / cockpit / overhead) | | C |
| Next level | | L |
| Recenter steering | CENTER | |
| Telemetry panel | | T |
| Sound on/off | | M |
| Presentation mode (clean screen) | | P |
| Menu / guided demo: next scene | | Esc / N |

Trims, as in the reveal: **Performance** (fans only), **Thrust** (fans + 4 rear thrusters, 200 L of air), **Rocket** (all 10 thrusters, 600 L of air; this is the default). In Rocket mode, steering while airborne fires the front yaw thrusters, and the corner thrusters soften hard landings by themselves.

**Scenarios:**
- **Figure-8 Circuit (Suzuka-style):** set a lap time through 12 green gates. The track crosses over itself on a bridge, and the grass is slippery.
- **Warehouse Store Parking (Costco-style):** the lot is full except one spot, and a purple SUV is heading for it. Park first, lined up and stopped, or fly over the rows.
- **Rush-Hour Expressway:** dense traffic that drives on the left like in Japan, and an accident blocking every lane at 1.3 km. Reach the exit in 80 s. Hint: LIFT and lean forward.

**Try the reveal stunt:** pick **Reveal Curl**, press FANS, drive up the curl at about 50–60 km/h, and tap ROLL as you come off the top upside down.

The phone shows **tilt OK** (green) when motion data is arriving. If it says **tilt: no data**, reload the page, tap Start, then tap **Allow**. Meanwhile you can steer by dragging the yoke.

## For the demo

- The game opens on a **title screen** with the phone QR code and the car turning in a showroom. **Guided demo** runs four scenes (the curl stunt, the parking lot, the highway jam, a circuit lap) with hints that react to what you're doing. Press N to skip a scene, Esc for the menu.
- **P** hides the help panels for the projector. **T** opens the telemetry panel (G-G plot, all four tires, traces, thrusters).
- Sound is generated live (motor, wind, tire squeal, fans, thrusters). Press M to mute.

## How it works

- `server.js` is an Express server plus a WebSocket relay. The phone sends its controls about 30× per second, and the server passes them to the game screen. Measured phone → tunnel → server → game latency: about 20 ms.
- The game uses three.js for graphics and Rapier for physics (120 Hz). Rapier does the suspension, and our own tire model does the grip: a "magic formula" tire with load sensitivity and a friction circle, plus a 1 MW power-limited powertrain with regen, TC/ABS/ESC, anti-roll bars, aero drag and downforce, and fan suction. The thrusters use real air mass and pressure numbers. Everything feeds the telemetry panel.
- All tunable numbers are in `public/config.js`. All message formats are in `public/shared/protocol.js`.
- Libraries are served straight from `node_modules` with an import map, so there's no build step.

## How we use ai& (sponsor tool)

*Planned, not built yet.* The server will call ai& Inference (OpenAI-compatible) for:
1. **AI coach:** the game sends a short car-state summary every few seconds and on key events. The model replies with one short driving tip (EN / 日本語), which is shown as a subtitle and read aloud.
2. **Scenario generator:** you type a situation (for example "rush hour in Shibuya, someone is stealing my parking spot"), and the model returns a level JSON that the server validates and loads.

Put `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` in `.env` (copy `.env.example`). The key stays on the server.

## Add a level

1. Copy `levels/blank.json` to `levels/my-level.json` and edit it. Positions are in meters, and `heading` is in degrees (0 = +Z, 90 = +X).
   - Prop types: `box`, `wall`, `ramp`, `curl` (bends up and over until upside down), `cone`, `checkpoint`, `parking_spot`, `paint` (flat color, no collision), `grandstand`.
   - Generator props that build a whole scene: `track`, `parking_lot`, `highway` (see `levels/circuit.json`, `levels/warehouse-parking.json`, `levels/expressway.json` and the notes in `CLAUDE.md`).
   - Goals: `reach` (optional `timeLimit`), `lap`, `park`.
   - Car kinds: `compact`, `sedan`, `suv`, `pickup`, `van`, `semi` (behavior `parked` for now).
   - Goal: `{ "type": "reach", "x", "z", "radius", "text" }`.
2. Add it to `levels/index.json`.
3. Pick it from the level menu, or open http://localhost:3000/game.html?level=my-level.

## Before submitting

- The GitHub repo is **private** during prototyping. Make it public before submission:
  `gh repo edit YuanYoshimi/roadster-sim --visibility public --accept-visibility-change-consequences`
- Record a backup demo video.
