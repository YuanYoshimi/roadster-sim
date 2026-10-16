// server.js — Owner: A (Yuan)
// Serves the game and phone pages, relays phone input to the game over WebSocket,
// and (later) proxies AI requests so the API key never reaches the browser.
//
//   npm start       -> laptop only (http://localhost:3000)
//   npm run phone   -> also opens a Cloudflare tunnel so an iPhone can connect over HTTPS

import express from "express";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Load .env if there is one. Node 20.12+ has this built in, so we don't need dotenv.
try {
  process.loadEnvFile(path.join(rootDir, ".env"));
} catch (err) {
  // No .env file yet. The prototype works without it.
}

const PORT = Number(process.env.PORT) || 3000;
const wantTunnel = process.argv.includes("--tunnel");

// The public HTTPS address from the tunnel, once cloudflared tells us. Shown as a QR code.
let tunnelUrl = null;

// ---------- Web pages and files ----------

const app = express();
// Behind the tunnel, trust its "this was really https" header.
app.set("trust proxy", true);
app.use(express.json({ limit: "100kb" }));

// Libraries come straight from node_modules, so we don't need a bundler.
app.use("/vendor/three", express.static(path.join(rootDir, "node_modules/three")));
app.use("/vendor/rapier", express.static(path.join(rootDir, "node_modules/@dimforge/rapier3d-compat/dist")));
app.use("/levels", express.static(path.join(rootDir, "levels")));
app.use(express.static(path.join(rootDir, "public")));

app.get("/", function (req, res) {
  res.redirect("/game.html");
});
app.get("/phone", function (req, res) {
  res.redirect("/phone.html");
});

// The game asks this to know what to put in the QR code.
app.get("/api/info", function (req, res) {
  res.json({ phoneUrl: getPhoneUrl(req), tunnel: tunnelUrl !== null });
});

app.get("/api/qr.svg", async function (req, res) {
  const svg = await QRCode.toString(getPhoneUrl(req), { type: "svg", margin: 1 });
  res.type("image/svg+xml").send(svg);
});

// TODO (Milestone 4 and 6): POST /api/coach and POST /api/scenario, using server/ai.js.

function getPhoneUrl(req) {
  if (tunnelUrl) {
    return tunnelUrl + "/phone.html";
  }
  // No tunnel. Use the address the game was opened with, but swap "localhost" for the
  // laptop's Wi-Fi address so a phone on the same network can reach it.
  // (iPhones still need the tunnel, because tilt only works over HTTPS.)
  let host = req.get("host");
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    host = getLanAddress() + ":" + PORT;
  }
  return req.protocol + "://" + host + "/phone.html";
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const item of interfaces[name]) {
      if (item.family === "IPv4" && !item.internal) {
        return item.address;
      }
    }
  }
  return "localhost";
}

// ---------- WebSocket relay ----------
// Phones send input. The server passes phone messages to every game screen,
// and game messages to every phone. Each socket says who it is with a "hello" message.

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", function (socket) {
  socket.role = "unknown";
  socket.isAlive = true;

  socket.on("pong", function () {
    socket.isAlive = true;
  });

  socket.on("message", function (data) {
    const text = data.toString();
    let msg = null;
    try {
      msg = JSON.parse(text);
    } catch (err) {
      return; // ignore anything that isn't JSON
    }
    if (!msg || typeof msg.type !== "string") {
      return;
    }

    if (msg.type === "hello") {
      if (msg.role === "phone" || msg.role === "game") {
        socket.role = msg.role;
        console.log("A " + msg.role + " connected.");
        broadcastStatus();
      }
      return;
    }

    // Pass the original text along. No need to re-encode it.
    if (socket.role === "phone") {
      sendToRole("game", text);
    } else if (socket.role === "game") {
      sendToRole("phone", text);
    }
  });

  socket.on("close", function () {
    if (socket.role !== "unknown") {
      console.log("A " + socket.role + " disconnected.");
    }
    broadcastStatus();
  });
});

// A phone that goes to sleep can leave a dead connection behind. Ping everyone
// every few seconds and drop sockets that stop answering.
setInterval(function () {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 5000);

function sendToRole(role, text) {
  for (const socket of wss.clients) {
    if (socket.role === role && socket.readyState === socket.OPEN) {
      socket.send(text);
    }
  }
}

function broadcastStatus() {
  let phones = 0;
  let games = 0;
  for (const socket of wss.clients) {
    if (socket.readyState !== socket.OPEN) {
      continue;
    }
    if (socket.role === "phone") {
      phones = phones + 1;
    }
    if (socket.role === "game") {
      games = games + 1;
    }
  }
  const text = JSON.stringify({ type: "status", phones: phones, games: games });
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) {
      socket.send(text);
    }
  }
}

// ---------- Cloudflare tunnel (for the iPhone) ----------

function startTunnel() {
  console.log("Starting Cloudflare tunnel (takes a few seconds)...");
  const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", "http://localhost:" + PORT], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.on("error", function () {
    console.log("");
    console.log("Could not start cloudflared. Is it installed? See the README (Phone setup).");
    console.log("The game still works on this laptop with the keyboard.");
  });

  // cloudflared prints its random https://....trycloudflare.com address in its log output.
  function lookForUrl(chunk) {
    const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl && !match[0].startsWith("https://api.")) {
      tunnelUrl = match[0];
      printPhoneInstructions();
    }
  }
  child.stdout.on("data", lookForUrl);
  child.stderr.on("data", lookForUrl);

  // Stop the tunnel when the server stops.
  process.on("exit", function () {
    child.kill();
  });
  process.on("SIGINT", function () {
    child.kill();
    process.exit(0);
  });
}

async function printPhoneInstructions() {
  const phoneUrl = tunnelUrl + "/phone.html";
  const terminalQr = await QRCode.toString(phoneUrl, { type: "terminal", small: true });
  console.log("");
  console.log("Phone controller (HTTPS):  " + phoneUrl);
  console.log(terminalQr);
  console.log("Scan the QR code on the game screen or above with your iPhone camera.");
  console.log("(A brand-new tunnel can take ~10 seconds before the link works.)");
}

server.listen(PORT, function () {
  console.log("");
  console.log("Roadster Sim running.");
  console.log("Game on this laptop:  http://localhost:" + PORT);
  if (wantTunnel) {
    startTunnel();
  } else {
    console.log("For an iPhone controller, stop this and run:  npm run phone");
  }
});
