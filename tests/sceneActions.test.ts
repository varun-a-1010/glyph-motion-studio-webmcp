import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	activeSampleId,
	buildDiagnostics,
	elementRegistries,
	sceneRevision,
	stagedScenePreview,
	stagedPreview,
	studioScene
} from '../src/lib/studio/stores/scene';
import {
	applyTimelinePatch,
	applyScenePatch,
	getSceneSnapshot,
	inspectVectorScene,
	loadScene,
	previewScenePatch,
	previewTimelinePatch,
	renderStateHash,
	saveScene,
	switchScene,
	undoLastTimelineChange
} from '../src/lib/actions/sceneActions';
import { StudioError } from '../src/lib/actions/errors';
import { SAMPLE_SCENES } from '../src/lib/samples';
import glyphHero from '../src/lib/samples/glyph-hero';
import { namespaceArtwork } from '../src/lib/studio/namespacing';

// Minimal localStorage for the save test
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => void mem.set(k, v),
	removeItem: (k: string) => void mem.delete(k),
	clear: () => mem.clear(),
	key: () => null,
	length: 0
} as Storage;

/** Simulate the renderer: report a build for whatever timeline is staged/committed. */
function fakeRenderer() {
	const report = () => {
		const tl = get(stagedPreview)?.timeline ?? get(studioScene)?.timeline;
		if (!tl) return;
		queueMicrotask(() =>
			buildDiagnostics.set({
				hash: renderStateHash(get(studioScene)!, tl),
				totalDuration: 1,
				skippedSteps: [],
				failedSteps: [],
				stepTimings: []
			})
		);
	};
	const a = stagedPreview.subscribe(report);
	const b = studioScene.subscribe(report);
	return () => {
		a();
		b();
	};
}

const addOp = (id = 'symbol-enter') => ({
	op: 'add_step',
	step: {
		id,
		target: { type: 'id', value: 'symbol' },
		tweenType: 'to',
		props: { rotation: 5 },
		duration: 0.5,
		position: 0
	}
});

async function codeOf(p: Promise<unknown>): Promise<string> {
	try {
		await p;
		return 'OK';
	} catch (e) {
		if (e instanceof StudioError) return e.code;
		throw e;
	}
}

