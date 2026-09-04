export interface RectLike {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface MatrixLike {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

export interface TransformedBounds extends RectLike {
	cx: number;
	cy: number;
}

/** Axis-aligned bounds after mapping a local SVG box through its full CTM. */
export function transformBounds(bounds: RectLike, matrix: MatrixLike): TransformedBounds {
	const x2 = bounds.x + bounds.width;
	const y2 = bounds.y + bounds.height;
	const corners = [
		[bounds.x, bounds.y],
		[x2, bounds.y],
		[bounds.x, y2],
		[x2, y2]
	].map(([x, y]) => ({
		x: matrix.a * x + matrix.c * y + matrix.e,
		y: matrix.b * x + matrix.d * y + matrix.f
	}));
	const xs = corners.map((point) => point.x);
	const ys = corners.map((point) => point.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	const width = Math.max(...xs) - x;
	const height = Math.max(...ys) - y;
	return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}
