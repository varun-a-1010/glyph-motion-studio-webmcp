/**
 * Public timeline schema — deliberately NARROWER than the runtime type.
 * Everything an agent (or the step editor) submits passes through here.
 * Strings are only accepted where a strict grammar exists; there is no path
 * by which a function, selector, URL, or markup can reach GSAP.
 */
import { StudioError } from './errors';
import { resolveTargetIds } from '$lib/studio/targetResolver';
import type {
	AnimationTarget,
	ElementRegistry,
	StaggerConfig,
	TimelineDefaults,
	TimelineStep,
	TweenProperties,
	TweenType
} from '$lib/types';

export const LIMITS = {
	maxSteps: 24,
	maxTotalDuration: 12,
	maxTweenDuration: 8,
	maxOperations: 32,
	maxTranslate: 2000,
	maxScale: 10,
	maxRotation: 1080,
	maxSkew: 89,
	maxStagger: 4,
	maxStrokeWidth: 60,
	maxIntentLength: 200,
	maxLabelLength: 80,
	maxNameLength: 80,
	previewTtlMs: 10 * 60 * 1000,
	maxUndoDepth: 20,
	maxTargetRecords: 60,
	maxSceneElements: 12,
	maxVectorNodes: 60,
	maxVectorPoints: 64,
	maxPathLength: 4000,
	maxTextLength: 120,
	maxCanvasDimension: 2000
} as const;

export const ALLOWED_TWEEN_TYPES: readonly TweenType[] = ['from', 'to', 'fromTo', 'set', 'drawSVG'];
export const ALLOWED_ROLES = ['primary', 'secondary', 'accent', 'utility'] as const;
export const ALLOWED_TARGET_TYPES = ['id', 'role', 'group'] as const;
export const ALLOWED_STAGGER_FROM = ['start', 'center', 'end', 'random'] as const;
export const ALLOWED_SORT = [
	'dom-order',
	'x-position',
	'y-position',
	'distance-from-center'
] as const;

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const EASE_RE =
	/^(none|linear|power[1-4]|sine|expo|circ|quad|cubic|quart|quint|back|elastic|bounce)(\.(in|out|inOut))?(\(\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)?\s*\))?$/;
export const POSITION_RE = /^([<>])?([+-]=)?(\d+(\.\d+)?)?$/;
export const COLOR_RE =
	/^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
export const ORIGIN_RE =
	/^((-?\d+(\.\d+)?(px|%)?|left|center|right)\s+(-?\d+(\.\d+)?(px|%)?|top|center|bottom)|center)$/;
export const SVG_ORIGIN_RE = /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/;
export const DRAWSVG_RE = /^\d{1,3}(\.\d+)?%?(\s+\d{1,3}(\.\d+)?%?)?$/;

const NUMERIC_PROPS: Record<string, [number, number]> = {
	x: [-LIMITS.maxTranslate, LIMITS.maxTranslate],
	y: [-LIMITS.maxTranslate, LIMITS.maxTranslate],
	scale: [0, LIMITS.maxScale],
	scaleX: [0, LIMITS.maxScale],
	scaleY: [0, LIMITS.maxScale],
	rotation: [-LIMITS.maxRotation, LIMITS.maxRotation],
	skewX: [-LIMITS.maxSkew, LIMITS.maxSkew],
	skewY: [-LIMITS.maxSkew, LIMITS.maxSkew],
	opacity: [0, 1],
	strokeWidth: [0, LIMITS.maxStrokeWidth]
};

const STRING_PROPS: Record<string, RegExp> = {
	transformOrigin: ORIGIN_RE,
	svgOrigin: SVG_ORIGIN_RE,
	fill: COLOR_RE,
	stroke: COLOR_RE,
	drawSVG: DRAWSVG_RE
};

export const ALLOWED_PROPS = [
	...Object.keys(NUMERIC_PROPS),
	...Object.keys(STRING_PROPS),
	'fromProps'
];

// ─── Operations ──────────────────────────────────────────────

export interface StepChanges {
	label?: string;
	target?: AnimationTarget;
	tweenType?: TweenType;
	/** Shallow-merged into the step's props; `null` removes a property. */
	props?: Partial<Record<keyof TweenProperties, unknown>>;
	duration?: number;
	position?: number | string;
	ease?: string;
	stagger?: StaggerConfig | number | null;
	critical?: boolean;
}

export type TimelinePatchOperation =
	| { op: 'add_step'; step: TimelineStep; index?: number }
	| { op: 'update_step'; stepId: string; changes: StepChanges }
	| { op: 'remove_step'; stepId: string }
	| { op: 'reorder_steps'; stepIds: string[] }
	| { op: 'set_timeline'; totalDuration?: number; defaults?: Partial<TimelineDefaults> };

