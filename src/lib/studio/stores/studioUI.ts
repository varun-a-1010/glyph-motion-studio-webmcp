import { writable } from 'svelte/store';

export interface StudioUIState {
	selectedElementId: string | null;
	selectedStepId: string | null;
	highlightedSubElementId: string | null;
}

export const studioUI = writable<StudioUIState>({
	selectedElementId: null,
	selectedStepId: null,
	highlightedSubElementId: null
});
