# Race engineer integration

Yuan owns the simulator telemetry and lap/corner analysis. The friend owns the AI engineer and voice. The current coach already consumes the existing `makeState()` object locally; it works without a phone connected. It does not compute lap comparisons itself.

## Run

Copy `.env.example` to `.env` and fill in `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` from ai&. The base URL should include the API version, for example `https://api.aiand.com/v1`. Restart `npm start` after changing `.env`. Credentials stay on the server and `.env` is ignored by Git.

Open `/game.html`, choose Free drive, and watch the Race engineer panel. Click Voice on for spoken tips. Hold V or Hold to talk to ask a question; release to submit. You can always type a question. Speech recognition depends on the browser and may send audio to its speech service; this prototype does not use local Whisper. Speech is off by default. Routine speech waits until stopped or on a straight with throttle, pauses during corners, and expires instead of building a backlog.

Open `/coach-lab.html` to test with clearly labeled sample states without driving. Practice tips are rule based, not AI, and labeled as such. Missing settings, busy/failed providers and timeouts keep the game running. Question fallback explicitly reports that AI is unavailable. Crash, flip and empty-tank callouts are immediate rules and may interrupt speech. Resetting a scenario discards old context and replies.

## Yuan's lap-summary connection

When analysis finishes a valid lap, dispatch a compact **measured text summary** in the game browser:

```js
window.dispatchEvent(new CustomEvent("race:lap-summary", {
  detail: "Lap 3: T4 braked 12 m earlier than best, minimum speed 6 km/h slower, lost 0.35 s."
}));
```

Use actual analysis values, not this example. The coach retains the latest five summaries in that browser tab, sends them with coaching requests, and clears them when changing levels. Summaries should use consistent corner names and include lap numbers to support trend detection. No storage or Neo4j persistence is implemented yet.

The existing shared state/phone protocol is unchanged. The small `game.js` adapter also passes throttle directly to the voice scheduler; throttle is not added to the phone message format.

## Server contract

`POST /api/coach` accepts either the original car-state object or:

```js
{ state: carState, lang: "en", question: "Where am I losing time?", history: ["Lap 3: …"] }
```

Response: `{ type: "tip", text, lang, source: "ai" | "fallback", latencyMs, reason? }`. Bad state returns HTTP 400. No credentials are returned. The server calls the OpenAI-compatible `/chat/completions` endpoint using native Node fetch. Tunables, request timeout, speech timing, language default and input limits are in `public/config.js` under `coach`.

## Validation

Run `npm test`. Tests cover telemetry validation, bounded lap history, provider payload/auth isolation, offline fallback, timeout recovery, and speech waiting/expiry. Browser microphone permissions, actual spoken audio and provider latency should also be checked on the demo laptop.
