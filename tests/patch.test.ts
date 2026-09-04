import { describe, expect, it } from 'vitest';
import {
	applyOperations,
	assertNoConflictingFromTweens,
	estimateTimeline
} from '../src/lib/actions/patch';
import { StudioError } from '../src/lib/actions/errors';
import glyphHero from '../src/lib/samples/glyph-hero';
import { namespaceArtwork } from '../src/lib/studio/namespacing';
import type { TimelineDefinition, TimelineStep } from '../src/lib/types';

const step = (id: string, extra: Partial<TimelineStep> = {}): TimelineStep => ({
	id,
	target: { type: 'id', value: 'symbol', scopeToId: 'hero' },
	tweenType: 'from',
	props: { opacity: 0 },
	duration: 0.5,
	position: 0,
	...extra
});

const base: TimelineDefinition = {
	totalDuration: 1,
	defaults: { ease: 'power2.out', duration: 0.5 },
	steps: [step('a'), step('b', { position: '>' })]
};

describe('applyOperations', () => {
	it('is pure and preserves step order/ids on update', () => {
		const { timeline, affectedStepIds } = applyOperations(base, [
			{
				op: 'update_step',
				stepId: 'a',
				changes: { duration: 0.9, props: { opacity: null, scale: 0.5 } }
			}
		]);
		expect(base.steps[0].duration).toBe(0.5);
		expect(timeline.steps.map((s) => s.id)).toEqual(['a', 'b']);
		expect(timeline.steps[0].duration).toBe(0.9);
		expect(timeline.steps[0].props).toEqual({ scale: 0.5 });
		expect(affectedStepIds).toEqual(['a']);
	});

	it('adds, removes and reorders', () => {
		const r1 = applyOperations(base, [{ op: 'add_step', step: step('c'), index: 0 }]);
		expect(r1.timeline.steps.map((s) => s.id)).toEqual(['c', 'a', 'b']);
		const r2 = applyOperations(r1.timeline, [{ op: 'reorder_steps', stepIds: ['b', 'a', 'c'] }]);
		expect(r2.timeline.steps.map((s) => s.id)).toEqual(['b', 'a', 'c']);
		const r3 = applyOperations(r2.timeline, [{ op: 'remove_step', stepId: 'a' }]);
		expect(r3.timeline.steps.map((s) => s.id)).toEqual(['b', 'c']);
	});

	it('rejects duplicate ids, unknown steps and bad permutations', () => {
		expect(() => applyOperations(base, [{ op: 'add_step', step: step('a') }])).toThrow(StudioError);
		expect(() => applyOperations(base, [{ op: 'remove_step', stepId: 'zzz' }])).toThrowError(
			/no step/
		);
		expect(() => applyOperations(base, [{ op: 'reorder_steps', stepIds: ['a'] }])).toThrowError(
			/permutation/
		);
	});

	it('enforces step count and total duration limits', () => {
		const ops = Array.from({ length: 23 }, (_, i) => ({
			op: 'add_step' as const,
			step: step(`s${i}`)
		}));
		expect(() => applyOperations(base, ops)).toThrowError(/steps/);
		expect(() =>
			applyOperations(base, [{ op: 'add_step', step: step('long', { position: 10, duration: 5 }) }])
		).toThrowError(/maximum is 12s/);
	});
});

describe('from tween safety', () => {
	it('rejects a second from tween for the same target property', () => {
		const { registry } = namespaceArtwork(glyphHero.svg, glyphHero.registry, 'hero');
		const timeline: TimelineDefinition = {
			totalDuration: 1,
			defaults: { ease: 'power2.out', duration: 0.5 },
			steps: [
				step('first', { target: { type: 'id', value: 'symbol', scopeToId: 'hero' } }),
				step('second', {
					target: { type: 'id', value: 'symbol', scopeToId: 'hero' },
					position: '>'
				})
			]
		};

		expect(() => assertNoConflictingFromTweens(timeline, registry)).toThrowError(
			/update the existing entrance or use fromTo/
		);
	});

	it('allows from tweens on different properties or targets', () => {
		const { registry } = namespaceArtwork(glyphHero.svg, glyphHero.registry, 'hero');
		const timeline: TimelineDefinition = {
			totalDuration: 1,
			defaults: { ease: 'power2.out', duration: 0.5 },
			steps: [
				step('symbol-opacity', {
					target: { type: 'id', value: 'symbol', scopeToId: 'hero' }
				}),
				step('symbol-scale', {
					target: { type: 'id', value: 'symbol', scopeToId: 'hero' },
					props: { scale: 0.8 }
				}),
				step('wordmark-opacity', {
					target: { type: 'id', value: 'wordmark', scopeToId: 'hero' }
				})
			]
		};

		expect(() => assertNoConflictingFromTweens(timeline, registry)).not.toThrow();
	});
});

describe('estimateTimeline', () => {
	it('mirrors GSAP position semantics', () => {
		const tl: TimelineDefinition = {
			totalDuration: 0,
			defaults: { ease: 'none', duration: 1 },
			steps: [
				step('a', { position: 0, duration: 1 }),
				step('b', { position: '>', duration: 0.5 }),
				step('c', { position: '<', duration: 0.2 }),
				step('d', { position: '+=0.3', duration: 0.4 }),
				step('e', { position: '<0.1', duration: 0.1, stagger: { amount: 0.5 } })
			]
		};
		const { timings, totalDuration } = estimateTimeline(tl);
		const at = Object.fromEntries(timings.map((t) => [t.stepId, t.start]));
		expect(at.a).toBe(0);
		expect(at.b).toBe(1);
		expect(at.c).toBe(1);
		expect(at.d).toBeCloseTo(1.8);
		expect(at.e).toBeCloseTo(1.9);
		expect(totalDuration).toBeCloseTo(2.5);
	});
});
