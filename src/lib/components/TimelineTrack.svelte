<script lang="ts">
	import {
		effectiveScene,
		effectiveTimeline,
		buildDiagnostics,
		stagedPreview
	} from '$lib/studio/stores/scene';
	import { studioUI } from '$lib/studio/stores/studioUI';
	import { playbackState } from '$lib/studio/stores/playback';
	import { estimateTimeline } from '$lib/actions/patch';
	import { hashValue } from '$lib/actions/hash';
	import type { PlaybackController } from '$lib/studio/playbackController';
	import type { StepTiming, TimelineStep } from '$lib/types';

	export let controller: PlaybackController | null = null;

	let scrubberEl: HTMLDivElement;
	let isDragging = false;

	$: timeline = $effectiveTimeline;
	$: timelineHash =
		timeline && $effectiveScene ? hashValue({ elements: $effectiveScene.elements, timeline }) : '';
	$: timings = (() => {
		if (!timeline) return new Map<string, StepTiming>();
		const source =
			$buildDiagnostics && $buildDiagnostics.hash === timelineHash
				? $buildDiagnostics.stepTimings
				: estimateTimeline(timeline).timings;
		return new Map(source.map((t) => [t.stepId, t]));
	})();
	$: duration = Math.max($playbackState.totalDuration || 0, timeline?.totalDuration || 0, 0.5);
	$: progressPercent = (($playbackState.currentTime || 0) / duration) * 100;
	$: affected = new Set($stagedPreview?.affectedStepIds ?? []);

	function handleScrub(e: MouseEvent) {
		if (!scrubberEl || !controller) return;
		const rect = scrubberEl.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		controller.scrub(x / rect.width);
	}
	function onMousedown(e: MouseEvent) {
		isDragging = true;
		handleScrub(e);
	}
	function onMousemove(e: MouseEvent) {
		if (isDragging) handleScrub(e);
	}
	function onMouseup() {
		isDragging = false;
	}

	function togglePlay() {
		if (!controller) return;
		if ($playbackState.progress >= 1) controller.restart();
		else if ($playbackState.playing) controller.pause();
		else controller.play();
	}

	function selectStep(id: string) {
		studioUI.update((s) => ({ ...s, selectedStepId: id }));
	}

	const colors: Record<string, string> = {
		to: '#3b82f6',
		from: '#10b981',
		fromTo: '#8b5cf6',
		set: '#f59e0b',
		drawSVG: '#f97316'
	};

	function stepAffectsElement(step: TimelineStep, elementId: string): boolean {
		if (step.target.scopeToId) return step.target.scopeToId === elementId;
		return true; // unscoped role targets span every element
	}

	function stepTitle(step: TimelineStep): string {
		const t = timings.get(step.id);
		const target = `${step.target.type}:${step.target.value}`;
		return `${step.label ?? step.id}\n${step.tweenType} → ${target}\n${t ? `${t.start.toFixed(2)}s – ${(t.start + t.duration).toFixed(2)}s` : ''}${step.ease ? `\nease ${step.ease}` : ''}`;
	}
</script>

<svelte:window on:mousemove={onMousemove} on:mouseup={onMouseup} />

