// Owner: friend — browser speech with one pending message, never a growing queue.
import { CONFIG } from "./config.js";

export function instantCallout(events, lang) {
  const ja = lang === "ja";
  if (events.includes("crash") || events.includes("flip")) {
    return { text: ja ? "衝突です。必要ならRでリセット。" : "Impact detected. Press R to reset if needed.", lang: lang };
  }
  if (events.includes("tank_empty")) {
    return { text: ja ? "エアが空です。スラスターは使えません。" : "Air tank empty. Thrusters are unavailable.", lang: lang };
  }
  return null;
}

export class EngineerVoice {
  constructor(onQuestion, onStatus) {
    this.enabled = false;
    this.pending = null;
    this.current = null;
    this.utterance = null;
    this.listening = false;
    this.stopping = false;
    this.cancelled = false;
    this.onStatus = onStatus;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = Recognition ? new Recognition() : null;
    if (this.recognition) {
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.onresult = function (event) {
        if (this.cancelled) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) this.transcript += event.results[i][0].transcript + " ";
        }
      }.bind(this);
      this.recognition.onerror = function (event) {
        this.transcript = "";
        this.cancelled = true;
        onStatus("Microphone: " + event.error + ". You can type your question.");
      }.bind(this);
      this.recognition.onend = function () {
        this.listening = false;
        this.stopping = false;
        const text = (this.transcript || "").trim();
        this.transcript = "";
        if (this.cancelled) return;
        onStatus(text ? "Question captured." : "No speech detected. Try again.");
        if (text) onQuestion(text);
      }.bind(this);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled && "speechSynthesis" in window;
    if (!this.enabled) this.clear();
    if (!this.enabled) this.stopListening(true);
    return this.enabled;
  }

  clear() {
    this.pending = null;
    this.current = null;
    this.utterance = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  queue(tip, urgent = false) {
    if (!this.enabled) return;
    this.pending = { text: tip.text, lang: tip.lang, urgent: urgent, expires: performance.now() + CONFIG.coach.tipLifetimeMs };
    if (urgent && "speechSynthesis" in window) {
      this.current = null;
      window.speechSynthesis.cancel();
    }
  }

  update(state, throttle, paused) {
    if (!this.enabled) return;
    const safe = !paused && !this.listening && !state.airborne &&
      (state.speedKmh < CONFIG.coach.stoppedSpeedKmh ||
        (Math.abs(state.steer) < CONFIG.coach.straightSteer && throttle > CONFIG.coach.straightThrottle));
    if (this.current && !safe && !this.current.urgent) {
      if (!this.pending) this.pending = this.current;
      this.current = null;
      window.speechSynthesis.cancel();
    }
    const message = this.pending;
    if (!message || this.current) return;
    if (performance.now() > message.expires) {
      this.pending = null;
      return;
    }
    if (paused || this.listening || (!safe && !message.urgent)) return;
    this.pending = null;
    this.current = message;
    const speech = new SpeechSynthesisUtterance(message.text);
    this.utterance = speech;
    speech.lang = message.lang === "ja" ? "ja-JP" : "en-US";
    speech.rate = CONFIG.coach.speechRate;
    speech.onend = speech.onerror = function () {
      if (this.utterance === speech) {
        this.current = null;
        this.utterance = null;
      }
    }.bind(this);
    window.speechSynthesis.speak(speech);
  }

  startListening(lang) {
    if (!this.recognition || this.listening) return false;
    this.clear();
    this.transcript = "";
    this.cancelled = false;
    this.stopping = false;
    this.recognition.lang = lang === "ja" ? "ja-JP" : "en-US";
    this.listening = true;
    try {
      this.recognition.start();
      this.onStatus("Listening… click Finish talking or release V to ask.");
      return true;
    } catch {
      this.listening = false;
      this.onStatus("Microphone unavailable. Type your question instead.");
      return false;
    }
  }

  stopListening(cancel = false) {
    if (!this.listening || !this.recognition) return;
    if (cancel) {
      this.cancelled = true;
      this.transcript = "";
      this.recognition.abort();
    } else if (!this.stopping) {
      this.stopping = true;
      this.recognition.stop();
      this.onStatus("Finishing your question…");
    }
  }
}
