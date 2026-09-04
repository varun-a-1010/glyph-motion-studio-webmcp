/**
 * Deterministic renderer for agent-authored vector nodes. The public scene
 * patch schema never accepts markup; this module is the only place those
 * validated values become SVG.
 */
import type { ElementRegistry, VectorNode, VectorSceneElement } from '$lib/types';

function esc(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function n(value: number): string {
	return Number(value.toFixed(3)).toString();
}

function defaultPivot(node: VectorNode): { x: number; y: number } {
	switch (node.primitive) {
		case 'circle':
		case 'ellipse':
			return { x: node.cx, y: node.cy };
		case 'rect':
			return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
		case 'line':
			return { x: (node.x1 + node.x2) / 2, y: (node.y1 + node.y2) / 2 };
		case 'polygon':
		case 'polyline': {
			const x = node.points.reduce((sum, point) => sum + point.x, 0) / node.points.length;
			const y = node.points.reduce((sum, point) => sum + point.y, 0) / node.points.length;
			return { x, y };
		}
		case 'text':
			return { x: node.x, y: node.y - node.fontSize / 2 };
		case 'path':
			return { x: 0, y: 0 };
	}
}

function transform(node: VectorNode): string {
	const pivot = node.pivot ?? defaultPivot(node);
	const transforms: string[] = [];
	if (node.position.x !== 0 || node.position.y !== 0)
		transforms.push(`translate(${n(node.position.x)} ${n(node.position.y)})`);
	if (node.rotation !== 0)
		transforms.push(`rotate(${n(node.rotation)} ${n(pivot.x)} ${n(pivot.y)})`);
	if (node.scale !== 1) {
		transforms.push(`translate(${n(pivot.x)} ${n(pivot.y)})`);
		transforms.push(`scale(${n(node.scale)})`);
		transforms.push(`translate(${n(-pivot.x)} ${n(-pivot.y)})`);
	}
	return transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';
}

function common(node: VectorNode): string {
	return [
		`id="${esc(node.id)}"`,
		`fill="${esc(node.fill)}"`,
		`stroke="${esc(node.stroke)}"`,
		`stroke-width="${n(node.strokeWidth)}"`,
		`opacity="${n(node.opacity)}"`,
		`vector-effect="non-scaling-stroke"`
	].join(' ');
}

function nodeMarkup(node: VectorNode): string {
	const attrs = `${common(node)}${transform(node)}`;
	switch (node.primitive) {
		case 'circle':
			return `<circle ${attrs} cx="${n(node.cx)}" cy="${n(node.cy)}" r="${n(node.radius)}" />`;
		case 'rect':
			return `<rect ${attrs} x="${n(node.x)}" y="${n(node.y)}" width="${n(node.width)}" height="${n(node.height)}" rx="${n(node.rx)}" ry="${n(node.ry)}" />`;
		case 'ellipse':
			return `<ellipse ${attrs} cx="${n(node.cx)}" cy="${n(node.cy)}" rx="${n(node.rx)}" ry="${n(node.ry)}" />`;
		case 'line':
			return `<line ${attrs} x1="${n(node.x1)}" y1="${n(node.y1)}" x2="${n(node.x2)}" y2="${n(node.y2)}" />`;
		case 'polygon':
		case 'polyline':
			return `<${node.primitive} ${attrs} points="${node.points.map((point) => `${n(point.x)},${n(point.y)}`).join(' ')}" />`;
		case 'path':
			return `<path ${attrs} d="${esc(node.d)}" />`;
		case 'text':
			return `<text ${attrs} x="${n(node.x)}" y="${n(node.y)}" font-size="${n(node.fontSize)}" font-weight="${n(node.fontWeight)}" text-anchor="${node.textAnchor}" font-family="system-ui, sans-serif">${esc(node.text)}</text>`;
	}
}

export function renderVectorElement(element: VectorSceneElement): {
	svg: string;
	registry: ElementRegistry;
} {
	const registry: ElementRegistry = {};
	for (const node of element.nodes) {
		registry[node.id] = {
			role: node.role,
			group: node.group,
			primitiveType: node.primitive,
			label: node.label,
			...(node.pivot ? { pivot: { ...node.pivot } } : {})
		};
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(element.width)} ${n(element.height)}" width="${n(element.width)}" height="${n(element.height)}" role="img" aria-label="${esc(element.name)}">${element.nodes.map(nodeMarkup).join('')}</svg>`;
	return { svg, registry };
}
