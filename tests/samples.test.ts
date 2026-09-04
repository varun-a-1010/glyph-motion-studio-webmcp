import { describe, expect, it } from 'vitest';
import { ARTWORK, getSampleScene } from '../src/lib/samples';
import { namespaceArtwork } from '../src/lib/studio/namespacing';

describe('bundled samples', () => {
	it('builds Space Mission as four independently scoped SVG elements', () => {
		const sample = getSampleScene('space-mission-scene');
		expect(sample).toBeDefined();

		const scene = sample!.build();
		expect(
			scene.elements.map((element) => ({
				id: element.id,
				artworkKey: element.type === 'svg' ? element.artworkKey : null
			}))
		).toEqual([
			{ id: 'mission', artworkKey: 'mission-overlay' },
			{ id: 'planet', artworkKey: 'space-planet' },
			{ id: 'satellite', artworkKey: 'space-satellite' },
			{ id: 'rocket', artworkKey: 'space-rocket' }
		]);
		expect(scene.timeline.steps.map((step) => step.target)).toEqual([
			{ type: 'id', value: 'mission-overlay', scopeToId: 'mission' },
			{ type: 'id', value: 'planet-system', scopeToId: 'planet' },
			{ type: 'id', value: 'satellite-system', scopeToId: 'satellite' },
			{ type: 'id', value: 'rocket-system', scopeToId: 'rocket' }
		]);
	});

	it('keeps every Space Mission registry entry attached to a real SVG id', () => {
		for (const key of ['mission-overlay', 'space-planet', 'space-satellite', 'space-rocket']) {
			const artwork = ARTWORK[key];
			expect(artwork).toBeDefined();
			expect(artwork.svg).not.toContain('{{');
			for (const targetId of Object.keys(artwork.registry)) {
				expect(artwork.svg, `${key} is missing ${targetId}`).toContain(`id="${targetId}"`);
				const tag =
					artwork.registry[targetId].primitiveType === 'group'
						? 'g'
						: artwork.registry[targetId].primitiveType;
				expect(artwork.svg, `${key}.${targetId} has the wrong primitive type`).toContain(
					`<${tag} id="${targetId}"`
				);
			}
		}
	});

	it('keeps the full Space Mission target inventory within one inspection response', () => {
		const targetCount = [
			'mission-overlay',
			'space-planet',
			'space-satellite',
			'space-rocket'
		].reduce((count, key) => count + Object.keys(ARTWORK[key].registry).length, 0);

		expect(targetCount).toBe(59);
		expect(targetCount).toBeLessThanOrEqual(60);
	});

	it('namespaces repeated ids across Space Mission artwork', () => {
		const satellite = namespaceArtwork(
			ARTWORK['space-satellite'].svg,
			ARTWORK['space-satellite'].registry,
			'satellite'
		);
		const rocket = namespaceArtwork(
			ARTWORK['space-rocket'].svg,
			ARTWORK['space-rocket'].registry,
			'rocket'
		);

		expect(satellite.svg).toContain('id="satellite__body-shell"');
		expect(rocket.svg).toContain('id="rocket__body-shell"');
		expect(satellite.registry['satellite__satellite-system']?.group).toBe('satellite__root');
		expect(rocket.registry['rocket__rocket-system']?.group).toBe('rocket__root');
	});
});
