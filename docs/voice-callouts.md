# Voice callouts

Poker Fate speaks actions aloud. The auto-generated captions on the reference video
picked up a voice track announcing plays as they happened — "call, call, call, raise,
call, call, all, raise call" over the preflop street, then "pair, check, all, all in"
later in the hand. Actions and made hands are both announced.

This is **not implemented**. The animation system is silent; `LocalSettings.sound`
exists in `src/services/storage.ts` but nothing reads it. This document records what
would be needed.

## What to announce

The reference announces at least:

- **Actions** — check, call, bet, raise, fold, all-in. One clip per action type.
- **Made hands** — the caption caught "pair", so hand categories are spoken at
  showdown. The nine categories already exist as `CATEGORY_LABELS` in
  `src/game/evaluator.ts`.
- **All-in emphasis** — the cut-in has its own vocal sting distinct from a normal
  raise, matching the visual escalation.

## Where it would hook in

The animation queue in `src/services/animator.ts` is already the single place where
every visible beat is sequenced, and each beat has a known duration. Audio slots
directly into the existing `play*` functions:

- `playAction` — fire the action clip as the callout appears
- `playSettle` — fire the hand-category clip as the banner lands
- `playCollect` / `playAward` — chip sounds, which are effects rather than voice

Because the queue is serial and already respects `reduceMotion`, a `sound` check in
the same place gives the user one switch that governs both.

## Language

The interface is Chinese, so callouts should be Mandarin: 过牌 / 跟注 / 加注 / 弃牌 /
全下, plus the nine hand categories. English clips would clash with the UI copy.

## Sourcing

Roughly 15–20 short clips (under a second each). Options:

- **TTS generation** — cheapest and fastest. Azure, ElevenLabs, or similar produce
  usable Mandarin at low cost, and regenerating a clip is trivial. Quality is good
  enough for short interjections, though it will not sound like character acting.
- **Voice acting** — what Poker Fate appears to use: each character has a voice.
  That multiplies the clip count by the number of characters and requires casting,
  direction, and per-character recording sessions. Expensive, and it only pays off
  once the per-character art from [character-art.md](character-art.md) exists,
  since the voice and the art are the same identity.

## Implementation notes

- **Preload on hand start.** A clip that fetches mid-action arrives late and reads as
  a bug. Load the sprite or the individual files when a hand begins.
- **Use a single audio sprite** rather than 20 requests. One file with time offsets
  keeps the network cost to one fetch and avoids per-clip decode latency.
- **Respect autoplay policy.** Browsers block audio until the user has interacted with
  the page. Since the player taps a button to act, the first interaction always
  precedes the first callout, but a guard is still needed for spectators and for
  peers whose first sound would be another player's action.
- **Cap concurrency.** Fast folding rounds can queue several callouts; overlapping
  voice clips are worse than dropping some. Play at most one voice clip at a time
  and let the newest win.