export interface ValidationContext {
	registry: ElementRegistry;
	elementIds: string[];
}

// ─── Helpers ─────────────────────────────────────────────────

function fail(
	code: 'INVALID_INPUT' | 'UNSUPPORTED_PROPERTY' | 'LIMIT_EXCEEDED' | 'TARGET_NOT_FOUND',
	path: string,
	message: string,
	details?: Record<string, unknown>
): never {
	throw new StudioError(code, `${path}: ${message}`, { path, ...details });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return (
		!!v &&
		typeof v === 'object' &&
		!Array.isArray(v) &&
		Object.getPrototypeOf(v) === Object.prototype
	);
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string) {
	for (const key of Object.keys(obj)) {
		if (!allowed.includes(key))
			fail('INVALID_INPUT', `${path}.${key}`, `unknown field "${key}"`, { allowed: [...allowed] });
	}
}

function finiteNumber(v: unknown, path: string, [min, max]: [number, number]): number {
	if (typeof v !== 'number' || !Number.isFinite(v))
		fail('INVALID_INPUT', path, 'must be a finite number');
	if (v < min || v > max)
		fail('LIMIT_EXCEEDED', path, `must be between ${min} and ${max}`, { min, max, value: v });
	return v;
}

function safeString(v: unknown, path: string, re: RegExp, maxLen = 200): string {
	if (typeof v !== 'string') fail('INVALID_INPUT', path, 'must be a string');
	if (v.length > maxLen) fail('LIMIT_EXCEEDED', path, `must be at most ${maxLen} characters`);
	if (!re.test(v))
		fail('INVALID_INPUT', path, `does not match the allowed grammar`, { pattern: re.source });
	return v;
}