<div class="timeline-container">
	<div class="transport">
		<div class="btns">
			<button
				class="t-btn play"
				on:click={togglePlay}
				title={$playbackState.playing ? 'Pause (space)' : 'Play (space)'}
				aria-label="Play or pause"
			>
				{$playbackState.playing ? '❚❚' : '▶'}
			</button>
			<button
				class="t-btn"
				on:click={() => controller?.restart()}
				title="Replay from start"
				aria-label="Replay">↺</button
			>
			<button
				class="t-btn"
				on:click={() => controller?.seek(0)}
				title="Go to start"
				aria-label="Go to start">⇤</button
			>
			<button
				class="t-btn"
				on:click={() => {
					controller?.seek(duration);
					controller?.pause();
				}}
				title="Go to end"
				aria-label="Go to end">⇥</button
			>
		</div>
		<div class="time-info">
			<span class="current">{($playbackState.currentTime || 0).toFixed(2)}s</span>
			<span class="sep">/</span>
			<span class="total">{duration.toFixed(2)}s</span>
			{#if $stagedPreview}
				<span class="preview-badge">PREVIEW</span>
			{/if}
		</div>
		<div class="speed-selector" role="group" aria-label="Playback speed">
			{#each [0.25, 0.5, 1, 2] as rate}
				<button
					class:active={$playbackState.playbackRate === rate}
					on:click={() => controller?.setSpeed(rate)}>{rate}x</button
				>
			{/each}
		</div>
	</div>

	<div class="tracks-scroll">
		<div class="ruler-row">
			<div class="track-label ruler-label">GSAP timeline</div>
			<div
				class="scrubber-lane"
				bind:this={scrubberEl}
				on:mousedown={onMousedown}
				role="presentation"
			>
				{#each Array(Math.ceil(duration * 4) + 1) as _, i}
					{@const t = i / 4}
					{#if t <= duration}
						<div class="marker" class:major={i % 4 === 0} style="left: {(t / duration) * 100}%">
							{#if i % 4 === 0}<span>{t}s</span>{/if}
						</div>
					{/if}
				{/each}
				<div class="playhead" style="left: {progressPercent}%"></div>
			</div>
		</div>

		{#if timeline && timeline.steps.length === 0}
			<div class="empty-track">
				No steps yet. Ask your agent for an entrance, or add a step in the editor.
			</div>
		{/if}

		{#each $effectiveScene?.elements ?? [] as el (el.id)}
			{@const steps = (timeline?.steps ?? []).filter((s) => stepAffectsElement(s, el.id))}
			{#each steps as step, row (step.id)}
				{@const t = timings.get(step.id)}
				<div class="track-row">
					<div class="track-label" title={stepTitle(step)}>
						<span class="row-target"
							>{step.target.type === 'id'
								? step.target.value
								: `${step.target.type}:${step.target.value}`}</span
						>
						<span class="row-label">{step.label ?? step.id}</span>
					</div>
					<div
						class="track-content"
						on:mousedown|self={() => studioUI.update((s) => ({ ...s, selectedStepId: null }))}
						role="presentation"
					>
						<div class="playhead-line" style="left: {progressPercent}%"></div>
						<button
							class="step-block"
							class:selected={$studioUI.selectedStepId === step.id}
							class:preview={!!$stagedPreview}
							class:affected={affected.has(step.id)}
							on:mousedown|stopPropagation={() => selectStep(step.id)}
							title={stepTitle(step)}
							style="left: {((t?.start ?? 0) / duration) * 100}%; width: {Math.max(
								((t?.duration ?? step.duration) / duration) * 100,
								0.6
							)}%; background: {colors[step.tweenType] ?? '#64748b'};"
						>
							<span class="step-label">{step.tweenType}{step.stagger ? ' ⋯' : ''}</span>
						</button>
					</div>
				</div>
			{/each}
		{/each}
	</div>
</div>

<style>
	.timeline-container {
		background: #1e293b;
		border-top: 1px solid #334155;
		display: flex;
		flex-direction: column;
		height: 260px;
		flex-shrink: 0;
	}
	.transport {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		border-bottom: 1px solid #334155;
		gap: 12px;
	}
	.btns {
		display: flex;
		gap: 4px;
	}
	.t-btn {
		background: #334155;
		border: none;
		color: #fff;
		padding: 4px 10px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		line-height: 18px;
	}
	.t-btn.play {
		background: #3b82f6;
		min-width: 44px;
	}
	.t-btn:hover {
		filter: brightness(1.15);
	}
	.time-info {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12px;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.time-info .current {
		color: #fff;
	}
	.time-info .sep,
	.time-info .total {
		color: #64748b;
	}
	.preview-badge {
		margin-left: 8px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: #0f172a;
		background: #fbbf24;
		padding: 2px 6px;
		border-radius: 3px;
	}
	.speed-selector {
		display: flex;
		gap: 2px;
	}
	.speed-selector button {
		background: none;
		border: 1px solid #334155;
		color: #64748b;
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 3px;
		cursor: pointer;
	}
	.speed-selector button.active {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #fff;
	}
	.tracks-scroll {
		flex: 1;
		overflow-y: auto;
		position: relative;
	}
	.ruler-row {
		display: flex;
		position: sticky;
		top: 0;
		z-index: 20;
		background: #0f172a;
	}
	.ruler-label {
		background: #0f172a !important;
	}
	.scrubber-lane {
		flex: 1;
		height: 22px;
		background: #0f172a;
		position: relative;
		cursor: crosshair;
	}
	.marker {
		position: absolute;
		top: 12px;
		bottom: 0;
		border-left: 1px solid #1f2b3f;
		pointer-events: none;
	}
	.marker.major {
		top: 0;
		border-left-color: #334155;
	}
	.marker span {
		font-size: 9px;
		color: #64748b;
		padding-left: 3px;
	}
	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: #ef4444;
		z-index: 25;
		pointer-events: none;
	}
	.playhead::after {
		content: '';
		position: absolute;
		top: 0;
		left: -4px;
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-top: 7px solid #ef4444;
	}
	.playhead-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: rgba(239, 68, 68, 0.35);
		pointer-events: none;
		z-index: 4;
	}
	.empty-track {
		padding: 18px;
		color: #64748b;
		font-size: 12px;
		font-style: italic;
	}
	.track-row {
		display: flex;
		height: 32px;
		border-bottom: 1px solid #263243;
	}
	.track-label {
		width: 200px;
		flex-shrink: 0;
		padding: 4px 10px;
		font-size: 11px;
		color: #94a3b8;
		background: #1e293b;
		border-right: 1px solid #334155;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1px;
	}
	.row-target {
		color: #c4b5fd;
		font-family: ui-monospace, Menlo, monospace;
		font-size: 10px;
	}
	.row-label {
		color: #64748b;
		font-size: 10px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track-content {
		flex: 1;
		position: relative;
		background: rgba(15, 23, 42, 0.25);
	}
	.step-block {
		position: absolute;
		top: 5px;
		bottom: 5px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 6px;
		padding: 0;
		overflow: hidden;
		z-index: 5;
	}
	.step-block.preview {
		border-style: dashed;
		border-color: rgba(251, 191, 36, 0.6);
	}
	.step-block.affected {
		box-shadow: 0 0 0 2px #fbbf24;
	}
	.step-block.selected {
		border: 2px solid #fff;
		box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
		z-index: 6;
	}
	.step-label {
		font-size: 8px;
		color: #fff;
		font-weight: 800;
		text-transform: uppercase;
		padding: 0 4px;
		white-space: nowrap;
	}
</style>
