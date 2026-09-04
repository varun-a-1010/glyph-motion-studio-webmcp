import type { Artwork, Scene } from '$lib/types';
import glyphHero from './glyph-hero';
import missionOverlay from './mission-overlay';
import orbitSimple from './orbit-simple';
import spacePlanet from './space-planet';
import spaceRocket from './space-rocket';
import spaceSatellite from './space-satellite';

export const ARTWORK: Record<string, Artwork> = {
	'glyph-hero': glyphHero,
	'mission-overlay': missionOverlay,
	'orbit-simple': orbitSimple,
	'space-planet': spacePlanet,
	'space-rocket': spaceRocket,
	'space-satellite': spaceSatellite
};

export function getArtwork(key: string): Artwork | undefined {
	return ARTWORK[key];
}

export interface SampleScene {
	id: string;
	name: string;
	description: string;
	build: () => Scene;
}

const HERO_ELEMENT_ID = 'hero';
const ORBIT_ELEMENT_ID = 'orbit';
const MISSION_ELEMENT_ID = 'mission';
const PLANET_ELEMENT_ID = 'planet';
const SATELLITE_ELEMENT_ID = 'satellite';
const ROCKET_ELEMENT_ID = 'rocket';
const PLAYGROUND_ELEMENT_ID = 'playground';

