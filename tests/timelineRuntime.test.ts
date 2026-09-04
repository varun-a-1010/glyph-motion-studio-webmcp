import { describe, expect, it, vi } from 'vitest';
import { createPlaybackController } from '../src/lib/studio/playbackController';
import { buildFromToStartVars } from '../src/lib/studio/timelineBuilder';
import type { TimelineStep } from '../src/lib/types';

describe('timeline runtime safeguards', () => {
	it('uses the same SVG pivot at both ends of a fromTo tween', () => {
		const step: TimelineStep = {
			id: 'contact-pulse',
			target: { type: 'id', value: 'contact-1', scopeToId: 'playground' },
			tweenType: 'fromTo',
			props: {
				fromProps: { scale: 1.35 },
				scale: 1,
				svgOrigin: '420 260'
			},
			duration: 0.3,
			position: 1
		};

		expect(buildFromToStartVars(step)).toEqual({ scale: 1.35, svgOrigin: '420 260' });
	});

	it('preserves an explicitly supplied starting origin', () => {
		const step: TimelineStep = {
			id: 'origin-change',
			target: { type: 'id', value: 'contact-1', scopeToId: 'playground' },
			tweenType: 'fromTo',
			props: {
				fromProps: { scale: 1.35, svgOrigin: '400 240' },
				scale: 1,
				svgOrigin: '420 260'
			},
			duration: 0.3,
			position: 1
		};

		expect(buildFromToStartVars(step)).toEqual({ scale: 1.35, svgOrigin: '400 240' });
	});

	it('pauses a completed timeline when seeking back to the start', () => {
		const pause = vi.fn();
		const timeline = {
			isActive: () => false,
			time: () => 2,
			totalDuration: () => 2,
			progress: () => 1,
			timeScale: () => 1,
			eventCallback: vi.fn(),
			play: vi.fn(),
			pause,
			restart: vi.fn(),
			kill: vi.fn()
		};
		const controller = createPlaybackController(
			timeline as unknown as Parameters<typeof createPlaybackController>[0]
		);

		controller.seek(0);

		expect(pause).toHaveBeenCalledWith(0);
	});
});
