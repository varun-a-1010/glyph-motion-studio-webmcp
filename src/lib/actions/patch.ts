/**
 * Pure timeline patching + a GSAP-free duration estimator. No DOM, no GSAP —
 * fully unit-testable.
 */
import { StudioError } from './errors';
import { LIMITS, type TimelinePatchOperation } from './schema';
import { resolveTargetIds } from '$lib/studio/targetResolver';
import type { ElementRegistry, StepTiming, TimelineDefinition, TimelineStep } from '$lib/types';

export interface PatchResult {
	timeline: TimelineDefinition;
	affectedStepIds: string[];
}

export function applyOperations(
	timeline: TimelineDefinition,
	ops: TimelinePatchOperation[]
): PatchResult {
	let steps = timeline.steps.map((s) => structuredClone(s));
	let totalDuration = timeline.totalDuration;
	let defaults = { ...timeline.defaults };
	const affected = new Set<string>();

	const findIndex = (stepId: string) => {
		const idx = steps.findIndex((s) => s.id === stepId);
		if (idx === -1)
			throw new StudioError('STEP_NOT_FOUND', `no step with id "${stepId}"`, {
				stepId,
				stepIds: steps.map((s) => s.id)
			});
		return idx;
	};

	for (const op of ops) {
		switch (op.op) {
			case 'add_step': {
				if (steps.some((s) => s.id === op.step.id))
					throw new StudioError(
						'INVALID_INPUT',
						`step id "${op.step.id}" already exists — use update_step or pick a unique id`,
						{ stepId: op.step.id }
					);
				const index = op.index === undefined ? steps.length : Math.min(op.index, steps.length);
				steps.splice(index, 0, op.step);
				affected.add(op.step.id);
				break;
			}
			case 'update_step': {
				const idx = findIndex(op.stepId);
				const current = steps[idx];
				const { props: propChanges, stagger, ...rest } = op.changes;
				const next: TimelineStep = { ...current, ...(rest as Partial<TimelineStep>) };
				if (propChanges) {
					const mergedProps: Record<string, unknown> = { ...current.props };
					for (const [k, v] of Object.entries(propChanges)) {
						if (v === null) delete mergedProps[k];
						else mergedProps[k] = v;
					}
					next.props = mergedProps as TimelineStep['props'];
				}
				if (stagger === null) delete next.stagger;
				else if (stagger !== undefined) next.stagger = stagger;
				if (
					op.changes.tweenType !== undefined &&
					next.tweenType !== 'fromTo' &&
					next.props.fromProps
				) {
					const { fromProps: _drop, ...restProps } = next.props;
					next.props = restProps;
				}
				steps[idx] = next;
				affected.add(op.stepId);
				break;
			}
			case 'remove_step': {
				const idx = findIndex(op.stepId);
				steps.splice(idx, 1);
				affected.add(op.stepId);
				break;
			}
			case 'reorder_steps': {
				const existing = steps.map((s) => s.id);
				const wanted = op.stepIds;
				if (
					wanted.length !== existing.length ||
					new Set(wanted).size !== wanted.length ||
					!wanted.every((id) => existing.includes(id))
				)
					throw new StudioError(
						'INVALID_INPUT',
						'reorder_steps.stepIds must be a permutation of every existing step id',
						{
							existing,
							received: wanted
						}
					);
				const byId = new Map(steps.map((s) => [s.id, s]));
				steps = wanted.map((id) => byId.get(id)!);
				wanted.forEach((id, i) => {
					if (existing[i] !== id) affected.add(id);
				});
				break;
			}
			case 'set_timeline': {
				if (op.totalDuration !== undefined) totalDuration = op.totalDuration;
				if (op.defaults) defaults = { ...defaults, ...op.defaults };
				break;
			}
		}
	}

	const next: TimelineDefinition = { totalDuration, defaults, steps };
	assertTimelineLimits(next);
	return { timeline: next, affectedStepIds: [...affected] };
}

