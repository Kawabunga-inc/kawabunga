# B4 scene canvas On Air QA

Visual verdict: the implementation matches Paper artboard `1T0-0` in hierarchy,
Ocean color treatment, live state language, and stage placement. The existing
floating authoring tray/inspector remain in place, so the live HUD is inset to
the unobstructed center lane and wraps its top row at narrower viewports.

## Zero-active regression

The same 968 × 672 editor viewport was captured from merged `dev` at `5ac4634`
and from the B4 branch with no active sessions. The captures are byte-identical:

```text
79f82f5c6c17ae5394af8cd95f6b2c2b7cf7f24594a919790b20b7349d9e3f08  b4-zero-active-before.jpg
79f82f5c6c17ae5394af8cd95f6b2c2b7cf7f24594a919790b20b7349d9e3f08  b4-zero-active-after.jpg
```

- [Before B4](./b4-zero-active-before.jpg)
- [After B4](./b4-zero-active-after.jpg)

The animated admin-agent button was outside the editor clip; it is shared
chrome and produces nondeterministic pixels unrelated to the scene editor.

## Live sequence

The run began through the real scene sandbox for Abraham's tent (Abraham,
Sarah, ambience bed, and one-shot sound). The sandbox-created session produced
the production decision event and streaming turn. Deterministic QA rows were
then appended through the existing session store to exercise each overlay
state without changing the overlay or adding a fixture endpoint.

1. [Abraham speaking + ambience + SFX + caption](./b4-on-air-speaking.jpg) —
   concentric rings, `SPEAKING · TURN 1`, current bed, attached fire-pit cue,
   beat, arc progress, and event age. Sarah was placed while live; the exact
   future-sessions save note remained visible and the overlay continued.
2. [Speaking handoff to Sarah](./b4-on-air-sarah.jpg) — Sarah receives the
   speaking state while Abraham changes to `last spoke turn 1`.
3. [Narrator + departed presence](./b4-on-air-narrator-departed.jpg) — narrator
   indicator replaces character speaking rings; Sarah greys out with the
   `departed` hint and the arc reaches 2/2.
4. [Two-session picker](./b4-multi-session-picker.jpg) — two concurrent scene
   sessions appear in the header. Selecting each option changed the monitored
   beat and speaker only to that session's A2 live feed.
5. [Ended / plain authoring](./b4-ended-plain-authoring.jpg) — after the last
   session ended, all On Air chrome and the future-sessions note disappeared.
   The temporary Sarah placement was restored to its original authored value.

Lifecycle was also checked with two active sessions: ending the selected one
removed it from the picker and automatically selected the remaining live
session; ending the remaining session removed the overlay entirely.
