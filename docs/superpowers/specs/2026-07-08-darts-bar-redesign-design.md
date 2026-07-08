# Darts Bar Redesign Design

## Goal

Turn the current app into a darts throwing game with a polished bar atmosphere. The first screen should be the playable darts experience, not a marketing splash. Remove unused flight-game concepts from the visible UI and runtime surface: plane, altitude, hull, clouds, obstacles, balloons, flight distance, and flight mode labels.

The current flight starts should be replaced by darts starts. The final visible game set for this rewrite is:

- Practice
- 501
- Cricket
- Around the Clock

No visible start button should remain for Flying Practice, Shooting Gallery, or Obstacle Course.

## Visual Direction

Use the approved Option A direction: a pub dartboard lane with wood trim, brick or dark wall texture, tungsten board lighting, an oche line, and a prominent chalkboard sidebar. The chalkboard should be the authoritative scoring surface, not a decorative stats card.

The sidebar should look like a bar chalkboard:

- Dark green chalkboard surface with wood frame.
- Chalk texture, imperfect handwritten-looking marks, and rubbed-out dust.
- Two persistent player columns, left and right.
- A center rubric column that changes by game.
- No sci-fi HUD styling, glass panels, flight meters, or aviation terminology.

## Layout

Desktop layout:

- Main play area fills the left side with the dartboard centered on a pub wall.
- Chalkboard sidebar sits on the right and remains visible during play.
- Top-level game controls live on or near the chalkboard as compact chalk tabs or buttons.
- Any active hand/camera status should be subdued and secondary, so the score surface stays dominant.

Mobile layout:

- Dartboard remains first and playable.
- Chalkboard moves below the board or becomes a full-width panel.
- Text and controls must fit without overlap at narrow widths.

## Game Scoring Surfaces

All games use a two-player chalkboard format with stable left and right player columns.

Cricket:

- Center rows: `20`, `19`, `18`, `17`, `16`, `15`, `BULL`.
- Left and right columns show chalk marks for each player.
- Marks should use pub scoring progression: first mark `/`, second mark `X`, third mark circled/closed.
- Secondary notes may show last throw and suggested target.

501:

- Left and right columns show remaining score for each player.
- Center rows show round/visit labels or checkout notes.
- Show last visit as dart values such as `T20 20 D10`.
- Enforce darts-style score presentation, including bust feedback.

Around the Clock:

- Center rows show the target sequence from `1` through `20`, then `BULL`.
- Left and right columns show progress marks or completed targets for each player.
- Current target should be clear without replacing the two-column chalkboard convention.

Practice:

- Center rows show recent throw labels or ring/segment summaries.
- Left column is the current practice session.
- Right column is the saved best/session benchmark when available, otherwise a blank chalk column labeled `Best`.
- Keep it useful for aiming without becoming a debug panel.

## Interaction Model

Hand tracking remains the primary input concept, but the visible framing should become darts-specific:

- Hand aim controls the dart aim/cursor.
- First-pass throw release uses the existing fire intent: hand fire gesture if available, plus Space/click fallback.
- Keyboard/mouse fallback exists for testing and accessibility.
- Camera/debug views are allowed only as secondary developer/practice aids.

The game should provide immediate feedback after a throw:

- Dart impact on board.
- Scored segment.
- Last three darts or current visit.
- Chalkboard update.
- Bar-appropriate audio feedback.

## Architecture

Keep the existing Vite/TypeScript/Babylon stack. Rename or replace user-facing concepts and remove unused flight surfaces from active imports and visible UI.

Recommended modules:

- `game/dartsScoring.ts`: pure scoring for 501, Cricket, Around the Clock, and Practice.
- `game/dartsState.ts`: game state, player turns, visits, throw history, and mode transitions.
- `render/scene.ts`: pub wall, dartboard, dart flight/impact visuals.
- `main.ts`: DOM wiring, mode selection, input integration, and chalkboard rendering.
- `styles.css`: bar visual system, responsive layout, chalkboard typography, and controls.

Pure scoring logic should not depend on Babylon, DOM, MediaPipe, or audio.

## Data Flow

1. Input layer produces aim and throw intent.
2. Throw resolver maps a throw to a board segment.
3. Scoring module applies the segment result to the active game.
4. Main loop updates render state and chalkboard DOM.
5. Audio reacts to scoring events.

The chalkboard DOM should derive from state, not maintain its own independent scoring data.

## Error Handling

- If camera permission or tracking fails, show a concise bar-compatible fallback message and keep keyboard/mouse controls available.
- If a throw is invalid for the current game, show the outcome as darts language such as `Bust`, `No score`, or `Already closed`.
- If persisted best/session data is unavailable, continue without blocking play.

## Testing

Add focused tests before implementation for scoring behavior:

- 501 subtracts valid scores, busts correctly, and switches turns after visits.
- Cricket marks 20-15 and bull correctly for both players.
- Around the Clock advances targets only on valid hits.
- Practice records recent throws and does not use competitive scoring.
- State text/render hooks expose darts terms and no flight terms.

After implementation, verify:

- `npm test`
- `npm run build`
- Browser smoke check for initial render and each game mode.
- Responsive visual check for desktop and mobile widths.

## Out Of Scope

- Online multiplayer.
- Real computer-vision dart physics beyond hand-gesture throw intent.
- Full tournament management.
- Reusing flight-game UI labels or assets as visible app concepts.
