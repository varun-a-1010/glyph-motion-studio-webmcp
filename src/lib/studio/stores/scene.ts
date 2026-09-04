/**
 * Single source of truth for the editor. Human controls and WebMCP tools both
 * mutate the scene ONLY through `$lib/actions/sceneActions` — never directly.
 */
import { writable, derived } from 'svelte/store';
import type { BuildDiagnostics, ElementRegistry, Scene, TimelineDefinition } from '$lib/types';

export const studioScene = writable<Scene | null>(null);
/** Bundled workspace currently open in the editor. */
export const activeSampleId = writable<string | null>(null);

/** Monotonic revision, incremented on every committed scene change. */
export const sceneRevision = writable<number>(0);

/** Per-element namespaced registries, populated by the rendering loop. */
export const elementRegistries = writable<Record<string, ElementRegistry>>({});

export const combinedRegistry = derived(elementRegistries, ($registries) => {
	const combined: ElementRegistry = {};
	for (const registry of Object.values($registries)) Object.assign(combined, registry);
	return combined;
});

export interface StagedPreview {
	id: string;
	baseRevision: number;
	sourceHash: string;
	resultingHash: string;
	intent: string;
	timeline: TimelineDefinition;
	affectedStepIds: string[];
	createdAt: number;
	expiresAt: number;
	autoplay: boolean;
	source: 'agent' | 'user';
}

/** A validated-but-uncommitted timeline the canvas is currently rendering. */
export const stagedPreview = writable<StagedPreview | null>(null);

export interface StagedScenePreview {
	id: string;
	baseRevision: number;
	sourceHash: string;
	resultingHash: string;
	intent: string;
	scene: Scene;
	affectedIds: string[];
	orphanedStepIds: string[];
	createdAt: number;
	expiresAt: number;
	source: 'agent' | 'user';
}

/** A validated-but-uncommitted composition the canvas is currently rendering. */
export const stagedScenePreview = writable<StagedScenePreview | null>(null);

/** The scene the canvas should render: a composition preview wins while staged. */
export const effectiveScene = derived(
	[studioScene, stagedScenePreview],
	([$scene, $preview]) => $preview?.scene ?? $scene
);

/** The timeline the renderer should build: either preview kind can supply it. */
export const effectiveTimeline = derived(
	[effectiveScene, stagedPreview],
	([$scene, $preview]) => $preview?.timeline ?? $scene?.timeline ?? null
);

/** Set by the renderer after every GSAP build. Tools await this to report real diagnostics. */
export const buildDiagnostics = writable<BuildDiagnostics | null>(null);

/** One-shot instruction for the renderer after the next build. */
export const playbackIntent = writable<'play' | 'end' | null>(null);

export interface SaveState {
	status: 'unsaved' | 'saved';
	savedAt: string | null;
	savedRevision: number | null;
	projectId: string | null;
}

export const saveState = writable<SaveState>({
	status: 'unsaved',
	savedAt: null,
	savedRevision: null,
	projectId: null
});

export const reducedMotion = writable<boolean>(false);

export interface WebMcpStatus {
	supported: boolean;
	api: 'navigator.modelContext' | 'document.modelContext' | null;
	registeredTools: string[];
	error: string | null;
}

export const webmcpStatus = writable<WebMcpStatus>({
	supported: false,
	api: null,
	registeredTools: [],
	error: null
});
