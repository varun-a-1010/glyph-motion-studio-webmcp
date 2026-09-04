/**
 * The ten WebMCP site tools. Each one:
 *   1. rejects unknown top-level fields,
 *   2. delegates to the SAME action layer the human UI uses (which validates
 *      with the public schema and updates the visible editor before resolving),
 *   3. returns a compact plain object — never raw SVG, DOM, storage keys or stacks.
 */
import { toErrorPayload, StudioError } from '$lib/actions/errors';
import {
	LIMITS,
	ALLOWED_TWEEN_TYPES,
	ALLOWED_ROLES,
	EASE_RE,
	POSITION_RE,
	ID_RE,
	COLOR_RE
} from '$lib/actions/schema';
import {
	applyTimelinePatch,
	applyScenePatch,
	getSceneSnapshot,
	inspectTargets,
	inspectVectorScene,
	previewScenePatch,
	previewTimelinePatch,
	saveScene,
	switchScene,
	undoLastTimelineChange
} from '$lib/actions/sceneActions';
import { logActivity, updateActivity } from '$lib/studio/stores/activity';
import { SAMPLE_SCENES } from '$lib/samples';

type ToolResult = Record<string, unknown>;

function ok(result: Record<string, unknown>): ToolResult {
	return { ok: true, ...result };
}

function fail(err: unknown): ToolResult {
	return { ok: false, error: toErrorPayload(err) };
}

function rejectUnknown(input: unknown, allowed: string[]): Record<string, unknown> {
	if (input === undefined || input === null) return {};
	if (typeof input !== 'object' || Array.isArray(input))
		throw new StudioError('INVALID_INPUT', 'input must be an object');
	for (const key of Object.keys(input as Record<string, unknown>)) {
		if (!allowed.includes(key))
			throw new StudioError('INVALID_INPUT', `unknown field "${key}"`, { allowed });
	}
	return input as Record<string, unknown>;
}

function checkAbort(signal?: AbortSignal) {
	if (signal?.aborted) throw new StudioError('ABORTED', 'the tool call was cancelled');
}

// ─── JSON schema fragments (what the agent reads) ────────────

const targetSchema = {
	type: 'object',
	description:
		'Semantic target. type "id" = one element by its id; "group" = every member of a semantic group (e.g. "accents"); "role" = every element with that role. No CSS selectors.',
	properties: {
		type: { type: 'string', enum: ['id', 'role', 'group'] },
		value: {
			type: 'string',
			pattern: ID_RE.source,
			description: 'Element id, group id, or one of: ' + ALLOWED_ROLES.join(', ')
		},
		scopeToId: {
			type: 'string',
			pattern: ID_RE.source,
			description: 'Scene element id the target lives in. Optional when the scene has one element.'
		}
	},
	required: ['type', 'value'],
	additionalProperties: false
} as const;

const numberProp = (min: number, max: number, description: string) => ({
	type: 'number',
	minimum: min,
	maximum: max,
	description
});

const vectorPointSchema = {
	type: 'object',
	properties: {
		x: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, 'SVG x coordinate'),
		y: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, 'SVG y coordinate')
	},
	required: ['x', 'y'],
	additionalProperties: false
} as const;

