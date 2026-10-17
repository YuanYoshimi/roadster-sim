// Neo4j memory. Queries and labels are fixed; client input is always a parameter.
import neo4j from "neo4j-driver";
import { randomUUID } from "node:crypto";
import { CONFIG } from "../public/config.js";
import { MEMORY_DEMO_LAPS } from "../public/shared/memory-demo.js";

const LABELS = ["RaceDriver", "RaceSession", "RaceTrack", "RaceLap", "RaceCorner", "RaceCornerAttempt", "RaceCoaching"];

function identifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error("Invalid " + label);
  return value;
}

export function cleanMemoryScope(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Memory scope is required");
  if (!["live", "demo"].includes(raw.dataset)) throw new Error("Invalid memory dataset");
  if (!["performance", "thrust", "rocket"].includes(raw.mode)) throw new Error("Invalid car mode");
  return { driverId: identifier(raw.driverId, "driver ID"), sessionId: identifier(raw.sessionId, "session ID"),
    trackId: identifier(raw.trackId, "track ID"), dataset: raw.dataset, mode: raw.mode };
}

function metric(value, min, max) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid corner measurement");
  return value;
}

export function cleanLap(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Lap is required");
  if (typeof raw.summary !== "string" || !raw.summary.trim()) throw new Error("Lap summary is required");
  const corners = [];
  const names = new Set();
  if (raw.corners !== undefined && (!Array.isArray(raw.corners) || raw.corners.length > CONFIG.memory.maxCorners)) throw new Error("Invalid corners");
  for (const corner of raw.corners || []) {
    const name = identifier(corner?.name, "corner name");
    if (names.has(name)) throw new Error("Duplicate corner name");
    names.add(name);
    corners.push({ name: name, timeLostSeconds: metric(corner.timeLostSeconds, -600, 600),
      brakedEarlyMeters: metric(corner.brakedEarlyMeters, -1000, 1000),
      minimumSpeedDifferenceKmh: metric(corner.minimumSpeedDifferenceKmh, -500, 500),
      throttlePickupLateMeters: metric(corner.throttlePickupLateMeters, -1000, 1000) });
  }
  if (raw.lapNumber != null && !Number.isInteger(raw.lapNumber)) throw new Error("Invalid lap number");
  return { id: identifier(raw.id, "lap ID"), summary: raw.summary.trim().slice(0, CONFIG.coach.maxSummaryLength),
    lapNumber: metric(raw.lapNumber, 1, 100000), lapTimeSeconds: metric(raw.lapTimeSeconds, 0.01, 86400), corners: corners };
}

function keys(scope) {
  const driverKey = scope.dataset + ":" + scope.driverId;
  return { ...scope, driverKey: driverKey, trackKey: scope.dataset + ":" + scope.trackId,
    sessionKey: driverKey + ":" + scope.sessionId + ":" + scope.trackId + ":" + scope.mode };
}

export function summarizeMemory(laps, advice, dataset) {
  const byCorner = new Map();
  for (const lap of laps) {
    for (const corner of lap.corners || []) {
      if (!corner.name || !(corner.timeLostSeconds > 0)) continue;
      if (!byCorner.has(corner.name)) byCorner.set(corner.name, { name: corner.name, lapsWithLoss: 0, totalLossSeconds: 0 });
      const item = byCorner.get(corner.name);
      item.lapsWithLoss++;
      item.totalLossSeconds += corner.timeLostSeconds;
    }
  }
  const recurringCorners = Array.from(byCorner.values());
  recurringCorners.sort(function (a, b) { return b.totalLossSeconds - a.totalLossSeconds; });
  return { dataset: dataset, recentLaps: laps.slice(0, CONFIG.memory.historyLimit),
    recurringCorners: recurringCorners.slice(0, 3), previousAdvice: advice.slice(0, CONFIG.memory.adviceLimit) };
}

