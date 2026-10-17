import test from "node:test";
import assert from "node:assert/strict";
import { RaceEngineer } from "../public/coach.js";
import { SAMPLE_STATE } from "../public/shared/protocol.js";
import { installCoachRoutes, cleanCoachRequest, getCoachTip } from "../server/ai.js";
import { EngineerVoice } from "../public/voice.js";

class Element {
  constructor() { this.value = ""; this.dataset = {}; this.fields = new Map(); this.children = []; }
  querySelector(selector) {
    if (!this.fields.has(selector)) this.fields.set(selector, new Element());
    return this.fields.get(selector);
  }
  setAttribute() {}
  addEventListener() {}
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  blur() {}
}

test("engineer defaults off, requires explicit automatic tips, and ignores late replies after off", async function () {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let resolveRequest;
  let signal;
  globalThis.document = { createElement: function () { return new Element(); }, body: { appendChild: function () {} } };
  globalThis.window = { addEventListener: function () {}, speechSynthesis: { cancel: function () {}, getVoices: function () { return []; } } };
  globalThis.fetch = function (url, options) {
    calls++;
    signal = options.signal;
    assert.equal(JSON.parse(options.body).enabled, true);
    return new Promise(function (resolve) { resolveRequest = resolve; });
  };
  try {
    const engineer = new RaceEngineer();
    for (let i = 0; i < 30; i++) engineer.update(SAMPLE_STATE, 1, false);
    engineer.ask("Test question");
    await engineer.request();
    assert.equal(calls, 0);
    assert.equal(engineer.talk.disabled, true);
    engineer.setPower(true);
    engineer.update(SAMPLE_STATE, 1, false);
    assert.equal(calls, 0, "power on alone must not start recurring requests");
    engineer.autoTips.checked = true;
    engineer.update(SAMPLE_STATE, 1, false);
    assert.equal(calls, 1);
    engineer.setPower(false);
    assert.equal(signal.aborted, true);
    resolveRequest({ ok: true, json: async function () { return { text: "Stale paid reply", source: "ai" }; } });
    await new Promise(setImmediate);
    for (let i = 0; i < 30; i++) engineer.update(SAMPLE_STATE, 1, false);
    engineer.startConversation();
    assert.equal(calls, 1);
    assert.equal(engineer.tip.textContent, "Engineer is off.");
    assert.equal(engineer.voice.enabled, false);
    assert.equal(engineer.autoTips.checked, false);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    delete globalThis.document;
  }
});

test("server blocks old clients lacking explicit engineer opt-in", async function () {
  let handler;
  installCoachRoutes({ post: function (path, callback) { handler = callback; } });
  let status;
  let body;
  const res = { status: function (value) { status = value; return this; }, json: function (value) { body = value; } };
  await handler({ body: SAMPLE_STATE }, res);
  assert.equal(status, 403);
  assert.equal(body.error, "engineer_disabled");
});

test("disconnect cancellation reaches an in-flight provider request", async function () {
  const controller = new AbortController();
  const pending = getCoachTip(cleanCoachRequest(SAMPLE_STATE), {
    env: { AI_BASE_URL: "https://example.invalid", AI_API_KEY: "test", AI_MODEL: "test" },
    signal: controller.signal,
    fetch: function (url, options) {
      return new Promise(function (resolve, reject) {
        options.signal.addEventListener("abort", function () { reject(new Error("cancelled")); });
      });
    },
  });
  controller.abort();
  assert.equal((await pending).reason, "cancelled");
});

test("free voice preview uses the selected installed voice without calling an API", function () {
  const installed = { voiceURI: "mac-test", name: "Example enhanced voice", lang: "en-US" };
  let spoken;
  globalThis.window = { speechSynthesis: { cancel: function () {}, getVoices: function () { return [installed]; }, speak: function (speech) { spoken = speech; } } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  try {
    const voice = new EngineerVoice(function () {}, function () {});
    voice.voiceName = installed.voiceURI;
    voice.preview("en");
    assert.equal(voice.enabled, false);
    assert.equal(spoken.voice, installed);
    assert.match(spoken.text, /Radio check/);
    voice.clear();
    assert.equal(voice.current, null);
  } finally {
    delete globalThis.window;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