const vectorNodeProperties = {
	id: { type: 'string', pattern: ID_RE.source, description: 'Stable semantic node id' },
	name: { type: 'string', maxLength: LIMITS.maxNameLength },
	label: {
		type: 'string',
		maxLength: LIMITS.maxLabelLength,
		description: 'Agent-facing description; mention the hinge when the node rotates'
	},
	primitive: {
		type: 'string',
		enum: ['circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'path', 'text']
	},
	role: { type: 'string', enum: [...ALLOWED_ROLES] },
	group: { type: 'string', pattern: ID_RE.source },
	position: vectorPointSchema,
	scale: numberProp(0.01, LIMITS.maxScale, 'Static node scale'),
	rotation: numberProp(-LIMITS.maxRotation, LIMITS.maxRotation, 'Static rotation in degrees'),
	opacity: numberProp(0, 1, ''),
	fill: {
		type: 'string',
		pattern: `^(none|${COLOR_RE.source.slice(1, -1)})$`,
		description: 'none, hex, rgb(), or rgba()'
	},
	stroke: {
		type: 'string',
		pattern: `^(none|${COLOR_RE.source.slice(1, -1)})$`,
		description: 'none, hex, rgb(), or rgba()'
	},
	strokeWidth: numberProp(0, LIMITS.maxStrokeWidth, ''),
	pivot: {
		...vectorPointSchema,
		description: 'Exact local SVG-coordinate hinge or rotation centre'
	},
	cx: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	cy: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	radius: numberProp(0.1, LIMITS.maxCanvasDimension, ''),
	x: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	y: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	width: numberProp(0.1, LIMITS.maxCanvasDimension, ''),
	height: numberProp(0.1, LIMITS.maxCanvasDimension, ''),
	rx: numberProp(0, LIMITS.maxCanvasDimension, ''),
	ry: numberProp(0, LIMITS.maxCanvasDimension, ''),
	x1: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	y1: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	x2: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	y2: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, ''),
	points: {
		type: 'array',
		minItems: 2,
		maxItems: LIMITS.maxVectorPoints,
		items: vectorPointSchema
	},
	d: {
		type: 'string',
		maxLength: LIMITS.maxPathLength,
		description: 'Plain SVG path data only; no markup, CSS, URLs, or scripts'
	},
	text: { type: 'string', maxLength: LIMITS.maxTextLength },
	fontSize: numberProp(6, 240, ''),
	fontWeight: { type: 'integer', minimum: 100, maximum: 900 },
	textAnchor: { type: 'string', enum: ['start', 'middle', 'end'] }
} as const;

const vectorNodeSchema = {
	type: 'object',
	description:
		'A validated vector primitive. Coordinates are local to the owning vector layer; optional pivot is returned to animation-target inspection.',
	properties: vectorNodeProperties,
	required: ['id', 'primitive'],
	oneOf: [
		{ properties: { primitive: { const: 'circle' } }, required: ['cx', 'cy', 'radius'] },
		{ properties: { primitive: { const: 'rect' } }, required: ['x', 'y', 'width', 'height'] },
		{ properties: { primitive: { const: 'ellipse' } }, required: ['cx', 'cy', 'rx', 'ry'] },
		{ properties: { primitive: { const: 'line' } }, required: ['x1', 'y1', 'x2', 'y2'] },
		{ properties: { primitive: { const: 'polygon' } }, required: ['points'] },
		{ properties: { primitive: { const: 'polyline' } }, required: ['points'] },
		{ properties: { primitive: { const: 'path' } }, required: ['d'] },
		{ properties: { primitive: { const: 'text' } }, required: ['x', 'y', 'text'] }
	],
	additionalProperties: false
} as const;

const sceneElementPlacement = {
	id: { type: 'string', pattern: ID_RE.source },
	name: { type: 'string', maxLength: LIMITS.maxNameLength },
	position: vectorPointSchema,
	scale: numberProp(0.01, LIMITS.maxScale, ''),
	rotation: numberProp(-LIMITS.maxRotation, LIMITS.maxRotation, 'Degrees'),
	opacity: numberProp(0, 1, ''),
	order: { type: 'integer', minimum: -100, maximum: 100 },
	visible: { type: 'boolean' },
	locked: { type: 'boolean' }
} as const;

