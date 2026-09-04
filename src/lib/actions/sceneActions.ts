/**
 * The ONE mutation layer. Human controls and WebMCP tools both call these
 * functions; nothing else writes to the scene store. Every mutation:
 *   - validates through the public schema,
 *   - is serialized by a lock (BUSY otherwise),
 *   - bumps `sceneRevision` when it commits,
 *   - lands in the visible activity log.
 */
import { tick } from 'svelte';
import { get } from 'svelte/store';
import {
	activeSampleId,
	buildDiagnostics,
	combinedRegistry,
	playbackIntent,
	reducedMotion,
	saveState,
	sceneRevision,
	stagedScenePreview,
	stagedPreview,
	studioScene,
	type StagedPreview,
	type StagedScenePreview
} from '$lib/studio/stores/scene';
import { studioUI } from '$lib/studio/stores/studioUI';
import { logActivity, updateActivity, type ActivitySource } from '$lib/studio/stores/activity';
import { StudioError, toErrorPayload } from './errors';
import { hashValue } from './hash';
import { clearHistory, historyDepth, peekHistory, popHistory, pushHistory } from './history';
import { applyOperations, assertNoConflictingFromTweens, estimateTimeline } from './patch';
import { applySceneOperations, type ScenePatchOperation } from './scenePatch';
import {
	ALLOWED_PROPS,
	ALLOWED_TWEEN_TYPES,
	LIMITS,
	validateIntent,
	validateOperations,
	validateRevision,
	validateStep,
	type TimelinePatchOperation
} from './schema';
import { deleteProject, loadProject, saveProject } from './persistence';
import { resolveTargetIds } from '$lib/studio/targetResolver';
import { splitNamespacedId } from '$lib/studio/namespacing';
import { ARTWORK, getArtwork, getSampleScene, SAMPLE_SCENES } from '$lib/samples';
import type {
	AnimationTarget,
	BaseSceneElement,
	BuildDiagnostics,
	ElementRegistry,
	Scene,
	SceneElement,
	TimelineDefinition,
	VectorSceneElement
} from '$lib/types';

// ─── Lock ────────────────────────────────────────────────────

let busy = false;
const consumedPreviewIds = new Set<string>();

function markPreviewConsumed(previewId: string): void {
	consumedPreviewIds.add(previewId);
	if (consumedPreviewIds.size <= LIMITS.maxUndoDepth) return;
	const oldest = consumedPreviewIds.values().next().value;
	if (oldest) consumedPreviewIds.delete(oldest);
}

async function withLock<T>(action: string, fn: () => Promise<T>): Promise<T> {
	if (busy)
		throw new StudioError('BUSY', `another mutation is in progress; retry ${action} shortly`);
	busy = true;
	try {
		return await fn();
	} finally {
		busy = false;
	}
}

function requireScene(): Scene {
	const scene = get(studioScene);
	if (!scene) throw new StudioError('NO_SCENE', 'no scene is loaded');
	return scene;
}

function validationContext() {
	const scene = requireScene();
	return { registry: get(combinedRegistry), elementIds: scene.elements.map((e) => e.id) };
}

function bumpRevision(): number {
	let next = 0;
	sceneRevision.update((r) => (next = r + 1));
	return next;
}

function markUnsaved() {
	saveState.update((s) => ({ ...s, status: 'unsaved' }));
}

/** Renderer identity: timeline plus the DOM-producing scene elements. */
export function renderStateHash(scene: Scene, timeline = scene.timeline): string {
	return hashValue({ elements: scene.elements, timeline });
}

/** Waits until the renderer reports a build for `hash`, or times out. */
function awaitBuild(hash: string, timeoutMs = 3000): Promise<BuildDiagnostics | null> {
	const current = get(buildDiagnostics);
	if (current?.hash === hash) return Promise.resolve(current);
	return new Promise((resolve) => {
		let done = false;
		const timer = setTimeout(() => {
			if (done) return;
			done = true;
			unsub();
			resolve(null);
		}, timeoutMs);
		const unsub = buildDiagnostics.subscribe((d) => {
			if (done || !d || d.hash !== hash) return;
			done = true;
			clearTimeout(timer);
			queueMicrotask(unsub);
			resolve(d);
		});
	});
}

// ─── Bounds provider (registered by the canvas) ──────────────

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
	cx: number;
	cy: number;
}

let boundsProvider: ((namespacedId: string) => Bounds | null) | null = null;

export function setBoundsProvider(fn: typeof boundsProvider) {
	boundsProvider = fn;
}

// ─── Loading / reset ─────────────────────────────────────────

export function loadScene(
	scene: Scene,
	opts: { savedAt?: string | null; revision?: number } = {}
): void {
	const revision = opts.revision ?? 1;
	activeSampleId.set(getSampleScene(scene.id)?.id ?? null);
	studioScene.set(structuredClone(scene));
	sceneRevision.set(revision);
	stagedPreview.set(null);
	stagedScenePreview.set(null);
	consumedPreviewIds.clear();
	clearHistory();
	studioUI.set({
		selectedElementId: scene.elements[0]?.id ?? null,
		selectedStepId: null,
		highlightedSubElementId: null
	});
	saveState.set({
		// A bundled baseline is clean even though it has not been persisted as
		// a user project. Edits still flip this to unsaved via markUnsaved().
		status: 'saved',
		savedAt: opts.savedAt ?? null,
		savedRevision: revision,
		projectId: opts.savedAt ? scene.id : null
	});
	playbackIntent.set('end');
}