/**
 * GSAP `from()` captures its destination when the timeline is built. Two
 * `from` steps that write the same property on the same element therefore
 * make the later step capture the earlier step's temporary start value. The
 * result can finish invisible or transformed. Reject that ambiguous shape and
 * direct callers to update the existing entrance or use an explicit fromTo.
 */
export function assertNoConflictingFromTweens(
	timeline: TimelineDefinition,
	registry: ElementRegistry
): void {
	const claimed = new Map<string, string>();
	for (const step of timeline.steps) {
		if (step.tweenType !== 'from') continue;
		const properties = Object.keys(step.props).filter(
			(property) => !['fromProps', 'transformOrigin', 'svgOrigin'].includes(property)
		);
		for (const targetId of resolveTargetIds(step.target, registry)) {
			for (const property of properties) {
				const key = `${targetId}\u0000${property}`;
				const earlierStepId = claimed.get(key);
				if (earlierStepId) {
					throw new StudioError(
						'INVALID_INPUT',
						`steps "${earlierStepId}" and "${step.id}" both use from() for ${property} on ${targetId}; update the existing entrance or use fromTo for later motion`,
						{ earlierStepId, stepId: step.id, targetId, property }
					);
				}
				claimed.set(key, step.id);
			}
		}
	}
}

export function assertTimelineLimits(timeline: TimelineDefinition): void {
	if (timeline.steps.length > LIMITS.maxSteps)
		throw new StudioError(
			'LIMIT_EXCEEDED',
			`timeline has ${timeline.steps.length} steps; the maximum is ${LIMITS.maxSteps}`,
			{
				max: LIMITS.maxSteps
			}
		);
	const ids = timeline.steps.map((s) => s.id);
	if (new Set(ids).size !== ids.length)
		throw new StudioError('INVALID_INPUT', 'step ids must be unique', { ids });
	const { totalDuration } = estimateTimeline(timeline);
	if (totalDuration > LIMITS.maxTotalDuration)
		throw new StudioError(
			'LIMIT_EXCEEDED',
			`timeline runs ${totalDuration.toFixed(2)}s; the maximum is ${LIMITS.maxTotalDuration}s`,
			{
				max: LIMITS.maxTotalDuration,
				estimated: totalDuration
			}
		);
	if (timeline.totalDuration > LIMITS.maxTotalDuration)
		throw new StudioError(
			'LIMIT_EXCEEDED',
			`totalDuration must be at most ${LIMITS.maxTotalDuration}s`,
			{ max: LIMITS.maxTotalDuration }
		);
}

/**
 * Mirrors GSAP's position-parameter semantics closely enough for validation
 * and track layout before the real build runs.
 */
export function estimateTimeline(timeline: TimelineDefinition): {
	totalDuration: number;
	timings: StepTiming[];
} {
	let cursor = 0;
	let prevStart = 0;
	let prevEnd = 0;
	const timings: StepTiming[] = [];

	for (const step of timeline.steps) {
		const staggerAmount =
			typeof step.stagger === 'number' ? step.stagger : (step.stagger?.amount ?? 0);
		const length = step.duration + staggerAmount;
		let start: number;
		const pos = step.position;
		if (typeof pos === 'number') start = pos;
		else {
			const m = /^([<>])?([+-]=)?(\d+(\.\d+)?)?$/.exec(pos.trim());
			const anchor = m?.[1];
			const op = m?.[2];
			const n = m?.[3] !== undefined ? Number(m[3]) : 0;
			const base = anchor === '<' ? prevStart : anchor === '>' ? prevEnd : cursor;
			start = op === '-=' ? base - n : base + n;
		}
		start = Math.max(0, start);
		const end = start + length;
		timings.push({ stepId: step.id, start, duration: length });
		prevStart = start;
		prevEnd = end;
		cursor = Math.max(cursor, end);
	}

	return { totalDuration: Math.max(cursor, 0), timings };
}