const scenePatchOperationSchema = {
	description: 'One reversible composition operation.',
	oneOf: [
		{
			type: 'object',
			properties: {
				op: { const: 'add_vector_layer' },
				element: {
					type: 'object',
					properties: {
						...sceneElementPlacement,
						width: numberProp(1, LIMITS.maxCanvasDimension, 'Local SVG width'),
						height: numberProp(1, LIMITS.maxCanvasDimension, 'Local SVG height')
					},
					required: ['id'],
					additionalProperties: false
				}
			},
			required: ['op', 'element'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'add_asset' },
				element: {
					type: 'object',
					properties: {
						...sceneElementPlacement,
						artworkKey: {
							type: 'string',
							pattern: ID_RE.source,
							description: 'Bundled key returned by inspect_vector_scene'
						}
					},
					required: ['id', 'artworkKey'],
					additionalProperties: false
				}
			},
			required: ['op', 'element'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'add_node' },
				elementId: { type: 'string', pattern: ID_RE.source },
				node: vectorNodeSchema
			},
			required: ['op', 'elementId', 'node'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'update_node' },
				elementId: { type: 'string', pattern: ID_RE.source },
				nodeId: { type: 'string', pattern: ID_RE.source },
				changes: {
					type: 'object',
					properties: Object.fromEntries(
						Object.entries(vectorNodeProperties).filter(
							([key]) => key !== 'id' && key !== 'primitive'
						)
					),
					minProperties: 1,
					additionalProperties: false
				}
			},
			required: ['op', 'elementId', 'nodeId', 'changes'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'duplicate_node' },
				elementId: { type: 'string', pattern: ID_RE.source },
				nodeId: { type: 'string', pattern: ID_RE.source },
				newId: { type: 'string', pattern: ID_RE.source },
				name: { type: 'string', maxLength: LIMITS.maxNameLength },
				label: { type: 'string', maxLength: LIMITS.maxLabelLength },
				offset: vectorPointSchema
			},
			required: ['op', 'elementId', 'nodeId', 'newId'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'remove_node' },
				elementId: { type: 'string', pattern: ID_RE.source },
				nodeId: { type: 'string', pattern: ID_RE.source }
			},
			required: ['op', 'elementId', 'nodeId'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'set_semantics' },
				elementId: { type: 'string', pattern: ID_RE.source },
				nodeIds: {
					type: 'array',
					minItems: 1,
					maxItems: LIMITS.maxVectorNodes,
					items: { type: 'string', pattern: ID_RE.source }
				},
				role: { type: 'string', enum: [...ALLOWED_ROLES] },
				group: { type: 'string', pattern: ID_RE.source }
			},
			required: ['op', 'elementId', 'nodeIds'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'update_element' },
				elementId: { type: 'string', pattern: ID_RE.source },
				changes: {
					type: 'object',
					properties: Object.fromEntries(
						Object.entries(sceneElementPlacement).filter(([key]) => key !== 'id')
					),
					minProperties: 1,
					additionalProperties: false
				}
			},
			required: ['op', 'elementId', 'changes'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'remove_element' },
				elementId: { type: 'string', pattern: ID_RE.source }
			},
			required: ['op', 'elementId'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'set_scene' },
				name: { type: 'string', maxLength: LIMITS.maxNameLength },
				backgroundColor: {
					type: 'string',
					pattern: COLOR_RE.source,
					description: 'Hex, rgb(), or rgba()'
				}
			},
			required: ['op'],
			additionalProperties: false
		}
	]
} as const;

const tweenPropsCore = {
	x: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, 'Horizontal offset in SVG units'),
	y: numberProp(-LIMITS.maxTranslate, LIMITS.maxTranslate, 'Vertical offset in SVG units'),
	scale: numberProp(0, LIMITS.maxScale, 'Uniform scale (1 = natural size)'),
	scaleX: numberProp(0, LIMITS.maxScale, ''),
	scaleY: numberProp(0, LIMITS.maxScale, ''),
	rotation: numberProp(-LIMITS.maxRotation, LIMITS.maxRotation, 'Degrees'),
	skewX: numberProp(-LIMITS.maxSkew, LIMITS.maxSkew, ''),
	skewY: numberProp(-LIMITS.maxSkew, LIMITS.maxSkew, ''),
	opacity: numberProp(0, 1, ''),
	strokeWidth: numberProp(0, LIMITS.maxStrokeWidth, ''),
	transformOrigin: { type: 'string', description: 'e.g. "50% 50%", "center", "left top"' },
	svgOrigin: {
		type: 'string',
		description:
			'Absolute SVG-coordinate pivot, e.g. "130 130" (use for orbit/rotation around a point)'
	},
	fill: { type: 'string', description: 'Hex or rgb() colour' },
	stroke: { type: 'string', description: 'Hex or rgb() colour' },
	drawSVG: { type: 'string', description: 'For drawSVG steps: start value, e.g. "0%" or "50% 50%"' }
} as const;

