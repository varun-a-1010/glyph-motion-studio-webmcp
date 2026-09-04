import { describe, expect, it } from 'vitest';
import { applySceneOperations } from '../src/lib/actions/scenePatch';
import { StudioError } from '../src/lib/actions/errors';
import { getSampleScene } from '../src/lib/samples';
import { renderVectorElement } from '../src/lib/studio/vectorRenderer';

function playground() {
	const sample = getSampleScene('motion-playground-scene');
	if (!sample) throw new Error('missing Motion Playground sample');
	return sample.build();
}

const circle = {
	id: 'radar-target',
	name: 'Radar target',
	label: 'Detected radar target',
	primitive: 'circle',
	role: 'accent',
	group: 'targets',
	cx: 320,
	cy: 240,
	radius: 12,
	fill: '#f59e0b',
	pivot: { x: 320, y: 240 }
};

function errorCode(fn: () => unknown): string {
	try {
		fn();
		return 'OK';
	} catch (error) {
		if (error instanceof StudioError) return error.code;
		throw error;
	}
}

describe('vector scene patching', () => {
	it('starts the Motion Playground as a blank editable vector layer', () => {
		const scene = playground();
		expect(scene.elements).toHaveLength(1);
		expect(scene.elements[0].type).toBe('vector');
		if (scene.elements[0].type !== 'vector') throw new Error('expected vector layer');
		expect(scene.elements[0].nodes).toEqual([]);
		expect(scene.timeline.steps).toEqual([]);
	});

	it('adds structured nodes and renders escaped SVG with semantic metadata', () => {
		const result = applySceneOperations(playground(), [
			{ op: 'add_node', elementId: 'playground', node: circle },
			{
				op: 'add_node',
				elementId: 'playground',
				node: {
					id: 'status-label',
					primitive: 'text',
					x: 320,
					y: 290,
					text: 'CONTACT & LOCK',
					textAnchor: 'middle',
					role: 'primary',
					group: 'status',
					fill: '#e2e8f0'
				}
			}
		]);
		const layer = result.scene.elements[0];
		expect(layer.type).toBe('vector');
		if (layer.type !== 'vector') throw new Error('expected vector layer');
		expect(layer.nodes).toHaveLength(2);

		const rendered = renderVectorElement(layer);
		expect(rendered.svg).toContain('id="radar-target"');
		expect(rendered.svg).toContain('CONTACT &amp; LOCK');
		expect(rendered.registry['radar-target']).toEqual({
			role: 'accent',
			group: 'targets',
			primitiveType: 'circle',
			label: 'Detected radar target',
			pivot: { x: 320, y: 240 }
		});
	});

	it('duplicates, updates and regroups nodes through domain operations', () => {
		const result = applySceneOperations(playground(), [
			{ op: 'add_node', elementId: 'playground', node: circle },
			{
				op: 'duplicate_node',
				elementId: 'playground',
				nodeId: 'radar-target',
				newId: 'radar-target-2',
				offset: { x: 60, y: -20 }
			},
			{
				op: 'update_node',
				elementId: 'playground',
				nodeId: 'radar-target-2',
				changes: { radius: 18, fill: '#38bdf8' }
			},
			{
				op: 'set_semantics',
				elementId: 'playground',
				nodeIds: ['radar-target', 'radar-target-2'],
				role: 'secondary',
				group: 'tracked-objects'
			}
		]);
		const layer = result.scene.elements[0];
		if (layer.type !== 'vector') throw new Error('expected vector layer');
		expect(layer.nodes.map((node) => node.id)).toEqual(['radar-target', 'radar-target-2']);
		expect(layer.nodes[1].position).toEqual({ x: 60, y: -20 });
		expect(layer.nodes[1].fill).toBe('#38bdf8');
		expect(layer.nodes.every((node) => node.group === 'tracked-objects')).toBe(true);
	});

	it('can compose with a safe bundled artwork reference', () => {
		const result = applySceneOperations(playground(), [
			{
				op: 'add_asset',
				element: {
					id: 'brand',
					artworkKey: 'glyph-hero',
					name: 'Glyph mark',
					position: { x: 640, y: 360 },
					scale: 0.8
				}
			}
		]);
		expect(result.scene.elements[1]).toMatchObject({
			type: 'svg',
			id: 'brand',
			artworkKey: 'glyph-hero'
		});
	});

	it('rejects markup, script-like path data and unknown fields', () => {
		expect(
			errorCode(() =>
				applySceneOperations(playground(), [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { id: 'bad', primitive: 'text', x: 0, y: 0, text: '<script>' }
					}
				])
			)
		).toBe('INVALID_INPUT');
		expect(
			errorCode(() =>
				applySceneOperations(playground(), [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { id: 'bad', primitive: 'path', d: 'M0 0 url(javascript:bad)' }
					}
				])
			)
		).toBe('INVALID_INPUT');
		expect(
			errorCode(() =>
				applySceneOperations(playground(), [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { ...circle, onclick: 'run' }
					}
				])
			)
		).toBe('INVALID_INPUT');
	});

	it('rejects edits to locked layers and patches that exceed the discoverable target budget', () => {
		const locked = playground();
		locked.elements[0].locked = true;
		expect(
			errorCode(() =>
				applySceneOperations(locked, [{ op: 'add_node', elementId: 'playground', node: circle }])
			)
		).toBe('INVALID_INPUT');

		const full = applySceneOperations(playground(), [
			{ op: 'add_node', elementId: 'playground', node: circle }
		]).scene;
		if (full.elements[0].type !== 'vector') throw new Error('expected vector layer');
		const normalized = full.elements[0].nodes[0];
		full.elements[0].nodes = Array.from({ length: 60 }, (_, index) => ({
			...normalized,
			id: `target-${index}`,
			name: `Target ${index}`,
			label: `Target ${index}`
		}));
		expect(
			errorCode(() =>
				applySceneOperations(full, [
					{ op: 'add_node', elementId: 'playground', node: { ...circle, id: 'overflow' } }
				])
			)
		).toBe('LIMIT_EXCEEDED');
	});
});
