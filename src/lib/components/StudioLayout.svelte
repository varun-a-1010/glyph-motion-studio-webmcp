<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import {
		activeSampleId,
		studioScene,
		sceneRevision,
		elementRegistries,
		combinedRegistry,
		effectiveScene,
		effectiveTimeline,
		stagedScenePreview,
		stagedPreview,
		buildDiagnostics,
		playbackIntent,
		saveState,
		reducedMotion
	} from '$lib/studio/stores/scene';
	import { playbackState } from '$lib/studio/stores/playback';
	import { studioUI } from '$lib/studio/stores/studioUI';
	import { undoDepth } from '$lib/actions/history';
	import {
		applyTimelinePatch,
		applyScenePatch,
		discardPreview,
		resetSample,
		saveScene,
		setBoundsProvider,
		renderStateHash,
		switchScene,
		undoLastTimelineChange
	} from '$lib/actions/sceneActions';
	import { toErrorPayload } from '$lib/actions/errors';
	import { splitNamespacedId } from '$lib/studio/namespacing';
	import { transformBounds } from '$lib/studio/bounds';
	import { SAMPLE_SCENES } from '$lib/samples';
	import { assembleSceneElement } from '$lib/studio/sceneAssembly';
	import { buildTimeline } from '$lib/studio/timelineBuilder';
	import {
		createPlaybackController,
		type PlaybackController
	} from '$lib/studio/playbackController';
	import type { ElementRegistry, RenderedElement, SceneElement } from '$lib/types';
	import SceneCanvas from './SceneCanvas.svelte';
	import TimelineTrack from './TimelineTrack.svelte';
	import PropertiesPanel from './PropertiesPanel.svelte';
	import StepEditor from './StepEditor.svelte';
	import ActivityPanel from './ActivityPanel.svelte';
	import WebMcpChip from './WebMcpChip.svelte';

	let canvasRef: HTMLDivElement | undefined;
	let controller: PlaybackController | null = null;
	let cleanupFn: (() => void) | null = null;
	let renderedElements: RenderedElement[] = [];
	let rebuilding = false;
	let rebuildGen = 0;
	let lastHash = '';
	let timelineError: string | null = null;
	let flash: string | null = null;
	let rightTab: 'edit' | 'activity' = 'activity';

	// ─── Assembly: artwork + namespacing → rendered elements + registries ──
	function assemble(elements: SceneElement[]): RenderedElement[] {
		const regs: Record<string, ElementRegistry> = {};
		const out = elements.map((el) => {
			const assembled = assembleSceneElement(el);
			if (!assembled) return el;
			regs[el.id] = assembled.registry;
			return assembled.element;
		});
		elementRegistries.set(regs);
		return out;
	}

	$: if ($effectiveScene && !rebuilding) renderedElements = assemble($effectiveScene.elements);

	// ─── Rebuild the GSAP timeline whenever the effective timeline's content changes ──
	$: {
		const tl = $effectiveTimeline;
		const h = tl && $effectiveScene ? renderStateHash($effectiveScene, tl) : '';
		if (h !== lastHash) {
			lastHash = h;
			if (h) void rebuild(h);
		}
	}

	async function rebuild(hash: string) {
		const gen = ++rebuildGen;
		rebuilding = true;
		timelineError = null;
		controller?.kill();
		controller = null;
		cleanupFn?.();
		cleanupFn = null;
		// Full DOM teardown so GSAP's inline styles from the previous timeline vanish.
		renderedElements = [];
		await tick();
		if (gen !== rebuildGen) return;
		const scene = get(effectiveScene);
		if (!scene) {
			rebuilding = false;
			return;
		}
		renderedElements = assemble(scene.elements);
		await tick();
		if (gen !== rebuildGen) return;
		const tl = get(effectiveTimeline);
		if (!tl || !canvasRef || !canvasRef.querySelector('svg')) {
			rebuilding = false;
			return;
		}

		const result = buildTimeline(tl, get(combinedRegistry), canvasRef);
		cleanupFn = result.cleanup;
		controller = createPlaybackController(result.timeline);
		controller.onUpdate((s) => playbackState.set(s));
		controller.onComplete(() => playbackState.update((s) => ({ ...s, playing: false })));

		const rate = get(playbackState).playbackRate;
		if (rate !== 1) result.timeline.timeScale(rate);

		const critical = result.failedSteps.filter((f) => /critical/i.test(f.error));
		if (critical.length)
			timelineError = `Critical step(s) found no targets: ${critical.map((f) => f.id).join(', ')}`;

		const intent = get(playbackIntent);
		playbackIntent.set(null);
		if (intent === 'play' && !get(reducedMotion)) {
			result.timeline.play(0);
		} else {
			result.timeline.progress(1);
			result.timeline.pause();
		}
		playbackState.set(controller.getState());

		buildDiagnostics.set({
			hash,
			totalDuration: result.timeline.totalDuration(),
			skippedSteps: result.skippedSteps,
			failedSteps: result.failedSteps,
			stepTimings: result.stepTimings
		});
		rebuilding = false;
	}

	// Playback intent that arrives without a content change (e.g. apply of an identical preview)
	$: if (controller && !rebuilding && $playbackIntent && $buildDiagnostics?.hash === lastHash) {
		const intent = $playbackIntent;
		playbackIntent.set(null);
		if (intent === 'play' && !$reducedMotion) controller.restart();
		else {
			controller.seek($playbackState.totalDuration);
			controller.pause();
		}
	}

	// ─── Bounds for inspect_animation_targets ──
	onMount(() => {
		setBoundsProvider((id) => {
			const el = canvasRef?.querySelector(`#${CSS.escape(id)}`);
			if (!el || !(el instanceof SVGGraphicsElement)) return null;
			try {
				const matrix = el.getCTM();
				if (!matrix) return null;
				const b = transformBounds(el.getBBox(), matrix);
				return {
					x: r(b.x),
					y: r(b.y),
					width: r(b.width),
					height: r(b.height),
					cx: r(b.cx),
					cy: r(b.cy)
				};
			} catch {
				return null;
			}
		});

		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion.set(mq.matches);
		const onChange = (e: MediaQueryListEvent) => reducedMotion.set(e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	const r = (n: number) => Math.round(n * 10) / 10;

	onDestroy(() => {
		controller?.kill();
		cleanupFn?.();
		setBoundsProvider(null);
	});

	// ─── Header actions ──
	async function handleUndo() {
		try {
			await undoLastTimelineChange('user');
		} catch (err) {
			showFlash(toErrorPayload(err).message);
		}
	}
	async function handleSave() {
		try {
			const res = await saveScene({ sceneRevision: $sceneRevision }, 'user');
			showFlash(res.summary);
		} catch (err) {
			showFlash(toErrorPayload(err).message);
		}
	}
	async function handleApplyPreview() {
		const p = $stagedPreview;
		try {
			if (p) {
				await applyTimelinePatch({ previewId: p.id, baseRevision: p.baseRevision }, 'user');
			} else if ($stagedScenePreview) {
				await applyScenePatch(
					{
						previewId: $stagedScenePreview.id,
						baseRevision: $stagedScenePreview.baseRevision
					},
					'user'
				);
			}
		} catch (err) {
			showFlash(toErrorPayload(err).message);
		}
	}
	function handleReset() {
		const sampleId = $activeSampleId;
		if (!sampleId) return;
		if (!confirm('Reset this scene to its baseline and delete the locally saved project?')) return;
		resetSample(sampleId);
	}
	async function switchSample(id: string, select: HTMLSelectElement) {
		if (id === $activeSampleId) return;
		const hasPendingWork = unsaved || Boolean($stagedPreview || $stagedScenePreview);
		if (
			hasPendingWork &&
			!confirm('Switch scenes and discard the current unapplied preview or unsaved changes?')
		) {
			select.value = $activeSampleId ?? '';
			return;
		}
		try {
			await switchScene(
				{
					sceneId: id,
					baseRevision: $sceneRevision,
					discardCurrentChanges: hasPendingWork
				},
				'user'
			);
		} catch (err) {
			select.value = $activeSampleId ?? '';
			showFlash(toErrorPayload(err).message);
		}
	}
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	function showFlash(msg: string) {
		flash = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 3500);
	}

	function onKeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (
			t &&
			(t.tagName === 'INPUT' ||
				t.tagName === 'SELECT' ||
				t.tagName === 'TEXTAREA' ||
				t.isContentEditable)
		)
			return;
		if (e.key === ' ') {
			e.preventDefault();
			if (!controller) return;
			if ($playbackState.progress >= 1) controller.restart();
			else if ($playbackState.playing) controller.pause();
			else controller.play();
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
			e.preventDefault();
			void handleUndo();
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			void handleSave();
		} else if (e.key === 'Home' && controller) {
			controller.seek(0);
		}
	}

	$: unsaved = $saveState.status !== 'saved' || $saveState.savedRevision !== $sceneRevision;
	$: if (typeof window !== 'undefined' && $activeSampleId) {
		const url = new URL(window.location.href);
		if (url.searchParams.get('scene') !== $activeSampleId) {
			url.searchParams.set('scene', $activeSampleId);
			history.replaceState(null, '', url);
		}
	}

	// Targets tree for the left panel
	$: targetTree = Object.entries($combinedRegistry).map(([ns, meta]) => ({
		...meta,
		ns,
		local: splitNamespacedId(ns).local,
		group: splitNamespacedId(meta.group).local
	}));
	function highlight(ns: string | null) {
		studioUI.update((s) => ({ ...s, highlightedSubElementId: ns }));
	}
</script>

<svelte:window on:keydown={onKeydown} />

<div class="studio-layout">
	<header class="studio-header">
		<div class="brand">
			<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"
				><rect width="64" height="64" rx="14" fill="#1e1b4b" /><path
					d="M40 20a14 14 0 1 0 6 11.5"
					fill="none"
					stroke="#a78bfa"
					stroke-width="7"
					stroke-linecap="round"
				/><rect x="33" y="29" width="15" height="7" rx="2" fill="#c4b5fd" /></svg
			>
			<span class="brand-name">Glyph Motion Studio</span>
		</div>
		<select
			class="scene-select"
			value={$activeSampleId ?? ''}
			on:change={(e) => void switchSample(e.currentTarget.value, e.currentTarget)}
			aria-label="Scene"
		>
			{#each SAMPLE_SCENES as s}<option value={s.id}>{s.name}</option>{/each}
		</select>
		<span class="revision" title="sceneRevision — agents echo this back on every mutation"
			>rev {$sceneRevision}</span
		>
		{#if $reducedMotion}<span
				class="rm-badge"
				title="prefers-reduced-motion is on: previews render their final state instead of autoplaying"
				>reduced motion</span
			>{/if}
		<div class="spacer"></div>
		{#if flash}<span class="flash">{flash}</span>{/if}
		<WebMcpChip />
		<button
			class="hbtn"
			on:click={handleUndo}
			disabled={$undoDepth === 0}
			title="Undo last timeline change (⌘Z)"
			>↶ Undo{#if $undoDepth}<span class="count">{$undoDepth}</span>{/if}</button
		>
		<button
			class="hbtn primary"
			on:click={handleSave}
			disabled={!unsaved || !!$stagedPreview || !!$stagedScenePreview}
			title="Save locally (⌘S)">{unsaved ? 'Save' : 'Saved'}</button
		>
		<span class="save-status" class:dirty={unsaved}
			>{unsaved
				? 'Unsaved changes'
				: $saveState.projectId
					? `Saved ${$saveState.savedAt ? new Date($saveState.savedAt).toLocaleTimeString() : ''}`
					: 'Baseline'}</span
		>
		<button class="hbtn subtle" on:click={handleReset} title="Reset to the sample baseline"
			>Reset</button
		>
	</header>

	<div class="studio-body">
		<aside class="panel left-panel">
			<div class="panel-header">Elements</div>
			<div class="panel-content">
				{#each $effectiveScene?.elements ?? [] as element (element.id)}
					<button
						class="layer-item"
						class:active={$studioUI.selectedElementId === element.id}
						on:click={() => studioUI.update((s) => ({ ...s, selectedElementId: element.id }))}
					>
						<span class="layer-icon">◆</span><span class="layer-name">{element.name}</span>
					</button>
				{/each}
			</div>
			<div class="panel-header">Animation targets</div>
			<div class="panel-content targets">
				{#each targetTree as t (t.ns)}
					<button
						class="target-row"
						class:hl={$studioUI.highlightedSubElementId === t.ns}
						on:mouseenter={() => highlight(t.ns)}
						on:mouseleave={() => highlight(null)}
						on:focus={() => highlight(t.ns)}
						on:blur={() => highlight(null)}
						title={`${t.label ?? t.local} — role ${t.role}, group ${t.group}`}
					>
						<span class="t-id">{t.local}</span>
						<span class="t-role role-{t.role}">{t.role}</span>
					</button>
				{/each}
			</div>
		</aside>

		<main class="center-area">
			{#if $stagedPreview || $stagedScenePreview}
				<div class="preview-banner">
					<span class="pb-tag"
						>{($stagedPreview?.source ?? $stagedScenePreview?.source) === 'agent'
							? 'Agent preview'
							: 'Preview'}</span
					>
					<span class="pb-intent"
						>{$stagedPreview?.intent || $stagedScenePreview?.intent || 'Staged change'}</span
					>
					<span class="pb-meta"
						>{#if $stagedPreview}{$stagedPreview.affectedStepIds.length} step{$stagedPreview
								.affectedStepIds.length === 1
								? ''
								: 's'} touched{:else}{$stagedScenePreview?.affectedIds.length ?? 0} composition item{($stagedScenePreview
								?.affectedIds.length ?? 0) === 1
								? ''
								: 's'} touched{/if}
						· not applied</span
					>
					<div class="pb-actions">
						{#if $stagedPreview}<button class="hbtn" on:click={() => controller?.restart()}
								>Replay</button
							>{/if}
						<button class="hbtn primary" on:click={handleApplyPreview}>Apply</button>
						<button class="hbtn subtle" on:click={() => discardPreview('user')}>Discard</button>
					</div>
				</div>
			{/if}
			{#if timelineError}
				<div class="timeline-error">⚠ {timelineError}</div>
			{/if}
			<SceneCanvas
				elements={renderedElements}
				backgroundColor={$effectiveScene?.settings.backgroundColor ?? '#0f172a'}
				width={$effectiveScene?.settings.width ?? 1280}
				height={$effectiveScene?.settings.height ?? 720}
				bind:canvasRef
			/>
			<TimelineTrack {controller} />
		</main>

		<aside class="panel right-panel">
			<div class="panel-section properties-section">
				<div class="panel-header">Placement</div>
				<PropertiesPanel />
			</div>
			<div class="tabs">
				<button class:active={rightTab === 'activity'} on:click={() => (rightTab = 'activity')}
					>Agent activity</button
				>
				<button class:active={rightTab === 'edit'} on:click={() => (rightTab = 'edit')}
					>Step editor</button
				>
			</div>
			<div class="panel-section grow">
				{#if rightTab === 'activity'}
					<ActivityPanel />
				{:else}
					<StepEditor />
				{/if}
			</div>
		</aside>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #0f172a;
		color: #e2e8f0;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}
	.studio-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #0f172a;
		color: #e2e8f0;
	}
	.studio-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 14px;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		min-height: 46px;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.brand-name {
		font-weight: 700;
		font-size: 14px;
		letter-spacing: 0.01em;
	}
	.scene-select {
		background: #0f172a;
		border: 1px solid #334155;
		color: #e2e8f0;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
	}
	.revision {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 11px;
		color: #94a3b8;
		background: #0f172a;
		border: 1px solid #334155;
		padding: 3px 7px;
		border-radius: 999px;
	}
	.rm-badge {
		font-size: 10px;
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.4);
		padding: 2px 7px;
		border-radius: 999px;
	}
	.spacer {
		flex: 1;
	}
	.flash {
		font-size: 11px;
		color: #a7f3d0;
		max-width: 360px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hbtn {
		background: #334155;
		border: 1px solid #475569;
		color: #e2e8f0;
		padding: 5px 10px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.hbtn:hover:not(:disabled) {
		filter: brightness(1.15);
	}
	.hbtn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.hbtn.primary {
		background: #3b82f6;
		border-color: #3b82f6;
	}
	.hbtn.subtle {
		background: transparent;
		border-color: #334155;
		color: #94a3b8;
	}
	.hbtn .count {
		background: #0f172a;
		border-radius: 999px;
		padding: 0 6px;
		font-size: 10px;
	}
	.save-status {
		font-size: 11px;
		color: #4ade80;
	}
	.save-status.dirty {
		color: #fbbf24;
	}
	.studio-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}
	.panel {
		width: 230px;
		background: #1e293b;
		border-right: 1px solid #334155;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		overflow: hidden;
	}
	.right-panel {
		width: 300px;
		border-right: none;
		border-left: 1px solid #334155;
	}
	.panel-header {
		padding: 8px 12px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #94a3b8;
		border-bottom: 1px solid #334155;
		border-top: 1px solid #334155;
	}
	.panel-content {
		padding: 6px;
		overflow-y: auto;
	}
	.panel-content.targets {
		flex: 1;
	}
	.layer-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		background: none;
		border-radius: 6px;
		font-size: 13px;
		color: #94a3b8;
		cursor: pointer;
		text-align: left;
	}
	.layer-item:hover {
		background: #334155;
	}
	.layer-item.active {
		background: rgba(59, 130, 246, 0.15);
		color: #60a5fa;
	}
	.target-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		background: none;
		border-radius: 4px;
		cursor: default;
		text-align: left;
		color: #cbd5e1;
	}
	.target-row:hover,
	.target-row.hl {
		background: rgba(245, 158, 11, 0.12);
	}
	.t-id {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.t-role {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 5px;
		border-radius: 3px;
		background: #334155;
		color: #94a3b8;
		flex-shrink: 0;
	}
	.role-primary {
		color: #c4b5fd;
	}
	.role-accent {
		color: #fbbf24;
	}
	.role-secondary {
		color: #7dd3fc;
	}
	.center-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}
	.preview-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: rgba(251, 191, 36, 0.1);
		border-bottom: 1px solid rgba(251, 191, 36, 0.35);
		font-size: 12px;
		flex-wrap: wrap;
	}
	.pb-tag {
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: #fbbf24;
		color: #0f172a;
		padding: 2px 6px;
		border-radius: 3px;
	}
	.pb-intent {
		color: #fde68a;
		font-weight: 600;
	}
	.pb-meta {
		color: #94a3b8;
	}
	.pb-actions {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
	.timeline-error {
		padding: 8px 14px;
		background: rgba(239, 68, 68, 0.15);
		border-bottom: 1px solid rgba(239, 68, 68, 0.4);
		color: #fca5a5;
		font-size: 12px;
	}
	.panel-section {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.panel-section.grow {
		flex: 1;
		overflow-y: auto;
	}
	.properties-section .panel-header {
		border-top: none;
	}
	.tabs {
		display: flex;
		border-top: 1px solid #334155;
		border-bottom: 1px solid #334155;
	}
	.tabs button {
		flex: 1;
		background: none;
		border: none;
		color: #64748b;
		padding: 8px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tabs button.active {
		color: #e2e8f0;
		border-bottom-color: #3b82f6;
	}
	@media (max-width: 1000px) {
		.left-panel {
			display: none;
		}
		.right-panel {
			width: 260px;
		}
	}
</style>