describe('scene actions', () => {
	let stop: () => void;
	beforeEach(() => {
		loadScene(SAMPLE_SCENES[0].build());
		elementRegistries.set({
			hero: namespaceArtwork(glyphHero.svg, glyphHero.registry, 'hero').registry
		});
		stop?.();
		stop = fakeRenderer();
		mem.clear();
	});

	it('rejects a stale baseRevision without mutating anything', async () => {
		const before = structuredClone(get(studioScene));
		expect(
			await codeOf(previewTimelinePatch({ baseRevision: 99, operations: [addOp()] }, 'agent'))
		).toBe('REVISION_CONFLICT');
		expect(get(studioScene)).toEqual(before);
		expect(get(stagedPreview)).toBeNull();
	});

	it('preview does not change the committed scene; apply does and bumps the revision', async () => {
		const rev = get(sceneRevision);
		const preview = await previewTimelinePatch(
			{ baseRevision: rev, intent: 'test', operations: [addOp()] },
			'agent'
		);
		expect(get(studioScene)!.timeline.steps.map((s) => s.id)).not.toContain('symbol-enter');
		expect(get(stagedPreview)?.id).toBe(preview.previewId);

		const applied = await applyTimelinePatch(
			{ previewId: preview.previewId, baseRevision: rev },
			'agent'
		);
		expect(applied.sceneRevision).toBe(rev + 1);
		expect(get(studioScene)!.timeline.steps.map((s) => s.id)).toContain('symbol-enter');
		expect(get(stagedPreview)).toBeNull();
	});

	it('preview tokens are single-use and revision-bound', async () => {
		const rev = get(sceneRevision);
		const preview = await previewTimelinePatch(
			{ baseRevision: rev, operations: [addOp()] },
			'agent'
		);
		await applyTimelinePatch({ previewId: preview.previewId, baseRevision: rev }, 'agent');
		expect(
			await codeOf(
				applyTimelinePatch({ previewId: preview.previewId, baseRevision: rev + 1 }, 'agent')
			)
		).toBe('PREVIEW_ALREADY_USED');

		const p2 = await previewTimelinePatch(
			{ baseRevision: rev + 1, operations: [addOp('second')] },
			'agent'
		);
		expect(
			await codeOf(
				applyTimelinePatch({ previewId: 'unknown-preview', baseRevision: rev + 1 }, 'agent')
			)
		).toBe('PREVIEW_NOT_FOUND');
		expect(
			await codeOf(applyTimelinePatch({ previewId: p2.previewId, baseRevision: rev }, 'agent'))
		).toBe('REVISION_CONFLICT');
		expect(get(stagedPreview)?.id).toBe(p2.previewId);
	});

	it('preserves a composition preview when apply receives only a mistyped revision', async () => {
		const playground = SAMPLE_SCENES.find((sample) => sample.id === 'motion-playground-scene');
		if (!playground) throw new Error('missing Motion Playground sample');
		loadScene(playground.build());
		const revision = get(sceneRevision);
		const preview = await previewScenePatch(
			{
				baseRevision: revision,
				operations: [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { id: 'dot', primitive: 'circle', cx: 10, cy: 10, radius: 4 }
					}
				]
			},
			'agent'
		);

		expect(
			await codeOf(
				applyScenePatch({ previewId: preview.previewId, baseRevision: revision + 1 }, 'agent')
			)
		).toBe('REVISION_CONFLICT');
		expect(get(stagedScenePreview)?.id).toBe(preview.previewId);
	});

	it('invalid patches are rejected and leave no preview', async () => {
		const rev = get(sceneRevision);
		expect(
			await codeOf(
				previewTimelinePatch(
					{
						baseRevision: rev,
						operations: [
							{
								op: 'add_step',
								step: {
									id: 'x',
									target: { type: 'id', value: 'missing' },
									tweenType: 'to',
									props: { x: 1 },
									duration: 1,
									position: 0
								}
							}
						]
					},
					'agent'
				)
			)
		).toBe('TARGET_NOT_FOUND');
		expect(get(stagedPreview)).toBeNull();
	});

	it('revalidates the complete merged step on update', async () => {
		const revision = get(sceneRevision);
		expect(
			await codeOf(
				previewTimelinePatch(
					{
						baseRevision: revision,
						operations: [
							{
								op: 'update_step',
								stepId: 'baseline-entrance',
								changes: { duration: 0 }
							}
						]
					},
					'agent'
				)
			)
		).toBe('INVALID_INPUT');
		expect(get(stagedPreview)).toBeNull();

		expect(
			await codeOf(
				previewTimelinePatch(
					{
						baseRevision: revision,
						operations: [
							{
								op: 'update_step',
								stepId: 'baseline-entrance',
								changes: { tweenType: 'fromTo' }
							}
						]
					},
					'agent'
				)
			)
		).toBe('INVALID_INPUT');
	});

	it('rejects an ambiguous second from tween before staging a preview', async () => {
		const revision = get(sceneRevision);
		expect(
			await codeOf(
				previewTimelinePatch(
					{
						baseRevision: revision,
						operations: [
							{
								op: 'add_step',
								step: {
									id: 'second-symbol-entrance',
									target: { type: 'id', value: 'symbol' },
									tweenType: 'from',
									props: { opacity: 0 },
									duration: 0.4,
									position: '<0.1'
								}
							}
						]
					},
					'agent'
				)
			)
		).toBe('INVALID_INPUT');
		expect(get(stagedPreview)).toBeNull();
	});

	it('undo restores the exact previous timeline', async () => {
		const rev = get(sceneRevision);
		const before = structuredClone(get(studioScene)!.timeline);
		const preview = await previewTimelinePatch(
			{ baseRevision: rev, operations: [addOp()] },
			'agent'
		);
		await applyTimelinePatch({ previewId: preview.previewId, baseRevision: rev }, 'agent');
		const undone = await undoLastTimelineChange('agent');
		expect(undone.sceneRevision).toBe(rev + 2);
		expect(get(studioScene)!.timeline).toEqual(before);
		expect(await codeOf(undoLastTimelineChange('agent'))).toBe('NOTHING_TO_UNDO');
	});

	it('save is explicit and revision-checked', async () => {
		const rev = get(sceneRevision);
		expect(await codeOf(saveScene({ sceneRevision: rev + 5 }, 'agent'))).toBe('REVISION_CONFLICT');
		const res = await saveScene({ sceneRevision: rev, name: 'My entrance' }, 'agent');
		expect(res.name).toBe('My entrance');
		expect([...mem.keys()][0]).toMatch(/^glyph-motion-studio:project:/);
	});

	it('previews and applies a vector composition without mutating early', async () => {
		const playground = SAMPLE_SCENES.find((sample) => sample.id === 'motion-playground-scene');
		if (!playground) throw new Error('missing Motion Playground sample');
		loadScene(playground.build());
		const revision = get(sceneRevision);
		const preview = await previewScenePatch(
			{
				baseRevision: revision,
				intent: 'Create one radar target',
				operations: [
					{
						op: 'add_node',
						elementId: 'playground',
						node: {
							id: 'radar-target',
							primitive: 'circle',
							cx: 320,
							cy: 240,
							radius: 12,
							role: 'accent',
							group: 'targets',
							pivot: { x: 320, y: 240 }
						}
					}
				]
			},
			'agent'
		);
		const committed = get(studioScene)!.elements[0];
		if (committed.type !== 'vector') throw new Error('expected vector layer');
		expect(committed.nodes).toHaveLength(0);
		expect(get(stagedScenePreview)?.id).toBe(preview.previewId);

		const applied = await applyScenePatch(
			{ previewId: preview.previewId, baseRevision: revision },
			'agent'
		);
		expect(applied.sceneRevision).toBe(revision + 1);
		const current = get(studioScene)!.elements[0];
		if (current.type !== 'vector') throw new Error('expected vector layer');
		expect(current.nodes.map((node) => node.id)).toEqual(['radar-target']);
		expect(get(stagedScenePreview)).toBeNull();
		expect(inspectVectorScene().vectorLayers[0].nodes[0].pivot).toEqual({ x: 320, y: 240 });

		await undoLastTimelineChange('agent');
		const restored = get(studioScene)!.elements[0];
		if (restored.type !== 'vector') throw new Error('expected vector layer');
		expect(restored.nodes).toEqual([]);
	});

	it('does not mix composition and timeline previews', async () => {
		const playground = SAMPLE_SCENES.find((sample) => sample.id === 'motion-playground-scene');
		if (!playground) throw new Error('missing Motion Playground sample');
		loadScene(playground.build());
		const revision = get(sceneRevision);
		await previewScenePatch(
			{
				baseRevision: revision,
				operations: [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { id: 'dot', primitive: 'circle', cx: 10, cy: 10, radius: 4 }
					}
				]
			},
			'agent'
		);
		expect(
			await codeOf(previewTimelinePatch({ baseRevision: revision, operations: [addOp()] }, 'agent'))
		).toBe('PREVIEW_PENDING');
		expect(await codeOf(saveScene({ sceneRevision: revision }, 'agent'))).toBe('INVALID_INPUT');
	});

	it('treats a pristine baseline as clean but protects real unsaved work when switching', async () => {
		const snapshot = getSceneSnapshot();
		expect(snapshot.availableScenes.find((scene) => scene.active)?.id).toBe('glyph-hero-scene');
		expect(snapshot.availableScenes.map((scene) => scene.id)).toContain('motion-playground-scene');
		expect(snapshot.unsavedChanges).toBe(false);

		const revision = get(sceneRevision);
		const switched = await switchScene(
			{ sceneId: 'motion-playground-scene', baseRevision: revision },
			'agent'
		);
		expect(switched).toMatchObject({
			sceneId: 'motion-playground-scene',
			loaded: 'baseline',
			sceneRevision: revision + 1
		});
		expect(get(activeSampleId)).toBe('motion-playground-scene');
		expect(get(studioScene)?.elements[0].type).toBe('vector');

		const preview = await previewScenePatch(
			{
				baseRevision: switched.sceneRevision,
				operations: [
					{
						op: 'add_node',
						elementId: 'playground',
						node: { id: 'dot', primitive: 'circle', cx: 10, cy: 10, radius: 4 }
					}
				]
			},
			'agent'
		);
		const applied = await applyScenePatch(
			{ previewId: preview.previewId, baseRevision: switched.sceneRevision },
			'agent'
		);
		expect(getSceneSnapshot().unsavedChanges).toBe(true);
		expect(
			await codeOf(
				switchScene({ sceneId: 'orbit-scene', baseRevision: applied.sceneRevision }, 'agent')
			)
		).toBe('UNSAVED_CHANGES');
	});
});