/** Defensive walk: no functions, symbols, markup, URLs or protocol strings anywhere in a payload. */
export function assertNoScriptable(value: unknown, path = '$'): void {
	if (typeof value === 'function' || typeof value === 'symbol')
		fail('INVALID_INPUT', path, 'functions are not allowed');
	if (typeof value === 'string') {
		// Timeline positions deliberately use GSAP's bounded "<" / ">" grammar.
		// They are validated immediately afterward by validatePosition, so exempt
		// only that exact field instead of weakening the general markup fence.
		const isTimelinePosition =
			path.endsWith('.step.position') || path.endsWith('.changes.position');
		if (
			(!isTimelinePosition && /[<>]/.test(value)) ||
			/javascript:|url\(|expression\(|data:/i.test(value)
		)
			fail('INVALID_INPUT', path, 'markup, URLs and script-like strings are not allowed');
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((v, i) => assertNoScriptable(v, `${path}[${i}]`));
		return;
	}
	if (value && typeof value === 'object') {
		if (!isPlainObject(value)) fail('INVALID_INPUT', path, 'must be a plain object');
		for (const [k, v] of Object.entries(value)) assertNoScriptable(v, `${path}.${k}`);
	}
}

// ─── Field validators ────────────────────────────────────────

export function validateEase(v: unknown, path: string): string {
	return safeString(v, path, EASE_RE, 40);
}

export function validatePosition(v: unknown, path: string): number | string {
	if (typeof v === 'number') return finiteNumber(v, path, [0, LIMITS.maxTotalDuration]);
	if (typeof v !== 'string')
		fail('INVALID_INPUT', path, 'must be a number (seconds) or a relative position string');
	const trimmed = v.trim();
	const m = POSITION_RE.exec(trimmed);
	if (!m || trimmed === '')
		fail(
			'INVALID_INPUT',
			path,
			'allowed: seconds, "<", ">", "+=0.2", "-=0.2", "<0.2", "<+=0.2", ">-=0.2"'
		);
	const [, anchor, op, num] = m;
	if (num !== undefined) {
		const n = Number(num);
		if (n > LIMITS.maxTotalDuration)
			fail('LIMIT_EXCEEDED', path, `offset must be at most ${LIMITS.maxTotalDuration}s`);
		if (!anchor && !op) return n; // plain numeric string → absolute seconds
	} else if (op) {
		fail('INVALID_INPUT', path, 'relative offsets need a number, e.g. "+=0.2"');
	}
	return trimmed;
}

export function validateTarget(
	raw: unknown,
	path: string,
	ctx: ValidationContext
): AnimationTarget {
	if (!isPlainObject(raw))
		fail('INVALID_INPUT', path, 'must be an object { type, value, scopeToId? }');
	rejectUnknownKeys(raw, ['type', 'value', 'scopeToId'], path);
	const type = raw.type;
	if (!ALLOWED_TARGET_TYPES.includes(type as (typeof ALLOWED_TARGET_TYPES)[number]))
		fail(
			'INVALID_INPUT',
			`${path}.type`,
			`must be one of ${ALLOWED_TARGET_TYPES.join(', ')} (selectors are not supported)`
		);
	const value = safeString(raw.value, `${path}.value`, ID_RE, 64);
	if (type === 'role' && !ALLOWED_ROLES.includes(value as (typeof ALLOWED_ROLES)[number]))
		fail('INVALID_INPUT', `${path}.value`, `role must be one of ${ALLOWED_ROLES.join(', ')}`);

	let scopeToId: string | undefined;
	if (raw.scopeToId !== undefined) {
		scopeToId = safeString(raw.scopeToId, `${path}.scopeToId`, ID_RE, 64);
		if (!ctx.elementIds.includes(scopeToId))
			fail('TARGET_NOT_FOUND', `${path}.scopeToId`, `no scene element "${scopeToId}"`, {
				elementIds: ctx.elementIds
			});
	} else if (ctx.elementIds.length === 1) {
		scopeToId = ctx.elementIds[0];
	} else if (type !== 'role') {
		fail(
			'INVALID_INPUT',
			`${path}.scopeToId`,
			'required when the scene has more than one element',
			{ elementIds: ctx.elementIds }
		);
	}

	const target: AnimationTarget = {
		type: type as AnimationTarget['type'],
		value,
		...(scopeToId ? { scopeToId } : {})
	};
	const matches = resolveTargetIds(target, ctx.registry);
	if (matches.length === 0)
		fail(
			'TARGET_NOT_FOUND',
			path,
			`${type} "${value}" matches no elements — call inspect_animation_targets to list valid targets`,
			{
				target
			}
		);
	return target;
}

function validateProps(
	raw: unknown,
	path: string,
	tweenType: TweenType,
	allowFromProps: boolean
): TweenProperties {
	if (!isPlainObject(raw)) fail('INVALID_INPUT', path, 'must be an object of tween properties');
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (value === undefined) continue;
		if (key === 'fromProps') {
			if (!allowFromProps)
				fail(
					'INVALID_INPUT',
					`${path}.fromProps`,
					'only allowed at the top level of a fromTo step'
				);
			if (tweenType !== 'fromTo')
				fail('INVALID_INPUT', `${path}.fromProps`, 'only valid for tweenType "fromTo"');
			out.fromProps = validateProps(value, `${path}.fromProps`, tweenType, false);
			continue;
		}
		if (key in NUMERIC_PROPS) {
			out[key] = finiteNumber(value, `${path}.${key}`, NUMERIC_PROPS[key]);
			continue;
		}
		if (key in STRING_PROPS) {
			out[key] = safeString(value, `${path}.${key}`, STRING_PROPS[key], 64);
			continue;
		}
		fail('UNSUPPORTED_PROPERTY', `${path}.${key}`, `"${key}" is not an animatable property here`, {
			allowed: ALLOWED_PROPS
		});
	}
	return out as TweenProperties;
}

function validateStagger(raw: unknown, path: string): StaggerConfig | number {
	if (typeof raw === 'number') return finiteNumber(raw, path, [0, LIMITS.maxStagger]);
	if (!isPlainObject(raw))
		fail('INVALID_INPUT', path, 'must be a number of seconds or { amount, from?, ease?, sortBy? }');
	rejectUnknownKeys(raw, ['amount', 'from', 'ease', 'sortBy'], path);
	const out: StaggerConfig = {
		amount: finiteNumber(raw.amount, `${path}.amount`, [0, LIMITS.maxStagger])
	};
	if (raw.from !== undefined) {
		if (typeof raw.from === 'number') out.from = finiteNumber(raw.from, `${path}.from`, [0, 100]);
		else if (ALLOWED_STAGGER_FROM.includes(raw.from as (typeof ALLOWED_STAGGER_FROM)[number]))
			out.from = raw.from as StaggerConfig['from'];
		else
			fail(
				'INVALID_INPUT',
				`${path}.from`,
				`must be an index or one of ${ALLOWED_STAGGER_FROM.join(', ')}`
			);
	}
	if (raw.ease !== undefined) out.ease = validateEase(raw.ease, `${path}.ease`);
	if (raw.sortBy !== undefined) {
		if (!ALLOWED_SORT.includes(raw.sortBy as (typeof ALLOWED_SORT)[number]))
			fail('INVALID_INPUT', `${path}.sortBy`, `must be one of ${ALLOWED_SORT.join(', ')}`);
		out.sortBy = raw.sortBy as StaggerConfig['sortBy'];
	}
	return out;
}

const STEP_KEYS = [
	'id',
	'label',
	'target',
	'tweenType',
	'props',
	'duration',
	'position',
	'ease',
	'stagger',
	'critical'
] as const;

export function validateStep(raw: unknown, path: string, ctx: ValidationContext): TimelineStep {
	if (!isPlainObject(raw)) fail('INVALID_INPUT', path, 'must be a step object');
	rejectUnknownKeys(raw, STEP_KEYS, path);

	const id = safeString(raw.id, `${path}.id`, ID_RE, 64);
	const tweenType = raw.tweenType as TweenType;
	if (!ALLOWED_TWEEN_TYPES.includes(tweenType))
		fail('INVALID_INPUT', `${path}.tweenType`, `must be one of ${ALLOWED_TWEEN_TYPES.join(', ')}`);

	const target = validateTarget(raw.target, `${path}.target`, ctx);
	const props = validateProps(raw.props ?? {}, `${path}.props`, tweenType, true);
	const propKeys = Object.keys(props).filter((k) => k !== 'fromProps');
	if (tweenType !== 'drawSVG' && propKeys.length === 0)
		fail('INVALID_INPUT', `${path}.props`, 'at least one property is required');
	if (tweenType === 'fromTo' && (!props.fromProps || Object.keys(props.fromProps).length === 0))
		fail(
			'INVALID_INPUT',
			`${path}.props.fromProps`,
			'fromTo needs starting values in props.fromProps'
		);

	const duration = finiteNumber(raw.duration ?? 0, `${path}.duration`, [
		0,
		LIMITS.maxTweenDuration
	]);
	if (tweenType !== 'set' && duration <= 0)
		fail('INVALID_INPUT', `${path}.duration`, 'must be greater than 0');

	const step: TimelineStep = {
		id,
		target,
		tweenType,
		props,
		duration,
		position: validatePosition(raw.position ?? 0, `${path}.position`)
	};
	if (raw.label !== undefined)
		step.label = safeString(raw.label, `${path}.label`, /^[^<>]*$/, LIMITS.maxLabelLength);
	if (raw.ease !== undefined) step.ease = validateEase(raw.ease, `${path}.ease`);
	if (raw.stagger !== undefined && raw.stagger !== null)
		step.stagger = validateStagger(raw.stagger, `${path}.stagger`);
	if (raw.critical !== undefined) {
		if (typeof raw.critical !== 'boolean')
			fail('INVALID_INPUT', `${path}.critical`, 'must be a boolean');
		step.critical = raw.critical;
	}
	return step;
}

export function validateStepChanges(
	raw: unknown,
	path: string,
	ctx: ValidationContext
): StepChanges {
	if (!isPlainObject(raw))
		fail('INVALID_INPUT', path, 'must be an object of step fields to change');
	rejectUnknownKeys(
		raw,
		[
			'label',
			'target',
			'tweenType',
			'props',
			'duration',
			'position',
			'ease',
			'stagger',
			'critical'
		],
		path
	);
	const out: StepChanges = {};
	if (raw.label !== undefined)
		out.label = safeString(raw.label, `${path}.label`, /^[^<>]*$/, LIMITS.maxLabelLength);
	if (raw.target !== undefined) out.target = validateTarget(raw.target, `${path}.target`, ctx);
	if (raw.tweenType !== undefined) {
		if (!ALLOWED_TWEEN_TYPES.includes(raw.tweenType as TweenType))
			fail(
				'INVALID_INPUT',
				`${path}.tweenType`,
				`must be one of ${ALLOWED_TWEEN_TYPES.join(', ')}`
			);
		out.tweenType = raw.tweenType as TweenType;
	}
	if (raw.props !== undefined) {
		if (!isPlainObject(raw.props)) fail('INVALID_INPUT', `${path}.props`, 'must be an object');
		const merged: Record<string, unknown> = {};
		const nonNull: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(raw.props)) {
			if (v === null) merged[k] = null;
			else nonNull[k] = v;
		}
		const validated = validateProps(
			nonNull,
			`${path}.props`,
			(out.tweenType ?? 'fromTo') as TweenType,
			true
		);
		out.props = { ...merged, ...validated } as StepChanges['props'];
	}
	if (raw.duration !== undefined)
		out.duration = finiteNumber(raw.duration, `${path}.duration`, [0, LIMITS.maxTweenDuration]);
	if (raw.position !== undefined) out.position = validatePosition(raw.position, `${path}.position`);
	if (raw.ease !== undefined) out.ease = validateEase(raw.ease, `${path}.ease`);
	if (raw.stagger !== undefined)
		out.stagger = raw.stagger === null ? null : validateStagger(raw.stagger, `${path}.stagger`);
	if (raw.critical !== undefined) {
		if (typeof raw.critical !== 'boolean')
			fail('INVALID_INPUT', `${path}.critical`, 'must be a boolean');
		out.critical = raw.critical;
	}
	return out;
}