const tweenPropsSchema = {
	type: 'object',
	description:
		'Animated values. For "from": the starting values (animates TO the natural state). For "to": the end values. For "fromTo": end values here plus starting values in fromProps.',
	properties: {
		...tweenPropsCore,
		fromProps: {
			type: 'object',
			description: 'Starting values (fromTo only)',
			properties: tweenPropsCore,
			additionalProperties: false
		}
	},
	additionalProperties: false
} as const;

const staggerSchema = {
	description:
		'Seconds between each target when the target matches several elements, or a config object.',
	oneOf: [
		{ type: 'number', minimum: 0, maximum: LIMITS.maxStagger },
		{
			type: 'object',
			properties: {
				amount: {
					type: 'number',
					minimum: 0,
					maximum: LIMITS.maxStagger,
					description: 'Total seconds spread across all targets'
				},
				from: {
					description: '"start" | "center" | "end" | "random" | index',
					oneOf: [
						{ type: 'string', enum: ['start', 'center', 'end', 'random'] },
						{ type: 'number', minimum: 0 }
					]
				},
				ease: { type: 'string', pattern: EASE_RE.source },
				sortBy: {
					type: 'string',
					enum: ['dom-order', 'x-position', 'y-position', 'distance-from-center'],
					description:
						'Spatial order for the stagger (e.g. distance-from-center to guide the eye inward)'
				}
			},
			required: ['amount'],
			additionalProperties: false
		}
	]
} as const;

const stepSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			pattern: ID_RE.source,
			description: 'Unique, stable, human-readable id, e.g. "symbol-enter"'
		},
		label: { type: 'string', maxLength: LIMITS.maxLabelLength },
		target: targetSchema,
		tweenType: {
			type: 'string',
			enum: [...ALLOWED_TWEEN_TYPES],
			description: '"from" is the usual choice for entrances.'
		},
		props: tweenPropsSchema,
		duration: {
			type: 'number',
			minimum: 0,
			maximum: LIMITS.maxTweenDuration,
			description: 'Seconds per target'
		},
		position: {
			description: `Start time: absolute seconds (number), or relative string: "<" (with previous step), ">" (after previous), "+=0.2"/"-=0.2" (relative to timeline end), "<0.15" (0.15s after previous start). Pattern ${POSITION_RE.source}`,
			oneOf: [
				{ type: 'number', minimum: 0, maximum: LIMITS.maxTotalDuration },
				{ type: 'string', pattern: POSITION_RE.source }
			]
		},
		ease: {
			type: 'string',
			pattern: EASE_RE.source,
			description:
				'GSAP ease name: power1-4.out|in|inOut, sine, expo, circ, back.out(1.4), elastic.out(1,0.4), bounce.out, none'
		},
		stagger: staggerSchema,
		critical: {
			type: 'boolean',
			description: 'If true, an unresolved target rejects the whole preview'
		}
	},
	required: ['id', 'target', 'tweenType', 'props', 'duration', 'position'],
	additionalProperties: false
} as const;