/** Deliberately plain baseline: everything fades and scales in at once. */
export const SAMPLE_SCENES: SampleScene[] = [
	{
		id: 'glyph-hero-scene',
		name: 'Glyph brand entrance',
		description: 'Symbol, accent ring, wordmark and highlight with a plain baseline entrance.',
		build: () => ({
			id: 'glyph-hero-scene',
			name: 'Glyph brand entrance',
			settings: { width: 1280, height: 720, backgroundColor: glyphHero.backgroundColor, fps: 60 },
			elements: [
				{
					id: HERO_ELEMENT_ID,
					type: 'svg',
					name: 'Glyph lockup',
					artworkKey: 'glyph-hero',
					position: { x: 640, y: 360 },
					scale: 1.5,
					rotation: 0,
					opacity: 1,
					order: 0,
					visible: true,
					locked: false
				}
			],
			timeline: {
				totalDuration: 1.2,
				defaults: { ease: 'power2.out', duration: 0.6 },
				steps: [
					{
						id: 'baseline-entrance',
						label: 'Baseline: everything at once',
						target: { type: 'group', value: 'root', scopeToId: HERO_ELEMENT_ID },
						tweenType: 'from',
						props: { opacity: 0, scale: 0.92, transformOrigin: '50% 50%' },
						duration: 0.6,
						position: 0,
						ease: 'power2.out'
					}
				]
			},
			duration: 1.2,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		})
	},
	{
		id: 'motion-playground-scene',
		name: 'Motion Playground',
		description:
			'A blank, agent-editable vector canvas for composing, semantically rigging and animating a scene from scratch.',
		build: () => ({
			id: 'motion-playground-scene',
			name: 'Motion Playground',
			settings: { width: 1280, height: 720, backgroundColor: '#08111f', fps: 60 },
			elements: [
				{
					id: PLAYGROUND_ELEMENT_ID,
					type: 'vector',
					name: 'Agent vector layer',
					width: 1280,
					height: 720,
					nodes: [],
					position: { x: 640, y: 360 },
					scale: 1,
					rotation: 0,
					opacity: 1,
					order: 0,
					visible: true,
					locked: false
				}
			],
			timeline: { totalDuration: 1, defaults: { ease: 'power2.out', duration: 0.5 }, steps: [] },
			duration: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		})
	},
	{
		id: 'space-mission-scene',
		name: 'Space Mission',
		description:
			'A multi-SVG orbital-deployment composition with flight plot, planet, satellite and staged launch vehicle.',
		build: () => ({
			id: 'space-mission-scene',
			name: 'Space Mission sequence',
			settings: { width: 1280, height: 720, backgroundColor: '#07111f', fps: 60 },
			elements: [
				{
					id: MISSION_ELEMENT_ID,
					type: 'svg',
					name: 'Mission flight overlay',
					artworkKey: 'mission-overlay',
					position: { x: 640, y: 360 },
					scale: 1,
					rotation: 0,
					opacity: 1,
					order: 0,
					visible: true,
					locked: true
				},
				{
					id: PLANET_ELEMENT_ID,
					type: 'svg',
					name: 'Ringed planet system',
					artworkKey: 'space-planet',
					position: { x: 300, y: 380 },
					scale: 1.45,
					rotation: 0,
					opacity: 1,
					order: 1,
					visible: true,
					locked: false
				},
				{
					id: SATELLITE_ELEMENT_ID,
					type: 'svg',
					name: 'Communications satellite',
					artworkKey: 'space-satellite',
					position: { x: 805, y: 205 },
					scale: 1,
					rotation: -5,
					opacity: 1,
					order: 2,
					visible: true,
					locked: false
				},
				{
					id: ROCKET_ELEMENT_ID,
					type: 'svg',
					name: 'Mission launch vehicle',
					artworkKey: 'space-rocket',
					position: { x: 1020, y: 460 },
					scale: 0.95,
					rotation: 12,
					opacity: 1,
					order: 3,
					visible: true,
					locked: false
				}
			],
			timeline: {
				totalDuration: 1.2,
				defaults: { ease: 'power2.out', duration: 0.65 },
				steps: [
					{
						id: 'baseline-mission-overlay',
						label: 'Baseline: flight overlay at once',
						target: {
							type: 'id',
							value: 'mission-overlay',
							scopeToId: MISSION_ELEMENT_ID
						},
						tweenType: 'from',
						props: { opacity: 0 },
						duration: 0.65,
						position: 0,
						ease: 'power2.out'
					},
					{
						id: 'baseline-planet',
						label: 'Baseline: planet at once',
						target: { type: 'id', value: 'planet-system', scopeToId: PLANET_ELEMENT_ID },
						tweenType: 'from',
						props: { opacity: 0, scale: 0.94, transformOrigin: '50% 50%' },
						duration: 0.65,
						position: 0,
						ease: 'power2.out'
					},
					{
						id: 'baseline-satellite',
						label: 'Baseline: satellite at once',
						target: {
							type: 'id',
							value: 'satellite-system',
							scopeToId: SATELLITE_ELEMENT_ID
						},
						tweenType: 'from',
						props: { opacity: 0, scale: 0.94, transformOrigin: '50% 50%' },
						duration: 0.65,
						position: 0,
						ease: 'power2.out'
					},
					{
						id: 'baseline-rocket',
						label: 'Baseline: rocket at once',
						target: { type: 'id', value: 'rocket-system', scopeToId: ROCKET_ELEMENT_ID },
						tweenType: 'from',
						props: { opacity: 0, scale: 0.94, transformOrigin: '50% 50%' },
						duration: 0.65,
						position: 0,
						ease: 'power2.out'
					}
				]
			},
			duration: 1.2,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		})
	},
	{
		id: 'orbit-scene',
		name: 'Orbit',
		description: 'A simpler composition for quick experiments.',
		build: () => ({
			id: 'orbit-scene',
			name: 'Orbit',
			settings: { width: 1280, height: 720, backgroundColor: orbitSimple.backgroundColor, fps: 60 },
			elements: [
				{
					id: ORBIT_ELEMENT_ID,
					type: 'svg',
					name: 'Orbit',
					artworkKey: 'orbit-simple',
					position: { x: 640, y: 360 },
					scale: 2,
					rotation: 0,
					opacity: 1,
					order: 0,
					visible: true,
					locked: false
				}
			],
			timeline: { totalDuration: 1, defaults: { ease: 'power2.out', duration: 0.5 }, steps: [] },
			duration: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		})
	}
];

export function getSampleScene(id: string): SampleScene | undefined {
	return SAMPLE_SCENES.find((s) => s.id === id);
}
