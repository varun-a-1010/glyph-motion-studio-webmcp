import { writable } from 'svelte/store';
import type { Scene } from '$lib/types';
import { LIMITS } from './schema';

export interface HistoryEntry {
	scene: Scene;
	revision: number;
	label: string;
	at: number;
}

const stack: HistoryEntry[] = [];

/** Reactive depth for the UI's Undo button. */
export const undoDepth = writable(0);

export function pushHistory(entry: HistoryEntry): void {
	stack.push(entry);
	while (stack.length > LIMITS.maxUndoDepth) stack.shift();
	undoDepth.set(stack.length);
}

export function popHistory(): HistoryEntry | undefined {
	const e = stack.pop();
	undoDepth.set(stack.length);
	return e;
}

export function peekHistory(): HistoryEntry | undefined {
	return stack[stack.length - 1];
}

export function historyDepth(): number {
	return stack.length;
}

export function clearHistory(): void {
	stack.length = 0;
	undoDepth.set(0);
}