const operationSchema = {
	description: 'One domain operation on the timeline.',
	oneOf: [
		{
			type: 'object',
			properties: {
				op: { const: 'add_step' },
				step: stepSchema,
				index: { type: 'integer', minimum: 0, description: 'Insert position (default: append)' }
			},
			required: ['op', 'step'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'update_step' },
				stepId: { type: 'string', pattern: ID_RE.source },
				changes: {
					type: 'object',
					description:
						'Only the fields to change. props are shallow-merged; set a prop to null to remove it. stagger: null removes the stagger.',
					properties: {
						label: stepSchema.properties.label,
						target: targetSchema,
						tweenType: stepSchema.properties.tweenType,
						props: {
							type: 'object',
							properties: tweenPropsSchema.properties,
							additionalProperties: false
						},
						duration: stepSchema.properties.duration,
						position: stepSchema.properties.position,
						ease: stepSchema.properties.ease,
						stagger: { oneOf: [{ type: 'null' }, ...staggerSchema.oneOf] },
						critical: stepSchema.properties.critical
					},
					additionalProperties: false
				}
			},
			required: ['op', 'stepId', 'changes'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'remove_step' },
				stepId: { type: 'string', pattern: ID_RE.source }
			},
			required: ['op', 'stepId'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'reorder_steps' },
				stepIds: {
					type: 'array',
					items: { type: 'string' },
					description: 'Every existing step id, in the new order'
				}
			},
			required: ['op', 'stepIds'],
			additionalProperties: false
		},
		{
			type: 'object',
			properties: {
				op: { const: 'set_timeline' },
				totalDuration: {
					type: 'number',
					minimum: 0.1,
					maximum: LIMITS.maxTotalDuration,
					description:
						'Declared timeline length in seconds (the track extends automatically if steps run longer)'
				},
				defaults: {
					type: 'object',
					properties: {
						ease: { type: 'string', pattern: EASE_RE.source },
						duration: { type: 'number', minimum: 0.01, maximum: LIMITS.maxTweenDuration }
					},
					additionalProperties: false
				}
			},
			required: ['op'],
			additionalProperties: false
		}
	]
} as const;

// ─── Tools ───────────────────────────────────────────────────

