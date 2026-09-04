/**
 * Wraps a GSAP timeline behind a transport interface. The UI never touches
 * the timeline directly.
 */
import type { PlaybackState } from '$lib/types';
import gsap from './gsapEngine';

export interface PlaybackController {
	play: () => void;
	pause: () => void;
	restart: () => void;
	seek: (time: number) => void;
	scrub: (progress: number) => void;
	setSpeed: (rate: number) => void;
	getState: () => PlaybackState;
	onUpdate: (cb: (state: PlaybackState) => void) => void;
	onComplete: (cb: () => void) => void;
	revert: () => void;
	kill: () => void;
}

export function createPlaybackController(tl: gsap.core.Timeline): PlaybackController {
	let updateCb: ((s: PlaybackState) => void) | null = null;
	let completeCb: (() => void) | null = null;

	function getState(): PlaybackState {
		return {
			playing: tl.isActive(),
			currentTime: tl.time(),
			totalDuration: tl.totalDuration(),
			progress: tl.progress(),
			playbackRate: tl.timeScale()
		};
	}

	const notify = () => updateCb?.(getState());

	tl.eventCallback('onUpdate', notify);
	tl.eventCallback('onComplete', () => {
		completeCb?.();
		notify();
	});

	return {
		play() {
			tl.play();
			notify();
		},
		pause() {
			tl.pause();
			notify();
		},
		restart() {
			tl.restart();
			notify();
		},
		seek(time) {
			// A direct seek is a transport action, not a request to continue
			// playback from the new position. In particular, Home/"go to start"
			// must leave the next Play press ready to play rather than pause.
			tl.pause(time);
			notify();
		},
		scrub(progress) {
			tl.progress(Math.max(0, Math.min(1, progress)));
			tl.pause();
			notify();
		},
		setSpeed(rate) {
			tl.timeScale(rate);
			notify();
		},
		getState,
		onUpdate(cb) {
			updateCb = cb;
		},
		onComplete(cb) {
			completeCb = cb;
		},
		revert() {
			tl.progress(0);
			tl.pause();
			notify();
		},
		kill() {
			try {
				this.revert();
			} catch {
				/* timeline may already be dead */
			}
			updateCb = null;
			completeCb = null;
			tl.kill();
		}
	};
}
