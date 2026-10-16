// coach.js — Owner: A (Yuan)
// AI coach, game side (Milestone 4, not built yet):
// - send the car state to POST /api/coach every few seconds and on key events
// - show the returned tip as a subtitle and speak it with speechSynthesis (EN / 日本語)
// - fall back to a rule-based tip if the AI is slow (> ~3 s) or fails
// Use SAMPLE_STATE and FAKE_TIP from shared/protocol.js to test without the game or the AI.