export function buildStudioTools(): WebMCP.ModelContextTool[] {
	return [
		{
			name: 'get_scene',
			title: 'Get scene',
			description:
				'Read the open Glyph Motion Studio composition: available bundled scenes, scene elements, the current declarative GSAP timeline (steps, targets, timing, eases), the monotonic sceneRevision you must echo back in mutations, reduced-motion policy, staged preview, save state, limits, and the last render diagnostics. Read-only. Call this first, and again after any human edit or REVISION_CONFLICT.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			annotations: { readOnlyHint: true },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					rejectUnknown(input, []);
					const id = logActivity({
						source: 'agent',
						action: 'get_scene',
						purpose: 'Read scene and timeline',
						status: 'started'
					});
					const snapshot = getSceneSnapshot();
					updateActivity(id, {
						status: 'succeeded',
						message: `revision ${snapshot.sceneRevision}, ${snapshot.timeline.steps.length} steps`
					});
					return ok(snapshot as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'switch_scene',
			title: 'Switch scene',
			description:
				"Switch the visible editor to one of the bundled scenes listed by get_scene. Revision-checked. Refuses when the current scene has an unapplied preview or unsaved changes unless discardCurrentChanges:true is supplied; use that flag only when the user explicitly approved abandoning the current work. Loads the target scene's local saved project when present, otherwise its bundled baseline. Never deletes a saved project.",
			inputSchema: {
				type: 'object',
				properties: {
					sceneId: {
						type: 'string',
						enum: SAMPLE_SCENES.map((sample) => sample.id),
						description: 'Bundled scene id returned in get_scene.availableScenes'
					},
					baseRevision: {
						type: 'integer',
						minimum: 0,
						description: 'sceneRevision from get_scene'
					},
					discardCurrentChanges: {
						type: 'boolean',
						description:
							'Explicitly abandon the current unapplied preview or unsaved edits. Omit or false when the current scene is clean.'
					}
				},
				required: ['sceneId', 'baseRevision'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['sceneId', 'baseRevision', 'discardCurrentChanges']);
					const result = await switchScene(
						{
							sceneId: args.sceneId,
							baseRevision: args.baseRevision,
							discardCurrentChanges: args.discardCurrentChanges
						},
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'inspect_animation_targets',
			title: 'Inspect animation targets',
			description:
				'Discover what can be animated: every semantic target (id / role / group) in the scene with its label, role, group, primitive type, owning element, approximate bounds (for spatial ordering and stagger decisions), and supported tween types. Read-only. Use the returned target objects verbatim in preview_timeline_patch. Optional filters: scopeToId, role, group.',
			inputSchema: {
				type: 'object',
				properties: {
					scopeToId: {
						type: 'string',
						pattern: ID_RE.source,
						description: 'Only targets inside this scene element'
					},
					role: { type: 'string', enum: [...ALLOWED_ROLES] },
					group: {
						type: 'string',
						pattern: ID_RE.source,
						description: 'Only members of this group id'
					}
				},
				additionalProperties: false
			},
			annotations: { readOnlyHint: true },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['scopeToId', 'role', 'group']);
					for (const k of ['scopeToId', 'role', 'group'] as const) {
						if (
							args[k] !== undefined &&
							(typeof args[k] !== 'string' || !ID_RE.test(args[k] as string))
						)
							throw new StudioError('INVALID_INPUT', `${k}: must be a plain identifier`);
					}
					const id = logActivity({
						source: 'agent',
						action: 'inspect_animation_targets',
						purpose: 'Discover animatable targets',
						status: 'started'
					});
					const result = inspectTargets(
						args as { scopeToId?: string; role?: string; group?: string }
					);
					updateActivity(id, {
						status: 'succeeded',
						message: `${result.totalTargets} targets, ${result.groups.length} groups, ${result.roles.length} roles`
					});
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'inspect_vector_scene',
			title: 'Inspect vector scene',
			description:
				'Read editable vector layers node-by-node plus the safe bundled asset catalog. Returns geometry, styling, semantic roles, groups and pivots as structured data—never raw SVG. Call before preview_scene_patch and again after applying a composition change.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			annotations: { readOnlyHint: true },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					rejectUnknown(input, []);
					const id = logActivity({
						source: 'agent',
						action: 'inspect_vector_scene',
						purpose: 'Inspect editable composition and asset catalog',
						status: 'started'
					});
					const result = inspectVectorScene();
					const nodeCount = result.vectorLayers.reduce(
						(count, layer) => count + layer.nodes.length,
						0
					);
					updateActivity(id, {
						status: 'succeeded',
						message: `${result.vectorLayers.length} vector layer${result.vectorLayers.length === 1 ? '' : 's'}, ${nodeCount} node${nodeCount === 1 ? '' : 's'}, ${result.availableAssets.length} bundled assets`
					});
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'preview_scene_patch',
			title: 'Preview vector scene patch',
			description:
				'Create or revise the vector composition through typed operations: add a vector layer, add validated primitives/text, insert bundled assets, update or duplicate nodes, assign semantic groups and pivots, transform layers, remove items, or restyle the scene. Stages an ephemeral visible preview only; the committed scene remains unchanged. Requires baseRevision from get_scene.',
			inputSchema: {
				type: 'object',
				properties: {
					baseRevision: {
						type: 'integer',
						minimum: 0,
						description: 'sceneRevision from get_scene'
					},
					intent: {
						type: 'string',
						maxLength: LIMITS.maxIntentLength,
						description: 'One short user-facing sentence describing the composition goal'
					},
					operations: {
						type: 'array',
						minItems: 1,
						maxItems: LIMITS.maxOperations,
						items: scenePatchOperationSchema
					}
				},
				required: ['baseRevision', 'operations'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['baseRevision', 'intent', 'operations']);
					const result = await previewScenePatch(
						{
							baseRevision: args.baseRevision,
							intent: args.intent,
							operations: args.operations
						},
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'apply_scene_patch',
			title: 'Apply vector scene patch',
			description:
				'Accept an unexpired composition preview into the editable scene. The preview is single-use and revision-bound. Adds a full-scene undo checkpoint but does not persist locally; inspect the resulting animation targets before constructing a timeline, and call save_scene only when the user asks.',
			inputSchema: {
				type: 'object',
				properties: {
					previewId: {
						type: 'string',
						description: 'previewId returned by preview_scene_patch'
					},
					baseRevision: {
						type: 'integer',
						minimum: 0,
						description: 'The revision the composition preview was staged against'
					}
				},
				required: ['previewId', 'baseRevision'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['previewId', 'baseRevision']);
					const result = await applyScenePatch(
						{ previewId: args.previewId, baseRevision: args.baseRevision },
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'preview_timeline_patch',
			title: 'Preview timeline patch',
			description:
				'Validate a set of timeline operations, stage them as an ephemeral preview, render it on the visible canvas (autoplays unless reduced motion is on), and return diagnostics. Does NOT change the committed scene — the user judges the motion first. Requires baseRevision from get_scene (REVISION_CONFLICT if the scene moved). Prefer small targeted patches (update_step) over rebuilding everything. Do not stack multiple from tweens on the same target property: update the existing entrance or use fromTo for later motion. Limits: 24 steps, 12s total, 8s per tween. Then call apply_timeline_patch with the returned previewId to keep it.',
			inputSchema: {
				type: 'object',
				properties: {
					baseRevision: {
						type: 'integer',
						minimum: 0,
						description: 'sceneRevision from get_scene'
					},
					intent: {
						type: 'string',
						maxLength: LIMITS.maxIntentLength,
						description:
							'One short user-facing sentence describing the creative goal (shown in the activity log)'
					},
					operations: {
						type: 'array',
						minItems: 1,
						maxItems: LIMITS.maxOperations,
						items: operationSchema
					},
					autoplay: { type: 'boolean', description: 'Play the preview immediately (default true)' }
				},
				required: ['baseRevision', 'operations'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['baseRevision', 'intent', 'operations', 'autoplay']);
					const result = await previewTimelinePatch(
						{
							baseRevision: args.baseRevision,
							intent: args.intent,
							operations: args.operations,
							autoplay: args.autoplay
						},
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'apply_timeline_patch',
			title: 'Apply timeline patch',
			description:
				'Accept a staged preview into the editable scene. The preview must be unexpired, still staged, and bound to the current revision (pass the same baseRevision). Adds an undo checkpoint, rebuilds and replays the timeline, and returns the new sceneRevision. The change is NOT yet persisted — call save_scene when the user asks to save.',
			inputSchema: {
				type: 'object',
				properties: {
					previewId: {
						type: 'string',
						description: 'previewId returned by preview_timeline_patch'
					},
					baseRevision: {
						type: 'integer',
						minimum: 0,
						description: 'The revision the preview was staged against'
					}
				},
				required: ['previewId', 'baseRevision'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['previewId', 'baseRevision']);
					const result = await applyTimelinePatch(
						{ previewId: args.previewId, baseRevision: args.baseRevision },
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'undo_last_timeline_change',
			title: 'Undo last applied change',
			description:
				'Revert the most recently applied timeline or composition change in this page session (agent or human). Discards any staged preview first and restores the exact previous scene. Returns the restored revision. Refuses with NOTHING_TO_UNDO when history is empty.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					rejectUnknown(input, []);
					const result = await undoLastTimelineChange('agent');
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		},
		{
			name: 'save_scene',
			title: 'Save scene',
			description:
				"Persist the current committed scene to the user's local browser storage. Explicit and revision-checked: pass sceneRevision from get_scene (or the revision returned by apply); REVISION_CONFLICT if the scene changed since. Fails while a preview is staged but not applied. Only call when the user asks to save.",
			inputSchema: {
				type: 'object',
				properties: {
					sceneRevision: { type: 'integer', minimum: 0 },
					name: {
						type: 'string',
						maxLength: LIMITS.maxNameLength,
						description: 'Optional new project name'
					}
				},
				required: ['sceneRevision'],
				additionalProperties: false
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
			execute: async (input, { signal }: WebMCP.ExecuteOptions = {}) => {
				try {
					checkAbort(signal);
					const args = rejectUnknown(input, ['sceneRevision', 'name']);
					const result = await saveScene(
						{ sceneRevision: args.sceneRevision, name: args.name },
						'agent'
					);
					return ok(result as unknown as Record<string, unknown>);
				} catch (err) {
					return fail(err);
				}
			}
		}
	];
}

export const STUDIO_TOOL_NAMES = [
	'get_scene',
	'switch_scene',
	'inspect_animation_targets',
	'inspect_vector_scene',
	'preview_scene_patch',
	'apply_scene_patch',
	'preview_timeline_patch',
	'apply_timeline_patch',
	'undo_last_timeline_change',
	'save_scene'
] as const;