export class RaceMemory {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.driver = options.driver || null;
    this.ready = null;
    this.retryAfter = 0;
    this.active = 0;
  }

  get configured() { return Boolean(this.env.NEO4J_URI && this.env.NEO4J_USERNAME && this.env.NEO4J_PASSWORD); }

  getDriver() {
    if (!this.driver) this.driver = neo4j.driver(this.env.NEO4J_URI, neo4j.auth.basic(this.env.NEO4J_USERNAME, this.env.NEO4J_PASSWORD), {
      connectionTimeout: CONFIG.memory.connectionTimeoutMs,
      connectionAcquisitionTimeout: CONFIG.memory.connectionTimeoutMs,
      maxTransactionRetryTime: 0, maxConnectionPoolSize: 4, disableLosslessIntegers: true,
    });
    return this.driver;
  }

  query(cypher, parameters = {}, read = false) {
    return this.getDriver().executeQuery(cypher, parameters, {
      database: this.env.NEO4J_DATABASE || "neo4j", routing: read ? "READ" : "WRITE",
      transactionConfig: { timeout: CONFIG.memory.queryTimeoutMs },
    });
  }

  async initialize() {
    if (!this.ready) this.ready = (async function () {
      for (const label of LABELS) {
        // Labels are constants above, never taken from requests.
        await this.query("CREATE CONSTRAINT " + label.toLowerCase() + "_id IF NOT EXISTS FOR (n:" + label + ") REQUIRE n.id IS UNIQUE");
      }
    }.bind(this))();
    await this.ready;
  }

  async perform(action) {
    if (!this.configured) return { status: "not_configured" };
    if (Date.now() < this.retryAfter) return { status: "unavailable" };
    if (this.active >= CONFIG.memory.maxConcurrentRequests) return { status: "busy" };
    this.active++;
    try {
      await this.initialize();
      return { status: "connected", data: await action() };
    } catch {
      this.ready = null;
      this.retryAfter = Date.now() + CONFIG.memory.retryDelayMs;
      // Do not expose credentials, hostnames, or private database errors.
      console.warn("[memory] Neo4j unavailable; continuing without persistent memory");
      return { status: "unavailable" };
    } finally { this.active--; }
  }

  async health() {
    return this.perform(async function () { await this.query("RETURN 1 AS ok", {}, true); return true; }.bind(this));
  }

  async saveLap(scope, lap) {
    const p = keys(scope);
    return this.perform(async function () {
      await this.query(`
        MERGE (d:RaceDriver {id: $driverKey}) SET d.dataset = $dataset
        MERGE (t:RaceTrack {id: $trackKey}) SET t.name = $trackId, t.dataset = $dataset
        MERGE (s:RaceSession {id: $sessionKey}) SET s.mode = $mode, s.dataset = $dataset
        MERGE (d)-[:DROVE]->(s) MERGE (s)-[:ON_TRACK]->(t)
        MERGE (l:RaceLap {id: $lapKey}) ON CREATE SET l.createdAt = $now
        SET l.summary = $summary, l.lapNumber = $lapNumber, l.lapTimeSeconds = $lapTimeSeconds, l.dataset = $dataset
        MERGE (s)-[:HAS_LAP]->(l)
        WITH l, t
        UNWIND $corners AS item
        MERGE (c:RaceCorner {id: $trackKey + ':' + item.name}) SET c.name = item.name
        MERGE (t)-[:HAS_CORNER]->(c)
        MERGE (a:RaceCornerAttempt {id: $lapKey + ':' + item.name}) SET a += item
        MERGE (l)-[:HAS_CORNER]->(a) MERGE (a)-[:AT_CORNER]->(c)`,
      { ...p, ...lap, lapKey: p.sessionKey + ":" + lap.id, now: Date.now() });
      return { lapId: lap.id };
    }.bind(this));
  }

  async context(scope) {
    return this.perform(async function () {
      const result = await this.query(`
        MATCH (:RaceDriver {id: $driverKey})-[:DROVE]->(s:RaceSession)-[:ON_TRACK]->(:RaceTrack {id: $trackKey})
        WHERE s.mode = $mode
        WITH collect(s) AS sessions
        CALL {
          WITH sessions UNWIND sessions AS s MATCH (s)-[:HAS_LAP]->(l:RaceLap)
          WITH l ORDER BY l.createdAt DESC, l.id DESC LIMIT $historyLimit
          OPTIONAL MATCH (l)-[:HAS_CORNER]->(a:RaceCornerAttempt)-[:AT_CORNER]->(c:RaceCorner)
          WITH l, collect(CASE WHEN c IS NOT NULL THEN {name: c.name, timeLostSeconds: a.timeLostSeconds,
            brakedEarlyMeters: a.brakedEarlyMeters, minimumSpeedDifferenceKmh: a.minimumSpeedDifferenceKmh,
            throttlePickupLateMeters: a.throttlePickupLateMeters} END) AS corners
          ORDER BY l.createdAt DESC, l.id DESC
          RETURN collect({id: l.id, summary: left(l.summary, $summaryChars), lapNumber: l.lapNumber, corners: corners}) AS laps
        }
        CALL {
          WITH sessions UNWIND sessions AS s MATCH (s)-[:RECEIVED]->(tip:RaceCoaching)
          WITH tip ORDER BY tip.createdAt DESC, tip.id DESC LIMIT $adviceLimit
          RETURN collect({text: tip.text, source: tip.source}) AS advice
        }
        RETURN laps, advice`, { ...keys(scope), historyLimit: neo4j.int(CONFIG.memory.historyLimit),
        summaryChars: neo4j.int(CONFIG.memory.summaryChars), adviceLimit: neo4j.int(CONFIG.memory.adviceLimit) }, true);
      const record = result.records[0];
      return summarizeMemory(record ? record.get("laps") : [], record ? record.get("advice") : [], scope.dataset);
    }.bind(this));
  }

  async saveCoaching(scope, tip, question) {
    return this.perform(async function () {
      await this.query(`MERGE (d:RaceDriver {id: $driverKey}) SET d.dataset = $dataset
        MERGE (t:RaceTrack {id: $trackKey}) SET t.name = $trackId, t.dataset = $dataset
        MERGE (s:RaceSession {id: $sessionKey}) SET s.mode = $mode, s.dataset = $dataset
        MERGE (d)-[:DROVE]->(s) MERGE (s)-[:ON_TRACK]->(t)
        CREATE (tip:RaceCoaching {id: $id, text: $text, source: $source, question: $question, createdAt: $now})
        CREATE (s)-[:RECEIVED]->(tip)`, { ...keys(scope), id: randomUUID(), text: tip.text,
        source: tip.source, question: question, now: Date.now() });
      return true;
    }.bind(this));
  }

  async close() { if (this.driver) await this.driver.close(); }
}

