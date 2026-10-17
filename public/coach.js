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
      <div class="engineer-heading">
        <svg class="engineer-avatar" viewBox="0 0 100 112" aria-hidden="true">
          <circle cx="50" cy="54" r="45" fill="#263d48"/>
          <path d="M15 112v-7c0-19 16-28 35-28s35 9 35 28v7" fill="#d9e6dc"/>
          <path d="M40 76v14l10 9 10-9V76" fill="#c88e69"/>
          <rect x="25" y="21" width="50" height="64" rx="24" fill="#e6b08b"/>
          <path d="M25 47V31c0-15 11-24 25-24s25 9 25 24v12l-9-15-24 5-12-3z" fill="#252b33"/>
          <path d="M23 48V36C23 0 77 0 77 36v12" fill="none" stroke="#89dce4" stroke-width="7"/>
          <rect x="16" y="42" width="13" height="25" rx="6" fill="#14242d" stroke="#89dce4" stroke-width="2"/>
          <rect x="71" y="42" width="13" height="25" rx="6" fill="#14242d" stroke="#89dce4" stroke-width="2"/>
          <g class="engineer-eyes" fill="#222b32"><circle cx="39" cy="49" r="3"/><circle cx="61" cy="49" r="3"/></g>
          <path d="M34 40l9-1m14 0 9 1" stroke="#644538" stroke-width="2" stroke-linecap="round"/>
          <path d="M49 52l-2 8h5" fill="none" stroke="#bc7d5a" stroke-width="2" stroke-linecap="round"/>
          <ellipse class="engineer-mouth" cx="50" cy="70" rx="8" ry="2" fill="#704836"/>
          <path d="M77 63v7c0 6-9 8-17 8" fill="none" stroke="#89dce4" stroke-width="3"/>
          <rect x="54" y="74" width="12" height="6" rx="3" fill="#14242d"/>
          <path d="M50 99v13" stroke="#92aaa4" stroke-width="2"/>
        </svg>
        <div><strong>Race engineer</strong><span class="engineer-mood">Standing by</span></div>
      </div>
      <div class="engineer-controls">
        <select aria-label="Engineer language"><option value="en">English</option><option value="ja">日本語</option></select>
        <button type="button" class="voice-toggle" aria-pressed="false">Voice off</button></div>
      <p class="engineer-tip" aria-live="polite">Drive to receive coaching.</p>
      <div class="engineer-status" role="status">Waiting for driving data</div>
      <p class="engineer-question" hidden></p>
      <form><input aria-label="Question for your engineer" placeholder="Ask your engineer…" maxlength="400"><button>Ask</button></form>
      <button type="button" class="engineer-talk" aria-pressed="false">Talk to engineer</button>
      <small class="speech-note">Click to start/finish, or hold V. Uses your browser’s speech service.</small>`;
    document.body.appendChild(this.panel);
    this.language = this.panel.querySelector("select");
    this.language.value = CONFIG.coach.language;
    this.tip = this.panel.querySelector(".engineer-tip");
    this.status = this.panel.querySelector(".engineer-status");
    this.mood = this.panel.querySelector(".engineer-mood");
    this.questionText = this.panel.querySelector(".engineer-question");
    this.talk = this.panel.querySelector(".engineer-talk");
    this.input = this.panel.querySelector("input");
    this.input.maxLength = CONFIG.coach.maxQuestionLength;
    this.voice = new EngineerVoice(this.ask.bind(this), this.setStatus.bind(this));
    const toggle = this.panel.querySelector(".voice-toggle");
    this.voiceToggle = toggle;
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
    const talk = this.talk;
    if (!this.voice.recognition) {
      talk.disabled = true;
      talk.textContent = "Voice input unavailable — type above";
    }
    talk.addEventListener("click", function () {
      if (this.voice.listening) this.voice.stopListening();
      else this.startConversation();
      talk.blur();
    }.bind(this));
    talk.addEventListener("keydown", function (event) {
      if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
    });
    window.addEventListener("keydown", function (event) {
      if (event.code !== CONFIG.coach.pushToTalkKey || event.repeat || event.target.closest("input, select, textarea")) return;
      if (!this.paused) this.startConversation();
    }.bind(this));
    window.addEventListener("keyup", function (event) {
      if (event.code === CONFIG.coach.pushToTalkKey) this.voice.stopListening();
    }.bind(this));
    window.addEventListener("blur", function () { this.voice.stopListening(true); }.bind(this));
    // Yuan can dispatch this event after analysis without importing game internals.
    window.addEventListener("race:lap-summary", function (event) { this.addLapSummary(event.detail); }.bind(this));
  }

  setStatus(text) {
    this.status.textContent = text;
    this.refreshFace();
  }

  startConversation() {
    if (this.paused || !this.state) {
      this.setStatus("Choose Free drive before talking to your engineer.");
      return;
    }
    // Starting a conversation also enables the engineer's spoken reply.
    const enabled = this.voice.setEnabled(true);
    this.voiceToggle.textContent = enabled ? "Voice on" : "Voice off";
    this.voiceToggle.setAttribute("aria-pressed", String(enabled));
    this.voice.startListening(this.language.value);
    this.refreshFace();
  }

  refreshFace() {
    let expression = "idle";
    let label = "Standing by";
    if (this.voice?.listening) {
      expression = "listening";
      label = "Listening to you";
    } else if (this.voice?.current) {
      expression = "speaking";
      label = "On the radio";
    } else if (this.controller) {
      expression = "thinking";
      label = "Reading the drive";
    }
    this.panel.dataset.expression = expression;
    this.mood.textContent = label;
    if (this.voice?.recognition) {
      this.talk.textContent = this.voice.stopping ? "Sending question…" : this.voice.listening ? "Finish talking" : "Talk to engineer";
      this.talk.setAttribute("aria-pressed", String(this.voice.listening));
    }
  }

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
    this.questionText.hidden = true;
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
    this.refreshFace();
    if (paused) return;
    for (const event of state.events || []) this.events.add(event);
    if (this.voice.listening) return;
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
    this.questionText.textContent = "You: “" + question + "”";
    this.questionText.hidden = false;
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
      if (generation === this.generation) {
        this.controller = null;
        this.refreshFace();
      }
    }
  }
}
