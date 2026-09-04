<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { openSample } from '$lib/actions/sceneActions';
	import { getSampleScene, SAMPLE_SCENES } from '$lib/samples';
	import { registerStudioTools } from '$lib/webmcp/register';
	import StudioLayout from '$lib/components/StudioLayout.svelte';

	let ready = false;
	let sampleId = SAMPLE_SCENES[0].id;
	let dispose: (() => void) | null = null;

	onMount(() => {
		const wanted = new URLSearchParams(window.location.search).get('scene');
		sampleId = wanted && getSampleScene(wanted) ? wanted : SAMPLE_SCENES[0].id;
		openSample(sampleId);
		ready = true;
		// Tools live for the lifetime of the top-level Studio route.
		dispose = registerStudioTools();
	});

	onDestroy(() => dispose?.());
</script>

<svelte:head>
	<title>Glyph Motion Studio for WebMCP</title>
</svelte:head>

{#if ready}
	<StudioLayout />
{:else}
	<div class="loading">Loading Glyph Motion Studio…</div>
{/if}

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		background: #0f172a;
		color: #94a3b8;
		font-family: system-ui, sans-serif;
	}
</style>
