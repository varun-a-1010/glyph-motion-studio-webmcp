import { describe, expect, it } from 'vitest';
import {
	validateOperations,
	validatePosition,
	validateEase,
	LIMITS
} from '../src/lib/actions/schema';
import { StudioError } from '../src/lib/actions/errors';
import glyphHero from '../src/lib/samples/glyph-hero';
import { namespaceArtwork } from '../src/lib/studio/namespacing';

const { registry } = namespaceArtwork(glyphHero.svg, glyphHero.registry, 'hero');
const ctx = { registry, elementIds: ['hero'] };

const goodStep = {
	id: 'symbol-enter',
	target: { type: 'id', value: 'symbol' },
	tweenType: 'from',
	props: { opacity: 0, scale: 0.8, transformOrigin: '50% 50%' },
	duration: 0.6,
	position: 0,
	ease: 'power3.out'
};

function code(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		if (e instanceof StudioError) return e.code;
		throw e;
	}
	return 'OK';
}

describe('public schema', () => {
	it('accepts a valid add_step and fills scopeToId for a single-element scene', () => {
		const ops = validateOperations([{ op: 'add_step', step: goodStep }], ctx);
		expect(ops).toHaveLength(1);
		expect(ops[0].op === 'add_step' && ops[0].step.target.scopeToId).toBe('hero');
	});

	it('rejects unknown fields anywhere', () => {
		expect(
			code(() =>
				validateOperations([{ op: 'add_step', step: { ...goodStep, onComplete: 'x' } }], ctx)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() => validateOperations([{ op: 'add_step', step: goodStep, extra: 1 }], ctx))
		).toBe('INVALID_INPUT');
	});

	it('rejects selectors, functions and script-like strings', () => {
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, target: { type: 'selector', value: 'svg *' } } }],
					ctx
				)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, props: { opacity: () => 1 } } }],
					ctx
				)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() =>
				validateOperations([{ op: 'add_step', step: { ...goodStep, label: '<img src=x>' } }], ctx)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, props: { fill: 'url(#x)' } } }],
					ctx
				)
			)
		).toBe('INVALID_INPUT');
	});

	it('rejects unsupported tween types and properties', () => {
		expect(
			code(() =>
				validateOperations([{ op: 'add_step', step: { ...goodStep, tweenType: 'morphSVG' } }], ctx)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, props: { filter: 'blur(4px)' } } }],
					ctx
				)
			)
		).toBe('UNSUPPORTED_PROPERTY');
	});

	it('enforces numeric bounds and finiteness', () => {
		expect(
			code(() =>
				validateOperations([{ op: 'add_step', step: { ...goodStep, props: { opacity: 2 } } }], ctx)
			)
		).toBe('LIMIT_EXCEEDED');
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, duration: LIMITS.maxTweenDuration + 1 } }],
					ctx
				)
			)
		).toBe('LIMIT_EXCEEDED');
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, duration: Number.POSITIVE_INFINITY } }],
					ctx
				)
			)
		).toBe('INVALID_INPUT');
		expect(
			code(() =>
				validateOperations([{ op: 'add_step', step: { ...goodStep, props: { x: NaN } } }], ctx)
			)
		).toBe('INVALID_INPUT');
	});

	it('reports unresolved targets with TARGET_NOT_FOUND', () => {
		expect(
			code(() =>
				validateOperations(
					[{ op: 'add_step', step: { ...goodStep, target: { type: 'id', value: 'nope' } } }],
					ctx
				)
			)
		).toBe('TARGET_NOT_FOUND');
		expect(
			code(() =>
				validateOperations(
					[
						{
							op: 'add_step',
							step: { ...goodStep, target: { type: 'group', value: 'accents', scopeToId: 'ghost' } }
						}
					],
					ctx
				)
			)
		).toBe('TARGET_NOT_FOUND');
	});

	it('validates eases and positions with strict grammars', () => {
		expect(validateEase('back.out(1.4)', 'e')).toBe('back.out(1.4)');
		expect(validateEase('elastic.out(1, 0.3)', 'e')).toBe('elastic.out(1, 0.3)');
		expect(code(() => validateEase('steps(4)', 'e'))).toBe('INVALID_INPUT');
		expect(code(() => validateEase('CustomEase.create("x","M0,0")', 'e'))).toBe('INVALID_INPUT');
		expect(validatePosition('0.5', 'p')).toBe(0.5);
		expect(validatePosition('<', 'p')).toBe('<');
		expect(validatePosition('+=0.2', 'p')).toBe('+=0.2');
		expect(validatePosition('<0.15', 'p')).toBe('<0.15');
		expect(code(() => validatePosition('label+=1', 'p'))).toBe('INVALID_INPUT');
		expect(code(() => validatePosition(99, 'p'))).toBe('LIMIT_EXCEEDED');
	});

	it('accepts relative positions through the complete operation validator', () => {
		for (const position of ['<', '>', '<0.15', '<+=0.2', '>-=0.1']) {
			const ops = validateOperations(
				[{ op: 'add_step', step: { ...goodStep, id: `relative-${position.length}`, position } }],
				ctx
			);
			expect(ops[0].op === 'add_step' && ops[0].step.position).toBe(position);
		}
	});

	it('requires an integer insertion index', () => {
		expect(
			code(() => validateOperations([{ op: 'add_step', step: goodStep, index: 1.5 }], ctx))
		).toBe('INVALID_INPUT');
	});

	it('caps the number of operations', () => {
		const many = Array.from({ length: LIMITS.maxOperations + 1 }, (_, i) => ({
			op: 'add_step',
			step: { ...goodStep, id: `s${i}` }
		}));
		expect(code(() => validateOperations(many, ctx))).toBe('LIMIT_EXCEEDED');
	});
});