/** Loads the locally saved project for a sample if one exists, else the sample itself. */
export function openSample(sampleId: string, opts: { revision?: number } = {}): void {
	const sample = getSampleScene(sampleId);
	if (!sample) throw new StudioError('INVALID_INPUT', `unknown sample "${sampleId}"`);
	const saved = loadProject(sample.id);
	if (saved) {
		loadScene(saved.scene, { savedAt: saved.savedAt, revision: opts.revision });
		logActivity({
			source: 'system',
			action: 'open',
			purpose: `Loaded saved project "${saved.scene.name}"`,
			status: 'succeeded'
		});
	} else {
		loadScene(sample.build(), { revision: opts.revision });
		logActivity({
			source: 'system',
			action: 'open',
			purpose: `Loaded sample "${sample.name}"`,
			status: 'succeeded'
		});
	}
}

export function resetSample(sampleId: string): void {
	const sample = getSampleScene(sampleId);
	if (!sample) return;
	deleteProject(sample.id);
	loadScene(sample.build(), { revision: get(sceneRevision) + 1 });
	logActivity({
		source: 'user',
		action: 'reset',
		purpose: `Reset "${sample.name}" to its baseline`,
		status: 'succeeded'
	});
}

export interface SwitchSceneResult {
	sceneId: string;
	name: string;
	sceneRevision: number;
	loaded: 'saved-project' | 'baseline';
	summary: string;
}

