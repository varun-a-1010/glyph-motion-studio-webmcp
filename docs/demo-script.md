# Demo script (under three minutes)

Start on **Motion Playground** and reset it so the canvas is blank.

## 0:00–0:20 — Product and problem

Show the blank Studio and the visible timeline, target list and activity panel.

> "Building a vector composition and then coordinating its motion across dozens of properties is slow manual work. Glyph lets me bring my own browser agent into the editor as a visual motion-design collaborator."

## 0:20–0:35 — WebMCP discovery

Click the header chip: **WebMCP · 10 site tools**. No chatbot or model is embedded in the page; the editor works without an agent.

## 0:35–1:15 — Compose through WebMCP

Paste to the browser agent:

> Using only Glyph's WebMCP tools, create a compact radar interface from vector primitives. Add three range rings, crosshair axes, a sweep arm with its pivot at the radar centre, three targets grouped as contacts, a warning label and a status indicator. Use a restrained cyan, violet and amber palette on the dark canvas. Preview the composition only—do not apply or save it.

Expected: `get_scene` → `inspect_vector_scene` → `preview_scene_patch`. The radar appears with a PREVIEW banner while the committed project remains blank. The Agent activity panel logs each call. Approve it, then ask: "Apply that composition, but do not save it."

## 1:15–1:55 — Choreograph through WebMCP

> Animate the radar into a coherent detection sequence. Draw the range rings first, rotate the sweep arm around its exact centre, reveal the three contacts as the sweep reaches them, then show the warning and final status. Avoid bounce, finish within four seconds, and preview only.

Expected: `inspect_animation_targets` sees the newly created semantic nodes and pivots, then `preview_timeline_patch` creates the GSAP sequence. Steps appear on the track and the preview autoplays.

Approve and apply it. The revision counter ticks up after each accepted preview. The work is still unsaved.

## 1:55–2:20 — Control and safety

- Press **Undo** once to restore the previous timeline, and again to return to the blank composition.
- Click a step block, open the **Step editor** tab, nudge a duration by hand — the agent's work is ordinary editable data.
- Mention that raw SVG, selectors, callbacks and URLs are rejected; creation accepts only bounded structured vector operations.

## 2:20–2:45 — Complex choreography

Switch to **Space Mission** and play the prepared WebMCP-authored sequence: planet establishment, rocket launch, stage separation, payload handoff, satellite deployment and communications lock.

> "The same tools scale from a blank geometric composition to a 24-step sequence coordinating four independent SVG assets."

## 2:45–2:58 — Why WebMCP

> "The browser agent used typed tools against the live vector scene and semantic target registry. Glyph kept validation, preview approval, rendering, undo and saving. No generated code ran—the page compiled structured scene and timeline data through its trusted SVG and GSAP runtimes."

Close on the public URL and repository.

## Useful follow-up prompts

- "Make the accents converge from the outside in, one after another."
- "Draw the underline rule in from left to right after the tagline lands."
- "Create a status badge from a rounded rectangle, text and a pulse dot, then add it to this scene."
- "Undo that and show me the previous version."
- "What can you build here?" (should call `inspect_vector_scene`)
- "What can you animate here?" (should call `inspect_animation_targets`)
