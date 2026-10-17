// Owner: friend — live state adapter, AI coach UI, and Yuan's lap-summary hook.
import { CONFIG } from "./config.js";
import { EngineerVoice, instantCallout } from "./voice.js";

export class RaceEngineer {
  constructor() {
    this.state = null;
    this.history = [];
    this.events = new Set();
    this.previousEvents = new Set();
    this.lastRequest = -Infinity;
    this.controller = null;
    this.generation = 0;
    this.paused = true;
    this.lastTip = "";
    this.queuedQuestion = "";
    this.needsLapFeedback = false;
    this.panel = document.createElement("section");
    this.panel.id = "engineer";
    this.panel.className = "panel";
    this.panel.setAttribute("aria-label", "Race engineer");
    this.panel.innerHTML = `
      <div class="engineer-heading"><strong>Race engineer</strong>
        <select aria-label="Engineer language"><option value="en">English</option><option value="ja">日本語</option></select>
        <button type="button" class="voice-toggle" aria-pressed="false">Voice off</button></div>
      <p class="engineer-tip" aria-live="polite">Drive to receive coaching.</p>
      <div class="engineer-status" role="status">Waiting for driving data</div>
      <form><input aria-label="Question for your engineer" placeholder="Ask your engineer…" maxlength="400"><button>Ask</button></form>
      <button type="button" class="engineer-talk">Hold to talk · V</button>
      <small class="speech-note">Voice questions use your browser’s speech service.</small>`;
    document.body.appendChild(this.panel);
    this.language = this.panel.querySelector("select");
    this.language.value = CONFIG.coach.language;
    this.tip = this.panel.querySelector(".engineer-tip");
    this.status = this.panel.querySelector(".engineer-status");
    this.input = this.panel.querySelector("input");
    this.input.maxLength = CONFIG.coach.maxQuestionLength;
    this.voice = new EngineerVoice(this.ask.bind(this), this.setStatus.bind(this));
    const toggle = this.panel.querySelector(".voice-toggle");
    toggle.addEventListener("click", function () {
      const enabled = this.voice.setEnabled(!this.voice.enabled);
      toggle.textContent = enabled ? "Voice on" : "Voice off";
      toggle.setAttribute("aria-pressed", String(enabled));
      toggle.blur();
    }.bind(this));
    this.panel.querySelector("form").addEventListener("submit", function (event) {
      event.preventDefault();
      this.ask(this.input.value);
    }.bind(this));
    this.language.addEventListener("change", function () {
      this.invalidate();
      this.lastRequest = -Infinity;
      this.lastTip = "";
      this.language.blur();
    }.bind(this));
    const talk = this.panel.querySelector(".engineer-talk");
    if (!this.voice.recognition) {
      talk.disabled = true;
      talk.textContent = "Voice input unavailable — type above";
    }
    talk.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      talk.setPointerCapture(event.pointerId);
      this.voice.startListening(this.language.value);
    }.bind(this));
    talk.addEventListener("pointerup", function () { this.voice.stopListening(); talk.blur(); }.bind(this));
    talk.addEventListener("pointercancel", function () { this.voice.stopListening(true); }.bind(this));
    window.addEventListener("keydown", function (event) {
      if (event.code !== CONFIG.coach.pushToTalkKey || event.repeat || event.target.closest("input, select, textarea")) return;
      if (!this.paused) this.voice.startListening(this.language.value);
    }.bind(this));
    window.addEventListener("keyup", function (event) {
      if (event.code === CONFIG.coach.pushToTalkKey) this.voice.stopListening();
    }.bind(this));
    window.addEventListener("blur", function () { this.voice.stopListening(true); }.bind(this));
    // Yuan can dispatch this event after analysis without importing game internals.
    window.addEventListener("race:lap-summary", function (event) { this.addLapSummary(event.detail); }.bind(this));
  }

  setStatus(text) { this.status.textContent = text; }

  invalidate() {
    this.generation++;
    if (this.controller) this.controller.abort();
    this.controller = null;
    this.voice.clear();
    this.voice.stopListening(true);
    this.queuedQuestion = "";
  }

  reset() {
    this.invalidate();
    this.history = [];
    this.events.clear();
    this.previousEvents.clear();
    this.state = null;
    this.lastRequest = -Infinity;
    this.lastTip = "";
    this.needsLapFeedback = false;
    this.tip.textContent = "Drive to receive coaching.";
    this.setStatus("Waiting for driving data");
  }

  addLapSummary(summary) {
    if (typeof summary !== "string" || !summary.trim()) return;
    this.history.push(summary.trim().slice(0, CONFIG.coach.maxSummaryLength));
    this.history = this.history.slice(-CONFIG.coach.maxHistory);
    this.needsLapFeedback = true;
  }

  update(state, throttle, paused = false) {
    if (paused && !this.paused) this.invalidate();
    this.paused = paused;
    this.state = state;
    const newEvents = [];
    for (const event of state.events || []) {
      if (!this.previousEvents.has(event)) newEvents.push(event);
    }
    this.previousEvents = new Set(state.events || []);
    const callout = instantCallout(newEvents, this.language.value);
    if (!paused && callout) {
      this.tip.textContent = callout.text;
      this.setStatus("Instant callout · driving event");
      this.voice.queue(callout, true);
    }
    this.voice.update(state, throttle, paused);
    if (paused) return;
    for (const event of state.events || []) this.events.add(event);
    if (this.controller) return;
    if (this.queuedQuestion) {
      const question = this.queuedQuestion;
      this.queuedQuestion = "";
      this.request(question);
    } else if (this.needsLapFeedback || performance.now() - this.lastRequest >= CONFIG.coach.intervalMs) {
      this.needsLapFeedback = false;
      this.request();
    }
  }

  ask(question) {
    question = question.trim().slice(0, CONFIG.coach.maxQuestionLength);
    if (!question) return;
    if (!this.state || this.paused) {
      this.setStatus("Start driving before asking your engineer.");
      return;
    }
    this.input.value = "";
    this.input.blur();
    if (this.controller) {
      this.queuedQuestion = question;
      this.setStatus("Question queued; waiting for the current reply.");
    } else this.request(question);
  }

  async request(question = "") {
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.lastRequest = performance.now();
    const state = { ...this.state, events: Array.from(this.events) };
    this.events.clear();
    const lang = this.language.value;
    this.setStatus("Engineer thinking…");
    const timeout = setTimeout(function () { controller.abort(); }, CONFIG.coach.requestTimeoutMs + 1000);
    try {
      const response = await fetch("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ state: state, lang: lang, history: this.history, question: question }),
      });
      if (!response.ok) throw new Error("coach_unavailable");
      const tip = await response.json();
      if (generation !== this.generation) return;
      if (typeof tip.text !== "string" || !tip.text) throw new Error("empty_tip");
      this.tip.textContent = tip.text;
      if (tip.source === "ai") this.setStatus("ai& · " + tip.latencyMs + " ms");
      else if (tip.reason === "not_configured") this.setStatus("Practice tips · ai& not configured");
      else this.setStatus("Practice tips · ai& unavailable (" + tip.reason + ")");
      if (question || tip.text !== this.lastTip) {
        this.voice.queue(tip);
        this.lastTip = tip.text;
      }
    } catch {
      if (generation === this.generation) this.setStatus("Engineer connection unavailable. Driving continues.");
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) this.controller = null;
    }
  }
}
