/**
 * Visible activity log — every tool call and every human action lands here so
 * the user can see exactly what the agent did. Never contains raw SVG,
 * prompts, or stack traces.
 */
import { writable } from 'svelte/store';

export type ActivitySource = 'agent' | 'user' | 'system';
export type ActivityStatus = 'started' | 'succeeded' | 'rejected' | 'cancelled';

export interface ActivityEntry {
	id: string;
	at: number;
	source: ActivitySource;
	action: string;
	purpose: string;
	status: ActivityStatus;
	message?: string;
}

const MAX_ENTRIES = 80;

export const activityLog = writable<ActivityEntry[]>([]);

export function logActivity(entry: Omit<ActivityEntry, 'id' | 'at'>): string {
	const id = crypto.randomUUID();
	activityLog.update((log) => [{ ...entry, id, at: Date.now() }, ...log].slice(0, MAX_ENTRIES));
	return id;
}

export function updateActivity(
	id: string,
	patch: Partial<Pick<ActivityEntry, 'status' | 'message' | 'purpose'>>
) {
	activityLog.update((log) => log.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}
