/**
 * Local-first persistence. Projects live in the viewer's browser only; no
 * accounts, no server. Keys are internal and never exposed through tools.
 */
import type { Scene } from '$lib/types';

const PREFIX = 'glyph-motion-studio:project:';

export interface SavedProject {
	projectId: string;
	savedAt: string;
	scene: Scene;
}

function storage(): Storage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

export function saveProject(scene: Scene): { projectId: string; savedAt: string } {
	const store = storage();
	if (!store) throw new Error('Local storage is unavailable in this browser context.');
	const savedAt = new Date().toISOString();
	const projectId = scene.id;
	const record: SavedProject = { projectId, savedAt, scene: { ...scene, updatedAt: savedAt } };
	store.setItem(PREFIX + projectId, JSON.stringify(record));
	return { projectId, savedAt };
}

export function loadProject(sceneId: string): SavedProject | null {
	const store = storage();
	if (!store) return null;
	try {
		const raw = store.getItem(PREFIX + sceneId);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as SavedProject;
		const scene = parsed?.scene;
		if (
			!scene ||
			!Array.isArray(scene.elements) ||
			!scene.timeline ||
			!Array.isArray(scene.timeline.steps)
		)
			return null;
		return parsed;
	} catch {
		return null;
	}
}

export function deleteProject(sceneId: string): void {
	storage()?.removeItem(PREFIX + sceneId);
}