/** Safely switch among bundled workspaces without deleting a target scene's saved project. */
export async function switchScene(
	input: {
		sceneId: unknown;
		baseRevision: unknown;
		discardCurrentChanges?: unknown;
	},
	source: ActivitySource
): Promise<SwitchSceneResult> {
	const activityId = logActivity({
		source,
		action: 'switch_scene',
		purpose: 'Switch bundled scene',
		status: 'started'
	});
	try {
		return await withLock('switch_scene', async () => {
			const currentScene = requireScene();
			const suppliedRevision = validateRevision(input.baseRevision);
			const currentRevision = get(sceneRevision);
			if (suppliedRevision !== currentRevision)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${currentRevision}, you supplied ${suppliedRevision} — call get_scene before switching`,
					{ current: currentRevision, supplied: suppliedRevision }
				);
			if (typeof input.sceneId !== 'string' || !getSampleScene(input.sceneId))
				throw new StudioError(
					'INVALID_INPUT',
					'sceneId: must name a bundled scene returned by get_scene'
				);
			if (
				input.discardCurrentChanges !== undefined &&
				typeof input.discardCurrentChanges !== 'boolean'
			)
				throw new StudioError('INVALID_INPUT', 'discardCurrentChanges: must be a boolean');

			const previewPending = Boolean(get(stagedPreview) || get(stagedScenePreview));
			const save = get(saveState);
			const unsaved = save.status !== 'saved' || save.savedRevision !== currentRevision;
			if ((previewPending || unsaved) && input.discardCurrentChanges !== true)
				throw new StudioError(
					'UNSAVED_CHANGES',
					'current scene has an unapplied preview or unsaved changes — save it, or retry with discardCurrentChanges:true only when the user explicitly approves abandoning them',
					{ sceneId: currentScene.id, previewPending, unsaved }
				);

			const saved = loadProject(input.sceneId);
			openSample(input.sceneId, { revision: currentRevision + 1 });
			await tick();
			const opened = requireScene();
			const summary = `Switched to "${opened.name}" (${saved ? 'saved project' : 'baseline'}).`;
			updateActivity(activityId, {
				status: 'succeeded',
				purpose: `Switch to ${opened.name}`,
				message: summary
			});
			return {
				sceneId: opened.id,
				name: opened.name,
				sceneRevision: get(sceneRevision),
				loaded: saved ? 'saved-project' : 'baseline',
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

// ─── Read: scene snapshot ────────────────────────────────────

export interface SceneSnapshot {
	scene: {
		id: string;
		name: string;
		width: number;
		height: number;
		fps: number;
		backgroundColor: string;
		duration: number;
	};
	sceneRevision: number;
	availableScenes: Array<{
		id: string;
		name: string;
		description: string;
		active: boolean;
	}>;
	elements: Array<{
		id: string;
		name: string;
		type: 'svg' | 'vector';
		artwork: { key: string; name: string; description: string } | null;
		vector: { width: number; height: number; nodeCount: number } | null;
		position: { x: number; y: number };
		scale: number;
		rotation: number;
		opacity: number;
		visible: boolean;
		locked: boolean;
	}>;
	timeline: TimelineDefinition & { estimatedDuration: number };
	reducedMotion: { systemPreference: boolean; policy: 'final-state-no-autoplay' | 'full-motion' };
	stagedPreview: {
		kind: 'timeline' | 'scene';
		previewId: string;
		intent: string;
		expiresAt: string;
		baseRevision: number;
		affectedCount: number;
	} | null;
	unsavedChanges: boolean;
	lastSavedAt: string | null;
	undoDepth: number;
	lastBuild: {
		totalDuration: number;
		skippedSteps: string[];
		failedSteps: { id: string; error: string }[];
	} | null;
	limits: typeof LIMITS;
	supported: {
		tweenTypes: readonly string[];
		targetTypes: readonly string[];
		properties: readonly string[];
	};
}

export function getSceneSnapshot(): SceneSnapshot {
	const scene = requireScene();
	const preview = get(stagedPreview);
	const scenePreview = get(stagedScenePreview);
	const save = get(saveState);
	const revision = get(sceneRevision);
	const diag = get(buildDiagnostics);
	const rm = get(reducedMotion);
	return {
		scene: {
			id: scene.id,
			name: scene.name,
			width: scene.settings.width,
			height: scene.settings.height,
			fps: scene.settings.fps,
			backgroundColor: scene.settings.backgroundColor,
			duration: scene.duration
		},
		sceneRevision: revision,
		availableScenes: SAMPLE_SCENES.map((sample) => ({
			id: sample.id,
			name: sample.name,
			description: sample.description,
			active: sample.id === get(activeSampleId)
		})),
		elements: scene.elements.map((el) => {
			const art = el.type === 'svg' ? getArtwork(el.artworkKey) : undefined;
			return {
				id: el.id,
				name: el.name,
				type: el.type,
				artwork: art ? { key: art.key, name: art.name, description: art.description } : null,
				vector:
					el.type === 'vector'
						? { width: el.width, height: el.height, nodeCount: el.nodes.length }
						: null,
				position: el.position,
				scale: el.scale,
				rotation: el.rotation,
				opacity: el.opacity,
				visible: el.visible,
				locked: el.locked
			};
		}),
		timeline: {
			...structuredClone(scene.timeline),
			estimatedDuration: estimateTimeline(scene.timeline).totalDuration
		},
		reducedMotion: { systemPreference: rm, policy: rm ? 'final-state-no-autoplay' : 'full-motion' },
		stagedPreview: preview
			? {
					kind: 'timeline',
					previewId: preview.id,
					intent: preview.intent,
					expiresAt: new Date(preview.expiresAt).toISOString(),
					baseRevision: preview.baseRevision,
					affectedCount: preview.affectedStepIds.length
				}
			: scenePreview
				? {
						kind: 'scene',
						previewId: scenePreview.id,
						intent: scenePreview.intent,
						expiresAt: new Date(scenePreview.expiresAt).toISOString(),
						baseRevision: scenePreview.baseRevision,
						affectedCount: scenePreview.affectedIds.length
					}
				: null,
		unsavedChanges: save.status !== 'saved' || save.savedRevision !== revision,
		lastSavedAt: save.savedAt,
		undoDepth: historyDepth(),
		lastBuild: diag
			? {
					totalDuration: diag.totalDuration,
					skippedSteps: diag.skippedSteps,
					failedSteps: diag.failedSteps
				}
			: null,
		limits: LIMITS,
		supported: {
			tweenTypes: ALLOWED_TWEEN_TYPES,
			targetTypes: ['id', 'role', 'group'],
			properties: ALLOWED_PROPS
		}
	};
}

// ─── Read: targets ───────────────────────────────────────────

export interface TargetRecord {
	target: AnimationTarget;
	id: string;
	label: string;
	role: string;
	group: string;
	primitiveType: string;
	pivot: { x: number; y: number } | null;
	element: { id: string; name: string };
	bounds: Bounds | null;
	operations: string[];
}

export interface TargetInspection {
	elements: Array<{ id: string; name: string; artwork: string }>;
	targets: TargetRecord[];
	roles: Array<{ target: AnimationTarget; count: number }>;
	groups: Array<{ target: AnimationTarget; count: number; label: string }>;
	totalTargets: number;
	truncated: boolean;
	hint: string;
}

export function inspectTargets(
	filter: { scopeToId?: string; role?: string; group?: string } = {}
): TargetInspection {
	const scene = requireScene();
	const registry = get(combinedRegistry);
	const elementsById = new Map(scene.elements.map((e) => [e.id, e]));

	const all = Object.entries(registry)
		.map(([nsId, meta]) => {
			const { scope, local } = splitNamespacedId(nsId);
			const element = scope ? elementsById.get(scope) : undefined;
			if (!element) return null;
			return { nsId, local, meta, element, localGroup: splitNamespacedId(meta.group).local };
		})
		.filter((r): r is NonNullable<typeof r> => r !== null)
		.filter((r) => !filter.scopeToId || r.element.id === filter.scopeToId)
		.filter((r) => !filter.role || r.meta.role === filter.role)
		.filter((r) => !filter.group || r.localGroup === filter.group);

	const records: TargetRecord[] = all.slice(0, LIMITS.maxTargetRecords).map((r) => ({
		target: { type: 'id', value: r.local, scopeToId: r.element.id },
		id: r.local,
		label: r.meta.label ?? r.local,
		role: r.meta.role,
		group: r.localGroup,
		primitiveType: r.meta.primitiveType,
		pivot: r.meta.pivot ?? null,
		element: { id: r.element.id, name: r.element.name },
		bounds: boundsProvider?.(r.nsId) ?? null,
		operations:
			r.meta.primitiveType === 'text' ? ['from', 'to', 'fromTo', 'set'] : [...ALLOWED_TWEEN_TYPES]
	}));

	const roleCounts = new Map<string, number>();
	const groupCounts = new Map<string, { count: number; label: string; scope: string }>();
	for (const r of all) {
		roleCounts.set(r.meta.role, (roleCounts.get(r.meta.role) ?? 0) + 1);
		const key = `${r.element.id}::${r.localGroup}`;
		const g = groupCounts.get(key) ?? {
			count: 0,
			label: registry[r.meta.group]?.label ?? r.localGroup,
			scope: r.element.id
		};
		g.count += 1;
		groupCounts.set(key, g);
	}
	const soleScope = scene.elements.length === 1 ? scene.elements[0].id : undefined;

	return {
		elements: scene.elements.map((e) => ({
			id: e.id,
			name: e.name,
			artwork: e.type === 'svg' ? e.artworkKey : 'agent-vector'
		})),
		targets: records,
		roles: [...roleCounts].map(([role, count]) => ({
			target: { type: 'role', value: role, ...(soleScope ? { scopeToId: soleScope } : {}) },
			count
		})),
		groups: [...groupCounts].map(([key, g]) => ({
			target: { type: 'group', value: key.split('::')[1], scopeToId: g.scope },
			count: g.count,
			label: g.label
		})),
		totalTargets: all.length,
		truncated: all.length > records.length,
		hint: 'Use {type:"id"} for one element, {type:"group"} for a semantic group (e.g. "accents"), {type:"role"} for every element with that role. Group targets animate the members, not the container.'
	};
}

// ─── Read / preview / apply: vector composition ──────────────

export interface VectorSceneInspection {
	sceneRevision: number;
	vectorLayers: Array<{
		id: string;
		name: string;
		width: number;
		height: number;
		locked: boolean;
		nodes: VectorSceneElement['nodes'];
	}>;
	otherElements: Array<{ id: string; name: string; artworkKey: string; locked: boolean }>;
	availableAssets: Array<{
		artworkKey: string;
		name: string;
		description: string;
		width: number;
		height: number;
		targetCount: number;
	}>;
	limits: {
		maxOperations: number;
		maxSceneElements: number;
		maxVectorNodes: number;
		maxTargetRecords: number;
	};
	operations: string[];
	hint: string;
}

export function inspectVectorScene(): VectorSceneInspection {
	const scene = requireScene();
	return {
		sceneRevision: get(sceneRevision),
		vectorLayers: scene.elements
			.filter((element): element is VectorSceneElement => element.type === 'vector')
			.map((element) => ({
				id: element.id,
				name: element.name,
				width: element.width,
				height: element.height,
				locked: element.locked,
				nodes: structuredClone(element.nodes)
			})),
		otherElements: scene.elements
			.filter((element) => element.type === 'svg')
			.map((element) => ({
				id: element.id,
				name: element.name,
				artworkKey: element.artworkKey,
				locked: element.locked
			})),
		availableAssets: Object.values(ARTWORK).map((artwork) => ({
			artworkKey: artwork.key,
			name: artwork.name,
			description: artwork.description,
			width: artwork.width,
			height: artwork.height,
			targetCount: Object.keys(artwork.registry).length
		})),
		limits: {
			maxOperations: LIMITS.maxOperations,
			maxSceneElements: LIMITS.maxSceneElements,
			maxVectorNodes: LIMITS.maxVectorNodes,
			maxTargetRecords: LIMITS.maxTargetRecords
		},
		operations: [
			'add_vector_layer',
			'add_asset',
			'add_node',
			'update_node',
			'duplicate_node',
			'remove_node',
			'set_semantics',
			'update_element',
			'remove_element',
			'set_scene'
		],
		hint: 'Compose with validated primitives and bundled assets, assign semantic groups and pivots, preview the scene patch, then inspect_animation_targets before authoring the timeline.'
	};
}

export interface ScenePreviewInput {
	baseRevision: unknown;
	intent?: unknown;
	operations: unknown;
}

export interface ScenePreviewResult {
	previewId: string;
	expiresAt: string;
	baseRevision: number;
	sourceHash: string;
	resultingHash: string;
	affectedIds: string[];
	elementCount: number;
	vectorNodeCount: number;
	orphanedStepIds: string[];
	warnings: string[];
	summary: string;
}

export async function previewScenePatch(
	input: ScenePreviewInput,
	source: ActivitySource
): Promise<ScenePreviewResult> {
	const activityId = logActivity({
		source,
		action: 'preview_scene_patch',
		purpose: typeof input.intent === 'string' ? input.intent : 'Preview vector scene patch',
		status: 'started'
	});
	try {
		return await withLock('preview_scene_patch', async () => {
			const scene = requireScene();
			if (get(stagedPreview) || get(stagedScenePreview))
				throw new StudioError(
					'PREVIEW_PENDING',
					'a preview is already staged — apply or discard it before previewing composition changes'
				);
			const baseRevision = validateRevision(input.baseRevision);
			const current = get(sceneRevision);
			if (baseRevision !== current)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${current}, you supplied ${baseRevision} — call get_scene and rebuild the patch`,
					{ current, supplied: baseRevision }
				);
			const intent = validateIntent(input.intent);
			const result = applySceneOperations(scene, input.operations);
			const sourceHash = hashValue({
				elements: scene.elements,
				settings: scene.settings,
				name: scene.name
			});
			const resultingHash = hashValue({
				elements: result.scene.elements,
				settings: result.scene.settings,
				name: result.scene.name
			});
			const preview: StagedScenePreview = {
				id: crypto.randomUUID(),
				baseRevision,
				sourceHash,
				resultingHash,
				intent,
				scene: result.scene,
				affectedIds: result.affectedIds,
				orphanedStepIds: result.orphanedStepIds,
				createdAt: Date.now(),
				expiresAt: Date.now() + LIMITS.previewTtlMs,
				source: source === 'agent' ? 'agent' : 'user'
			};
			stagedScenePreview.set(preview);
			playbackIntent.set('end');
			await tick();
			const vectorNodeCount = result.scene.elements
				.filter((element): element is VectorSceneElement => element.type === 'vector')
				.reduce((count, element) => count + element.nodes.length, 0);
			const warnings = result.orphanedStepIds.map(
				(stepId) => `Timeline step "${stepId}" no longer matches a rendered target.`
			);
			const summary = `Staged ${result.operations.length} composition operation${result.operations.length === 1 ? '' : 's'} affecting ${result.affectedIds.length} item${result.affectedIds.length === 1 ? '' : 's'}. Inspect the canvas; call apply_scene_patch with previewId to keep it, or preview again to revise.`;
			updateActivity(activityId, { status: 'succeeded', message: summary });
			return {
				previewId: preview.id,
				expiresAt: new Date(preview.expiresAt).toISOString(),
				baseRevision,
				sourceHash,
				resultingHash,
				affectedIds: result.affectedIds,
				elementCount: result.scene.elements.length,
				vectorNodeCount,
				orphanedStepIds: result.orphanedStepIds,
				warnings,
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

export interface ApplySceneResult {
	sceneRevision: number;
	previousRevision: number;
	affectedIds: string[];
	elementCount: number;
	vectorNodeCount: number;
	undoDepth: number;
	summary: string;
}

export async function applyScenePatch(
	input: { previewId: unknown; baseRevision: unknown },
	source: ActivitySource
): Promise<ApplySceneResult> {
	const activityId = logActivity({
		source,
		action: 'apply_scene_patch',
		purpose: 'Apply staged composition preview',
		status: 'started'
	});
	try {
		return await withLock('apply_scene_patch', async () => {
			const scene = requireScene();
			const preview = get(stagedScenePreview);
			if (typeof input.previewId !== 'string')
				throw new StudioError('INVALID_INPUT', 'previewId: must be a string');
			if (consumedPreviewIds.has(input.previewId))
				throw new StudioError(
					'PREVIEW_ALREADY_USED',
					'that preview was already applied and cannot be reused — call preview_scene_patch again',
					{ previewId: input.previewId }
				);
			if (!preview || preview.id !== input.previewId)
				throw new StudioError(
					'PREVIEW_NOT_FOUND',
					'that composition preview is no longer staged — call preview_scene_patch again',
					{ stagedPreviewId: preview?.id ?? null }
				);
			if (Date.now() > preview.expiresAt) {
				stagedScenePreview.set(null);
				throw new StudioError(
					'PREVIEW_EXPIRED',
					'the preview expired — call preview_scene_patch again'
				);
			}
			const baseRevision = validateRevision(input.baseRevision);
			const current = get(sceneRevision);
			if (preview.baseRevision !== current) {
				stagedScenePreview.set(null);
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene moved to revision ${current} since the preview was staged — call get_scene and preview again`,
					{ current, supplied: baseRevision, previewBase: preview.baseRevision }
				);
			}
			if (baseRevision !== current)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${current}, you supplied ${baseRevision} — retry apply_scene_patch with the preview's baseRevision`,
					{ current, supplied: baseRevision, previewBase: preview.baseRevision }
				);
			pushHistory({
				scene: structuredClone(scene),
				revision: current,
				label: preview.intent || 'composition change',
				at: Date.now()
			});
			studioScene.set(structuredClone(preview.scene));
			const next = bumpRevision();
			markUnsaved();
			markPreviewConsumed(preview.id);
			stagedScenePreview.set(null);
			playbackIntent.set('end');
			const vectorNodeCount = preview.scene.elements
				.filter((element): element is VectorSceneElement => element.type === 'vector')
				.reduce((count, element) => count + element.nodes.length, 0);
			const summary = `Applied "${preview.intent || 'composition change'}" → revision ${next}. Undo is available; call inspect_animation_targets before animating new parts.`;
			updateActivity(activityId, {
				status: 'succeeded',
				message: summary,
				purpose: preview.intent || 'Apply staged composition preview'
			});
			return {
				sceneRevision: next,
				previousRevision: current,
				affectedIds: preview.affectedIds,
				elementCount: preview.scene.elements.length,
				vectorNodeCount,
				undoDepth: historyDepth(),
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

// ─── Preview / apply / undo / save ───────────────────────────

export interface PreviewInput {
	baseRevision: unknown;
	intent?: unknown;
	operations: unknown;
	autoplay?: unknown;
}

export interface PreviewResult {
	previewId: string;
	expiresAt: string;
	baseRevision: number;
	sourceHash: string;
	resultingHash: string;
	affectedStepIds: string[];
	stepCount: number;
	computedDuration: number;
	matchedTargets: Record<string, number>;
	warnings: string[];
	skippedSteps: string[];
	failedSteps: { id: string; error: string }[];
	autoplayed: boolean;
	summary: string;
}

function describeChange(ops: TimelinePatchOperation[]): string {
	const counts: Record<string, number> = {};
	for (const op of ops) counts[op.op] = (counts[op.op] ?? 0) + 1;
	return Object.entries(counts)
		.map(([op, n]) => `${n} ${op.replace('_', ' ')}${n > 1 ? 's' : ''}`)
		.join(', ');
}

export async function previewTimelinePatch(
	input: PreviewInput,
	source: ActivitySource
): Promise<PreviewResult> {
	const activityId = logActivity({
		source,
		action: 'preview_timeline_patch',
		purpose: typeof input.intent === 'string' ? input.intent : 'Preview timeline patch',
		status: 'started'
	});
	try {
		return await withLock('preview_timeline_patch', async () => {
			const scene = requireScene();
			if (get(stagedScenePreview))
				throw new StudioError(
					'PREVIEW_PENDING',
					'a composition preview is staged — apply or discard it before previewing timeline changes'
				);
			const baseRevision = validateRevision(input.baseRevision);
			const current = get(sceneRevision);
			if (baseRevision !== current)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${current}, you supplied ${baseRevision} — call get_scene and rebuild the patch`,
					{
						current,
						supplied: baseRevision
					}
				);
			const intent = validateIntent(input.intent);
			if (input.autoplay !== undefined && typeof input.autoplay !== 'boolean')
				throw new StudioError('INVALID_INPUT', 'autoplay: must be a boolean');
			const autoplay = input.autoplay !== false;

			const ctx = validationContext();
			const ops = validateOperations(input.operations, ctx);
			const patched = applyOperations(scene.timeline, ops);
			const timeline: TimelineDefinition = {
				...patched.timeline,
				steps: patched.timeline.steps.map((step, index) =>
					validateStep(step, `timeline.steps[${index}]`, ctx)
				)
			};
			assertNoConflictingFromTweens(timeline, ctx.registry);
			const affectedStepIds = patched.affectedStepIds;
			const estimate = estimateTimeline(timeline);
			const sourceHash = renderStateHash(scene);
			const resultingHash = renderStateHash(scene, timeline);

			const matchedTargets: Record<string, number> = {};
			for (const step of timeline.steps)
				matchedTargets[step.id] = resolveTargetIds(step.target, ctx.registry).length;

			const wantsPlay = autoplay && !get(reducedMotion);
			const preview: StagedPreview = {
				id: crypto.randomUUID(),
				baseRevision,
				sourceHash,
				resultingHash,
				intent,
				timeline,
				affectedStepIds,
				createdAt: Date.now(),
				expiresAt: Date.now() + LIMITS.previewTtlMs,
				autoplay: wantsPlay,
				source: source === 'agent' ? 'agent' : 'user'
			};

			stagedPreview.set(preview);
			playbackIntent.set(wantsPlay ? 'play' : 'end');

			const diag = await awaitBuild(resultingHash);
			const warnings: string[] = [];
			if (!diag)
				warnings.push('Renderer did not report diagnostics in time; visual result unverified.');
			if (diag && diag.totalDuration > LIMITS.maxTotalDuration) {
				stagedPreview.set(null);
				throw new StudioError(
					'LIMIT_EXCEEDED',
					`rendered timeline runs ${diag.totalDuration.toFixed(2)}s; the maximum is ${LIMITS.maxTotalDuration}s`
				);
			}
			const criticalFailures = diag?.failedSteps.filter((f) => /critical/i.test(f.error)) ?? [];
			if (criticalFailures.length > 0) {
				stagedPreview.set(null);
				throw new StudioError(
					'TARGET_NOT_FOUND',
					`critical step(s) found no targets: ${criticalFailures.map((f) => f.id).join(', ')}`
				);
			}
			for (const id of diag?.skippedSteps ?? [])
				warnings.push(`Step "${id}" matched no rendered elements and was skipped.`);
			if (get(reducedMotion) && autoplay)
				warnings.push(
					'Reduced motion is on in this browser: the preview rendered its final state instead of autoplaying.'
				);

			const summary = `Staged ${describeChange(ops)} (${timeline.steps.length} steps, ~${(diag?.totalDuration ?? estimate.totalDuration).toFixed(2)}s). Watch the canvas; call apply_timeline_patch with previewId to keep it, or preview again to revise.`;
			updateActivity(activityId, { status: 'succeeded', message: summary });
			return {
				previewId: preview.id,
				expiresAt: new Date(preview.expiresAt).toISOString(),
				baseRevision,
				sourceHash,
				resultingHash,
				affectedStepIds,
				stepCount: timeline.steps.length,
				computedDuration: diag?.totalDuration ?? estimate.totalDuration,
				matchedTargets,
				warnings,
				skippedSteps: diag?.skippedSteps ?? [],
				failedSteps: diag?.failedSteps ?? [],
				autoplayed: wantsPlay,
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

export interface ApplyResult {
	sceneRevision: number;
	previousRevision: number;
	affectedStepIds: string[];
	stepCount: number;
	totalDuration: number;
	undoDepth: number;
	summary: string;
}

export async function applyTimelinePatch(
	input: { previewId: unknown; baseRevision: unknown },
	source: ActivitySource
): Promise<ApplyResult> {
	const activityId = logActivity({
		source,
		action: 'apply_timeline_patch',
		purpose: 'Apply staged preview',
		status: 'started'
	});
	try {
		return await withLock('apply_timeline_patch', async () => {
			const scene = requireScene();
			const preview = get(stagedPreview);
			if (typeof input.previewId !== 'string')
				throw new StudioError('INVALID_INPUT', 'previewId: must be a string');
			if (consumedPreviewIds.has(input.previewId))
				throw new StudioError(
					'PREVIEW_ALREADY_USED',
					'that preview was already applied and cannot be reused — call preview_timeline_patch again',
					{ previewId: input.previewId }
				);
			if (!preview || preview.id !== input.previewId)
				throw new StudioError(
					'PREVIEW_NOT_FOUND',
					'that preview is no longer staged — call preview_timeline_patch again',
					{
						stagedPreviewId: preview?.id ?? null
					}
				);
			if (Date.now() > preview.expiresAt) {
				stagedPreview.set(null);
				throw new StudioError(
					'PREVIEW_EXPIRED',
					'the preview expired — call preview_timeline_patch again'
				);
			}
			const baseRevision = validateRevision(input.baseRevision);
			const current = get(sceneRevision);
			if (preview.baseRevision !== current) {
				stagedPreview.set(null);
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene moved to revision ${current} since the preview was staged — call get_scene and preview again`,
					{
						current,
						supplied: baseRevision,
						previewBase: preview.baseRevision
					}
				);
			}
			if (baseRevision !== current)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${current}, you supplied ${baseRevision} — retry apply_timeline_patch with the preview's baseRevision`,
					{ current, supplied: baseRevision, previewBase: preview.baseRevision }
				);

			pushHistory({
				scene: structuredClone(scene),
				revision: current,
				label: preview.intent || 'timeline change',
				at: Date.now()
			});
			const diag = get(buildDiagnostics);
			const total =
				diag?.hash === preview.resultingHash
					? diag.totalDuration
					: estimateTimeline(preview.timeline).totalDuration;
			studioScene.update((s) =>
				s
					? {
							...s,
							timeline: {
								...preview.timeline,
								totalDuration: Math.max(preview.timeline.totalDuration, total)
							},
							duration: Math.max(preview.timeline.totalDuration, total),
							updatedAt: new Date().toISOString()
						}
					: s
			);
			const next = bumpRevision();
			markUnsaved();
			markPreviewConsumed(preview.id);
			stagedPreview.set(null);
			playbackIntent.set(get(reducedMotion) ? 'end' : 'play');
			const summary = `Applied "${preview.intent || 'timeline change'}" → revision ${next}. Undo is available; call save_scene to persist.`;
			updateActivity(activityId, {
				status: 'succeeded',
				message: summary,
				purpose: preview.intent || 'Apply staged preview'
			});
			return {
				sceneRevision: next,
				previousRevision: current,
				affectedStepIds: preview.affectedStepIds,
				stepCount: preview.timeline.steps.length,
				totalDuration: total,
				undoDepth: historyDepth(),
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

export interface UndoResult {
	sceneRevision: number;
	restoredLabel: string;
	stepCount: number;
	totalDuration: number;
	undoDepth: number;
	summary: string;
}

export async function undoLastTimelineChange(source: ActivitySource): Promise<UndoResult> {
	const activityId = logActivity({
		source,
		action: 'undo_last_timeline_change',
		purpose: 'Undo last timeline change',
		status: 'started'
	});
	try {
		return await withLock('undo_last_timeline_change', async () => {
			const scene = requireScene();
			const top = peekHistory();
			if (!top) throw new StudioError('NOTHING_TO_UNDO', 'there is no applied change to undo');
			if (get(stagedPreview) || get(stagedScenePreview)) {
				stagedPreview.set(null);
				stagedScenePreview.set(null);
				logActivity({
					source: 'system',
					action: 'discard_preview',
					purpose: 'Discarded staged preview before undo',
					status: 'succeeded'
				});
			}
			popHistory();
			const restored = structuredClone(top.scene);
			const total = estimateTimeline(restored.timeline).totalDuration;
			restored.duration = Math.max(restored.timeline.totalDuration, total);
			restored.updatedAt = new Date().toISOString();
			studioScene.set(restored);
			const next = bumpRevision();
			markUnsaved();
			playbackIntent.set(get(reducedMotion) ? 'end' : 'play');
			await awaitBuild(renderStateHash(restored), 1500);
			const summary = `Reverted "${top.label}" → revision ${next} (${restored.timeline.steps.length} steps).`;
			updateActivity(activityId, { status: 'succeeded', message: summary });
			void scene;
			return {
				sceneRevision: next,
				restoredLabel: top.label,
				stepCount: restored.timeline.steps.length,
				totalDuration: total,
				undoDepth: historyDepth(),
				summary
			};
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

export interface SaveResult {
	projectId: string;
	name: string;
	savedAt: string;
	sceneRevision: number;
	summary: string;
}

export async function saveScene(
	input: { sceneRevision: unknown; name?: unknown },
	source: ActivitySource
): Promise<SaveResult> {
	const activityId = logActivity({
		source,
		action: 'save_scene',
		purpose: 'Save scene locally',
		status: 'started'
	});
	try {
		return await withLock('save_scene', async () => {
			const scene = requireScene();
			const supplied = validateRevision(input.sceneRevision, 'sceneRevision');
			const current = get(sceneRevision);
			if (supplied !== current)
				throw new StudioError(
					'REVISION_CONFLICT',
					`scene is at revision ${current}, you supplied ${supplied} — call get_scene and confirm before saving`,
					{ current, supplied }
				);
			if (get(stagedPreview) || get(stagedScenePreview))
				throw new StudioError(
					'INVALID_INPUT',
					'a preview is staged but not applied — apply it (or preview nothing) before saving'
				);
			let name = scene.name;
			if (input.name !== undefined) {
				if (
					typeof input.name !== 'string' ||
					input.name.trim() === '' ||
					input.name.length > LIMITS.maxNameLength ||
					/[<>]/.test(input.name)
				)
					throw new StudioError(
						'INVALID_INPUT',
						`name: must be 1–${LIMITS.maxNameLength} plain characters`
					);
				name = input.name.trim();
			}
			const toSave: Scene = { ...scene, name };
			const { projectId, savedAt } = saveProject(toSave);
			studioScene.update((s) => (s ? { ...s, name, updatedAt: savedAt } : s));
			saveState.set({ status: 'saved', savedAt, savedRevision: current, projectId });
			const summary = `Saved "${name}" locally at ${new Date(savedAt).toLocaleTimeString()} (revision ${current}).`;
			updateActivity(activityId, { status: 'succeeded', message: summary });
			return { projectId, name, savedAt, sceneRevision: current, summary };
		});
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

export function discardPreview(source: ActivitySource): void {
	if (!get(stagedPreview) && !get(stagedScenePreview)) return;
	stagedPreview.set(null);
	stagedScenePreview.set(null);
	playbackIntent.set('end');
	logActivity({
		source,
		action: 'discard_preview',
		purpose: 'Discarded staged preview',
		status: 'succeeded'
	});
}

// ─── Human-editor entry points (same validation path as the tools) ──

/** Step editor add/update/remove: validated + committed like an agent apply, in one step. */
export async function commitOperationsFromUI(operations: unknown, label: string): Promise<void> {
	const activityId = logActivity({
		source: 'user',
		action: 'edit_timeline',
		purpose: label,
		status: 'started'
	});
	try {
		await withLock('edit_timeline', async () => {
			const scene = requireScene();
			const ctx = validationContext();
			const ops = validateOperations(operations, ctx);
			const patched = applyOperations(scene.timeline, ops);
			const timeline: TimelineDefinition = {
				...patched.timeline,
				steps: patched.timeline.steps.map((step, index) =>
					validateStep(step, `timeline.steps[${index}]`, ctx)
				)
			};
			assertNoConflictingFromTweens(timeline, ctx.registry);
			const total = estimateTimeline(timeline).totalDuration;
			if (get(stagedPreview) || get(stagedScenePreview)) {
				stagedPreview.set(null);
				stagedScenePreview.set(null);
				logActivity({
					source: 'system',
					action: 'discard_preview',
					purpose: 'Human edit superseded the staged preview',
					status: 'succeeded'
				});
			}
			pushHistory({
				scene: structuredClone(scene),
				revision: get(sceneRevision),
				label,
				at: Date.now()
			});
			studioScene.update((s) =>
				s
					? {
							...s,
							timeline: { ...timeline, totalDuration: Math.max(timeline.totalDuration, total) },
							duration: Math.max(timeline.totalDuration, total),
							updatedAt: new Date().toISOString()
						}
					: s
			);
			bumpRevision();
			markUnsaved();
			playbackIntent.set('end');
		});
		updateActivity(activityId, { status: 'succeeded' });
	} catch (err) {
		updateActivity(activityId, { status: 'rejected', message: toErrorPayload(err).message });
		throw err;
	}
}

/** Spatial property edits (position/scale/rotation/opacity/visible/locked). Not part of timeline undo. */
export function updateElementFromUI(
	elementId: string,
	patch: Partial<Omit<BaseSceneElement, 'id'>>
): void {
	const scene = get(studioScene);
	if (!scene) return;
	if (get(stagedPreview) || get(stagedScenePreview)) discardPreview('system');
	studioScene.set({
		...scene,
		elements: scene.elements.map((el) =>
			el.id === elementId
				? ({
						...el,
						...patch,
						position: { ...el.position, ...(patch.position ?? {}) }
					} as SceneElement)
				: el
		),
		updatedAt: new Date().toISOString()
	});
	bumpRevision();
	markUnsaved();
}

export function renameSceneFromUI(name: string): void {
	const clean = name.trim().slice(0, LIMITS.maxNameLength).replace(/[<>]/g, '');
	if (!clean) return;
	studioScene.update((s) => (s ? { ...s, name: clean } : s));
	bumpRevision();
	markUnsaved();
}

export { LIMITS };
export type { ElementRegistry };
