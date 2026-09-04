# Glyph Motion Studio for WebMCP

**Direct motion in natural language. Keep every keyframe under your control.**

**Live studio:** [glyph-motion.slate-app.online](https://glyph-motion.slate-app.online)

Glyph Motion Studio is a visual GSAP editor that lets **your own browser agent** compose and animate vector scenes through [WebMCP](https://github.com/webmachinelearning/webmcp). The page registers ten typed site tools. The agent can safely switch among bundled workspaces, build a scene from primitives and bundled artwork, assign semantic roles and pivots, inspect animation targets ("the symbol", "all accents", "the wordmark"), and stage a validated GSAP timeline on the canvas you are looking at. The page keeps preview approval, validation, rendering, undo, reduced motion and saving. **No arbitrary generated code or markup is ever executed.**

Extracted from a larger private Glyph Studio codebase as a small, self-contained public build.

## What the demo shows

1. Open the Studio. The Glyph lockup has a deliberately plain entrance: everything fades in at once.
2. Tell your browser agent:

   > Inspect this scene and give it a premium entrance. Let the symbol lead, reveal the wordmark afterward, use the accents to guide the eye inward, avoid excessive bounce, keep the complete entrance under 1.8 seconds, and preserve a calm reduced-motion experience. Preview the result but do not save it.

   The agent calls `get_scene` → `inspect_animation_targets` → `preview_timeline_patch`. The steps appear on the timeline track, the preview plays, and the **Agent activity** panel logs each call.

3. Judge it, then say:

   > The structure is good, but the ending feels too bouncy. Make the settle quieter, speed up the wordmark slightly, and let the highlight pulse once after everything lands.

   The agent patches only the relevant steps (`update_step`), previews again, and applies with `apply_timeline_patch` when you approve. Ask it to save, and it calls `save_scene`.

4. Undo, edit any step by hand, replay, save. It is still your editor.

### Create and animate a scene from scratch

Choose **Motion Playground**. It begins as a blank, editable vector layer rather than a canned illustration. Tell the browser agent:

> Using only Glyph's WebMCP tools, create a compact radar interface from vector primitives. Add three range rings, crosshair axes, a sweep arm with its pivot at the radar centre, three targets grouped as contacts, a warning label and a status indicator. Use a restrained cyan, violet and amber palette on the dark canvas. Preview the composition only—do not apply it yet.

The agent calls `get_scene` → `inspect_vector_scene` → `preview_scene_patch`. The composition appears without changing the committed project. After you approve and apply it, the newly created nodes immediately become semantic animation targets. A second prompt can choreograph the sweep, stagger the contacts and reveal the status through the same timeline tools used by the bundled scenes.

### Try the multi-SVG mission

Choose **Space Mission** from the sample menu. It combines four original, independently scoped SVGs: a ringed planet, a communications satellite, a staged launch vehicle and a transparent mission plot. The rocket exposes detachable boosters, stages, payload fairings and a stowed satellite; the plot exposes flight paths, a ground station, uplink and completion status. Their repeated internal ids are safely namespaced, while all 59 semantic parts remain available in one bounded agent inspection.

> Using only Glyph's WebMCP tools, choreograph a complete orbital-deployment mission. Establish the planet and flight path, ignite and launch the rocket, separate both boosters and payload fairings, drop the core stage, reveal the payload, then bring the communications satellite into orbit and deploy both solar arrays. Turn the ground dish toward it, draw the uplink, and reveal the mission status only after contact. Coordinate all four SVGs, keep the staging readable, finish within 8 seconds, and preview only—do not apply or save it.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # schema / patch / action-layer unit tests
pnpm check        # svelte-check
pnpm build        # static build in ./build
```

Node 20+. No backend, no accounts, no API keys: projects save to the browser's local storage.

Pushes to `main` are verified and deployed as an atomic static release to the live studio. Nginx serves the generated `build/` directory directly; no application process runs on the server.

### Let an agent in

The editor works in any browser. To expose the tools to an agent, open it in a WebMCP-capable environment:

- **Chrome 149+** (Canary/Dev): enable `chrome://flags/#enable-webmcp-testing`, reload, then DevTools → Application → **WebMCP** lists the ten tools and lets you invoke them by hand. Chrome's in-browser agent can call them.
- **ChatGPT desktop** built-in browser on a supported model.
- Any client that polyfills `document.modelContext` / `navigator.modelContext`.

The header chip reports registration status. Tools register only from the top-level document, never from an iframe.

## The ten site tools

| Tool                        | Kind                 | What it does                                                                                                                                                                                                                                         |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_scene`                 | read-only            | Scene, elements, current declarative timeline, `sceneRevision`, reduced-motion policy, staged preview, save state, limits, last render diagnostics. No SVG or DOM is returned.                                                                       |
| `switch_scene`              | mutating             | Revision-checked switch among the bundled workspaces. Refuses to abandon a preview or unsaved edits unless the user explicitly authorizes it; never deletes the target scene's saved project.                                                        |
| `inspect_animation_targets` | read-only            | Every semantic target (`id` / `group` / `role`) with label, role, group, primitive type, owning element, approximate bounds, supported tween types. Filters: `scopeToId`, `role`, `group`. Capped and counted.                                       |
| `inspect_vector_scene`      | read-only            | Editable vector nodes with geometry, styling, semantic roles, groups and pivots, plus the safe bundled-asset catalog. Structured data only—never raw SVG.                                                                                            |
| `preview_scene_patch`       | mutating, ephemeral  | Validates composition operations for vector layers, primitives, text, bundled assets, transforms and semantics; renders a visible preview while leaving the committed project untouched.                                                             |
| `apply_scene_patch`         | mutating             | Accepts an unexpired, single-use composition preview bound to the current revision. Adds a full-scene undo checkpoint and exposes the new nodes as animation targets.                                                                                |
| `preview_timeline_patch`    | mutating, ephemeral  | Validates domain operations (`add_step`, `update_step`, `remove_step`, `reorder_steps`, `set_timeline`) against `baseRevision`, stages a preview, renders and autoplays it, returns diagnostics and a `previewId`. The committed scene is untouched. |
| `apply_timeline_patch`      | mutating             | Accepts an unexpired, single-use preview bound to the current revision. Adds an undo checkpoint, replays, returns the new revision. Not persisted yet.                                                                                               |
| `undo_last_timeline_change` | mutating             | Restores the exact scene before the last applied composition or timeline change.                                                                                                                                                                     |
| `save_scene`                | mutating, persistent | Revision-checked explicit save to local browser storage.                                                                                                                                                                                             |

Every mutation updates the visible editor **before** the tool call resolves. Errors come back as structured `{ ok: false, error: { code, message, details } }` with stable codes: `INVALID_INPUT`, `REVISION_CONFLICT`, `TARGET_NOT_FOUND`, `STEP_NOT_FOUND`, `UNSUPPORTED_PROPERTY`, `LIMIT_EXCEEDED`, `PREVIEW_PENDING`, `UNSAVED_CHANGES`, `PREVIEW_EXPIRED`, `PREVIEW_ALREADY_USED`, `PREVIEW_NOT_FOUND`, `NOTHING_TO_UNDO`, `BUSY`, `ABORTED`. Never a stack trace.

### A vector node, as the agent writes it

```json
{
	"op": "add_node",
	"elementId": "playground",
	"node": {
		"id": "radar-sweep",
		"name": "Radar sweep",
		"label": "Radar sweep arm; pivot is the display centre",
		"primitive": "line",
		"role": "primary",
		"group": "radar",
		"x1": 640,
		"y1": 360,
		"x2": 640,
		"y2": 175,
		"stroke": "#38bdf8",
		"strokeWidth": 4,
		"pivot": { "x": 640, "y": 360 }
	}
}
```

### A timeline step, as the agent writes it

```json
{
	"op": "add_step",
	"step": {
		"id": "accents-converge",
		"label": "Accents guide the eye inward",
		"target": { "type": "group", "value": "accents", "scopeToId": "hero" },
		"tweenType": "from",
		"props": { "opacity": 0, "scale": 0.4, "transformOrigin": "50% 50%" },
		"duration": 0.5,
		"position": "<0.15",
		"ease": "power3.out",
		"stagger": { "amount": 0.3, "from": "end", "sortBy": "distance-from-center" }
	}
}
```

## Security model

The public schemas are deliberately **narrower** than the internal scene and timeline types:

- Targets are semantic only: `id`, `role`, `group`. No CSS selectors.
- Tween types: `from`, `to`, `fromTo`, `set`, `drawSVG`. (`morphSVG` / `motionPath` are not exposed.)
- Allowlisted properties with numeric bounds; eases, positions, colours and origins must match strict grammars.
- Limits: 24 steps, 12 s total, 8 s per tween, 32 operations per patch. Finite numbers only. Unknown fields are rejected everywhere.
- Composition accepts only eight primitive types, bounded coordinates, strict colours, plain path data and escaped text. Agent-created nodes are capped at 60 discoverable targets. Bundled assets are referenced by allowlisted keys.
- No functions, callbacks, URLs, markup, arbitrary CSS or raw SVG can reach the runtime. A deterministic vector renderer produces SVG; the trusted timeline builder is the only module that calls GSAP.
- Every preview/apply/save carries `baseRevision`; a human edit in between yields `REVISION_CONFLICT` rather than a silent overwrite. Previews expire and are single-use. One mutation runs at a time.
- Reduced motion (`prefers-reduced-motion`) is enforced by the page: previews render their final state instead of autoplaying, and no tool input can disable it.
- Tool results never contain raw SVG, DOM, storage keys, or exception stacks.

Human edits go through the **same** validated action layer as the tools (`src/lib/actions/sceneActions.ts`), so there is one source of truth.

## Architecture

```
Human controls ─┐                                  ┌─> vector renderer ─┐
                ├─> validated scene actions ─> scene store              ├─> SVG canvas
WebMCP tools ───┘   (src/lib/actions)          (stores/scene.ts)         │
                                                    └─> timeline builder ┴─> GSAP
                                               │
                                               ├─> bounded undo history
                                               ├─> local persistence (localStorage)
                                               └─> visible activity log
```

```
src/lib/
  types.ts                 scene / timeline / registry contracts
  samples/                 bundled artwork and scene baselines
  studio/                  trusted vector renderer, GSAP runtime, target resolver, namespacing and stores
  actions/                 vector/timeline patch engines, schemas, history, persistence and scene actions
  webmcp/                  the ten tool definitions + registration
  components/              StudioLayout, SceneCanvas, TimelineTrack, StepEditor, PropertiesPanel, ActivityPanel, WebMcpChip
tests/                     vitest: schema, patch, sceneActions
```

Provider integrations, accounts, cloud persistence, export and collaboration are intentionally out of scope. The studio does not run an embedded model: the user's browser agent authors bounded scene and timeline data through WebMCP.

## Limitations

- Local-first: projects live in this browser only.
- The public composition API builds from controlled primitives and bundled assets; arbitrary raw-SVG import is not exposed to agents.
- `morphSVG` and `motionPath` authoring are not exposed to agents.
- Browser support for WebMCP is still an origin trial; the chip tells you what it found.

## License

MIT for this repository's code and original sample artwork, including the four Space Mission SVGs. GSAP is bundled as an npm dependency under its own [license](https://gsap.com/community/standard-license/).
