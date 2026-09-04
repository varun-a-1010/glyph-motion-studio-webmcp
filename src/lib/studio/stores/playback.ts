import { writable } from 'svelte/store';
import type { PlaybackState } from '$lib/types';

export const playbackState = writable<PlaybackState>({
	playing: false,
	currentTime: 0,
	totalDuration: 0,
	progress: 0,
	playbackRate: 1
});
