import { describe, expect, it } from 'vitest';
import { transformBounds } from '../src/lib/studio/bounds';

describe('transformBounds', () => {
	it('includes nested SVG translation in reported bounds', () => {
		const result = transformBounds(
			{ x: 100, y: 93, width: 38, height: 50 },
			{ a: 1, b: 0, c: 0, d: 1, e: 17, f: 36 }
		);

		expect(result).toEqual({ x: 117, y: 129, width: 38, height: 50, cx: 136, cy: 154 });
	});

	it('returns an axis-aligned box after rotation', () => {
		const result = transformBounds(
			{ x: 0, y: 0, width: 20, height: 10 },
			{ a: 0, b: 1, c: -1, d: 0, e: 30, f: 40 }
		);

		expect(result).toEqual({ x: 20, y: 40, width: 10, height: 20, cx: 25, cy: 50 });
	});
});