export function installMemoryRoutes(app, memory) {
  app.get("/api/memory/status", async function (req, res) {
    if (req.query.check === "true") res.json(await memory.health());
    else res.json({ status: memory.configured ? "configured" : "not_configured" });
  });
  app.post("/api/memory/laps", async function (req, res) {
    if (req.body?.enabled !== true) { res.status(403).json({ error: "engineer_disabled" }); return; }
    let scope, lap;
    try { scope = cleanMemoryScope(req.body.scope); lap = cleanLap(req.body.lap); }
    catch (error) { res.status(400).json({ error: error.message }); return; }
    res.json(await memory.saveLap(scope, lap));
  });
  app.post("/api/memory/demo", async function (req, res) {
    if (req.body?.enabled !== true) { res.status(403).json({ error: "engineer_disabled" }); return; }
    let scope;
    try { scope = cleanMemoryScope(req.body.scope); if (scope.dataset !== "demo") throw new Error("Examples require the demo dataset"); }
    catch (error) { res.status(400).json({ error: error.message }); return; }
    for (const raw of MEMORY_DEMO_LAPS) {
      const result = await memory.saveLap(scope, cleanLap(raw));
      if (result.status !== "connected") { res.json(result); return; }
    }
    res.json(await memory.context(scope));
  });
}