export function validateOperations(raw: unknown, ctx: ValidationContext): TimelinePatchOperation[] {
	assertNoScriptable(raw, 'operations');
	if (!Array.isArray(raw) || raw.length === 0)
		fail('INVALID_INPUT', 'operations', 'must be a non-empty array');
	if (raw.length > LIMITS.maxOperations)
		fail('LIMIT_EXCEEDED', 'operations', `at most ${LIMITS.maxOperations} operations per patch`);

	return raw.map((item, i) => {
		const path = `operations[${i}]`;
		if (!isPlainObject(item)) fail('INVALID_INPUT', path, 'must be an object');
		switch (item.op) {
			case 'add_step': {
				rejectUnknownKeys(item, ['op', 'step', 'index'], path);
				const step = validateStep(item.step, `${path}.step`, ctx);
				const op: TimelinePatchOperation = { op: 'add_step', step };
				if (item.index !== undefined) {
					const index = finiteNumber(item.index, `${path}.index`, [0, LIMITS.maxSteps]);
					if (!Number.isInteger(index))
						fail('INVALID_INPUT', `${path}.index`, 'must be an integer');
					op.index = index;
				}
				return op;
			}
			case 'update_step': {
				rejectUnknownKeys(item, ['op', 'stepId', 'changes'], path);
				return {
					op: 'update_step',
					stepId: safeString(item.stepId, `${path}.stepId`, ID_RE, 64),
					changes: validateStepChanges(item.changes, `${path}.changes`, ctx)
				};
			}
			case 'remove_step': {
				rejectUnknownKeys(item, ['op', 'stepId'], path);
				return { op: 'remove_step', stepId: safeString(item.stepId, `${path}.stepId`, ID_RE, 64) };
			}
			case 'reorder_steps': {
				rejectUnknownKeys(item, ['op', 'stepIds'], path);
				if (!Array.isArray(item.stepIds))
					fail('INVALID_INPUT', `${path}.stepIds`, 'must be an array of step ids');
				return {
					op: 'reorder_steps',
					stepIds: item.stepIds.map((s, j) => safeString(s, `${path}.stepIds[${j}]`, ID_RE, 64))
				};
			}
			case 'set_timeline': {
				rejectUnknownKeys(item, ['op', 'totalDuration', 'defaults'], path);
				const op: TimelinePatchOperation = { op: 'set_timeline' };
				if (item.totalDuration !== undefined)
					op.totalDuration = finiteNumber(item.totalDuration, `${path}.totalDuration`, [
						0.1,
						LIMITS.maxTotalDuration
					]);
				if (item.defaults !== undefined) {
					if (!isPlainObject(item.defaults))
						fail('INVALID_INPUT', `${path}.defaults`, 'must be an object');
					rejectUnknownKeys(item.defaults, ['ease', 'duration'], `${path}.defaults`);
					op.defaults = {};
					if (item.defaults.ease !== undefined)
						op.defaults.ease = validateEase(item.defaults.ease, `${path}.defaults.ease`);
					if (item.defaults.duration !== undefined)
						op.defaults.duration = finiteNumber(
							item.defaults.duration,
							`${path}.defaults.duration`,
							[0.01, LIMITS.maxTweenDuration]
						);
				}
				return op;
			}
			default:
				return fail(
					'INVALID_INPUT',
					`${path}.op`,
					'must be one of add_step, update_step, remove_step, reorder_steps, set_timeline'
				);
		}
	});
}

export function validateIntent(raw: unknown): string {
	if (raw === undefined || raw === null) return '';
	if (typeof raw !== 'string') fail('INVALID_INPUT', 'intent', 'must be a string');
	if (raw.length > LIMITS.maxIntentLength)
		fail('LIMIT_EXCEEDED', 'intent', `at most ${LIMITS.maxIntentLength} characters`);
	if (/[<>]/.test(raw)) fail('INVALID_INPUT', 'intent', 'markup is not allowed');
	return raw.trim();
}

export function validateRevision(raw: unknown, path = 'baseRevision'): number {
	if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0)
		fail('INVALID_INPUT', path, 'must be a non-negative integer revision from get_scene');
	return raw;
}
