<script lang="ts">
	import { afterUpdate } from 'svelte';
	import type { RenderedElement } from '$lib/types';
	import { studioUI } from '$lib/studio/stores/studioUI';
	import { transformBounds } from '$lib/studio/bounds';

	export let elements: RenderedElement[] = [];
	export let backgroundColor = '#0f172a';
	export let canvasRef: HTMLDivElement | undefined = undefined;
	export let width = 1280;
	export let height = 720;

	let containerWidth = 0;
	let containerHeight = 0;

	$: scale = Math.min(containerWidth / width || 1, containerHeight / height || 1);

	function selectElement(id: string) {
		studioUI.update((s) => ({ ...s, selectedElementId: id }));
	}

	function deselect(e: MouseEvent) {
		if (e.target === e.currentTarget) studioUI.update((s) => ({ ...s, selectedElementId: null }));
	}

	let highlightOverlay: SVGRectElement | null = null;
	$: highlightId = $studioUI.highlightedSubElementId;

	afterUpdate(() => {
		if (highlightOverlay) {
			highlightOverlay.remove();
			highlightOverlay = null;
		}
		if (!highlightId || !canvasRef) return;
		const target = canvasRef.querySelector(`#${CSS.escape(highlightId)}`);
		if (!target || !(target instanceof SVGGraphicsElement)) return;
		try {
			const matrix = target.getCTM();
			if (!matrix) return;
			const bbox = transformBounds(target.getBBox(), matrix);
			const svg = target.closest('svg');
			if (!svg) return;
			const pad = 4;
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', String(bbox.x - pad));
			rect.setAttribute('y', String(bbox.y - pad));
			rect.setAttribute('width', String(bbox.width + pad * 2));
			rect.setAttribute('height', String(bbox.height + pad * 2));
			rect.setAttribute('rx', '3');
			rect.setAttribute('fill', 'rgba(245, 158, 11, 0.15)');
			rect.setAttribute('stroke', '#f59e0b');
			rect.setAttribute('stroke-width', '2');
			rect.setAttribute('pointer-events', 'none');
			rect.classList.add('sub-highlight-overlay');
			svg.appendChild(rect);
			highlightOverlay = rect;
		} catch {
			/* getBBox can throw on hidden elements */
		}
	});
</script>

<div
	class="canvas-container"
	role="presentation"
	bind:clientWidth={containerWidth}
	bind:clientHeight={containerHeight}
	on:mousedown={deselect}
	style="background: {backgroundColor};"
>
	<div
		class="scene-canvas"
		bind:this={canvasRef}
		style="width: {width}px; height: {height}px; transform: translate(-50%, -50%) scale({scale});"
	>
		{#each elements as el (el.id)}
			<div
				id="el-{el.id}"
				class="element-wrapper"
				role="button"
				tabindex="0"
				class:selected={$studioUI.selectedElementId === el.id}
				on:mousedown|stopPropagation={() => selectElement(el.id)}
				on:keydown|stopPropagation={(e) => {
					if (e.key === 'Enter' || e.key === ' ') selectElement(el.id);
				}}
				style="left: {el.position.x}px; top: {el.position
					.y}px; transform: translate(-50%, -50%) rotate({el.rotation}deg) scale({el.scale}); opacity: {el.opacity}; z-index: {el.order}; display: {el.visible
					? 'block'
					: 'none'};"
			>
				{#if el.renderedSvg}
					{@html el.renderedSvg}
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.canvas-container {
		flex: 1;
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		min-height: 240px;
	}
	.scene-canvas {
		position: absolute;
		left: 50%;
		top: 50%;
		transform-origin: center center;
		background: transparent;
	}
	.element-wrapper {
		position: absolute;
		cursor: pointer;
		outline: 2px solid transparent;
		transition: outline 0.1s;
	}
	.element-wrapper:hover {
		outline: 2px solid rgba(59, 130, 246, 0.4);
	}
	.element-wrapper.selected {
		outline: 2px solid #3b82f6;
	}
	.element-wrapper :global(svg) {
		display: block;
	}
	.scene-canvas :global(.sub-highlight-overlay) {
		animation: highlight-pulse 0.6s ease-in-out infinite alternate;
	}
	@keyframes highlight-pulse {
		from {
			stroke: #f59e0b;
			fill: rgba(245, 158, 11, 0.12);
		}
		to {
			stroke: #fbbf24;
			fill: rgba(251, 191, 36, 0.25);
		}
	}
</style>
