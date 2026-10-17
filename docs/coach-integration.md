# Race engineer integration

Yuan owns the simulator telemetry and lap/corner analysis. The friend owns the AI engineer and voice. The current coach already consumes the existing `makeState()` object locally; it works without a phone connected. It does not compute lap comparisons itself.

## Run

Copy `.env.example` to `.env` and fill in `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` from ai&. The base URL should include the API version, for example `https://api.aiand.com/v1`. Restart `npm start` after changing `.env`. Credentials stay on the server and `.env` is ignored by Git.

Open `/game.html`, choose Free drive, and watch the Race engineer panel. **The engineer starts off, and automatic tips start unchecked.** Turn Engineer on to ask questions. Automatic tips require a separate opt-in because they may make recurring paid AI calls. Eligible measured cues and outcome reports use deterministic analysis without an AI call. Turning Engineer off cancels browser requests, microphone capture and speech, clears queued questions, and prevents further AI requests from that tab. The server aborts upstream work when the browser disconnects. A request already received by the provider may still incur charges. Older tabs without explicit opt-in are rejected by the server.

Choose an installed English or Japanese voice in Mac / browser voice and use **Preview voice · free** to compare voices without any AI request, even while the engineer is off. No paid speech service is used. Available voices depend on the browser and installed system voices; additional voices can be downloaded through macOS Accessibility > Read & Speak (Spoken Content on older macOS versions).

Click Voice on for spoken tips. Click Talk to engineer, allow microphone access, speak, then click Finish talking. Alternatively, hold V and release to submit. Starting a conversation enables spoken replies; turning Voice off stops microphone capture and cancels the recording. The panel shows the transcribed question. You can always type a question. Speech recognition depends on the browser and may send audio to its speech service; this prototype does not use local Whisper. Routine speech waits until stopped or on a straight with throttle, pauses during corners, and expires instead of building a backlog.

Open `/coach-lab.html` to test with clearly labeled sample states without driving. Practice tips are rule based, not AI, and labeled as such. Missing settings, busy/failed providers and timeouts keep the game running. Question fallback explicitly reports that AI is unavailable. Crash, flip and empty-tank callouts are immediate rules and may interrupt speech. Resetting a scenario discards old context and replies.

## Yuan's lap-summary connection

When analysis finishes a valid lap, dispatch a compact **measured text summary** in the game browser:

```js
window.dispatchEvent(new CustomEvent("race:lap-summary", {
  detail: "Lap 3: T4 braked 12 m earlier than best, minimum speed 6 km/h slower, lost 0.35 s."
}));
```

Use actual analysis values, not this example. The coach retains the latest five summaries in that browser tab, sends them with coaching requests, and clears them when changing levels. Summaries should use consistent corner names and include lap numbers to support trend detection. Optional Neo4j persistence now stores summaries while the engineer is on and retrieves past laps for the same browser driver, track, and car mode. See [Neo4j setup](neo4j-memory.md) for credentials and the structured lap format.

The existing shared state/phone protocol is unchanged. The small `game.js` adapter also passes throttle directly to the voice scheduler; throttle is not added to the phone message format.

## Server contract

`POST /api/coach` requires explicit `enabled: true` and accepts:

```js
{ enabled: true, state: carState, lang: "en", question: "Where am I losing time?", history: ["Lap 3: …"] }
```

Response: `{ type: "tip", text, lang, source: "ai" | "fallback" | "analysis", latencyMs, reason?, memory?, coaching? }`. Bad state returns HTTP 400. No credentials are returned. The server calls the OpenAI-compatible `/chat/completions` endpoint using native Node fetch. Tunables, request timeout, speech timing, language default and input limits are in `public/config.js` under `coach`.

## Validation

Run `npm test`. Tests cover telemetry validation, bounded lap history, provider payload/auth isolation, offline fallback, timeout recovery, and speech waiting/expiry. Browser microphone permissions, actual spoken audio and provider latency should also be checked on the demo laptop.

## Recommendation and outcome handoff

For automatic measured coaching, use the [structured lap format](neo4j-memory.md#yuans-analysis-handoff), including `valid`, immutable reference/track/physics/setup identifiers, and timestamps recorded during driving. Text summaries alone cannot evaluate whether a driver changed technique after advice.

`POST /api/memory/focus` (enabled + scope) selects and persists one evidence-backed cue without AI. `/api/memory/focus/ack` marks its ID shown; `/api/memory/focus/dismiss` dismisses it. `/api/memory/laps` stores an immutable payload and evaluates a pending cue against the first eligible later attempt. These operations retain driver/track/mode/dataset scoping. Their response uses `status` and `data`; missing credentials/busy/unavailable storage never stop the simulator. Failed writes currently need another producer retry; no durable queue is implemented.

Coach responses can include `coaching: { focus, outcome }`. The evidence card displays the recommendation, supporting sample count and measured outcome. `source: analysis` means a deterministic cue, not a paid model response. Questions still use ai& with the measured focus/outcome in context. Shared phone/state WebSocket messages are unchanged.
