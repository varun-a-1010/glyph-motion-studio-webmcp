<script lang="ts">
	import { studioScene } from '$lib/studio/stores/scene';
	import { studioUI } from '$lib/studio/stores/studioUI';
	import { updateElementFromUI } from '$lib/actions/sceneActions';

	$: selectedId = $studioUI.selectedElementId;
	$: element = $studioScene?.elements.find((el) => el.id === selectedId);

	function num(e: Event): number {
		return Number((e.currentTarget as HTMLInputElement).value);
	}
</script>

<div class="properties-panel">
	{#if element}
		<header>
			<h3>{element.name}</h3>
			<span class="type-badge">{element.type === 'svg' ? element.artworkKey : 'agent vector'}</span>
		</header>
		<div class="compact-grid">
			<label class="input-field"
				><span>X</span><input
					type="number"
					step="10"
					value={element.position.x}
					on:change={(e) =>
						updateElementFromUI(element.id, { position: { x: num(e), y: element.position.y } })}
				/></label
			>
			<label class="input-field"
				><span>Y</span><input
					type="number"
					step="10"
					value={element.position.y}
					on:change={(e) =>
						updateElementFromUI(element.id, { position: { x: element.position.x, y: num(e) } })}
				/></label
			>
			<label class="input-field"
				><span>S</span><input
					type="number"
					min="0.1"
					max="10"
					step="0.1"
					value={element.scale}
					on:change={(e) => updateElementFromUI(element.id, { scale: num(e) })}
				/></label
			>
			<label class="input-field"
				><span>R</span><input
					type="number"
					min="-360"
					max="360"
					step="5"
					value={element.rotation}
					on:change={(e) => updateElementFromUI(element.id, { rotation: num(e) })}
				/></label
			>
			<label class="input-field"
				><span>O</span><input
					type="number"
					min="0"
					max="1"
					step="0.1"
					value={element.opacity}
					on:change={(e) => updateElementFromUI(element.id, { opacity: num(e) })}
				/></label
			>
			<div class="toggle-group">
				<label
					><input
						type="checkbox"
						checked={element.visible}
						on:change={(e) => updateElementFromUI(element.id, { visible: e.currentTarget.checked })}
					/> Visible</label
				>
				<label
					><input
						type="checkbox"
						checked={element.locked}
						on:change={(e) => updateElementFromUI(element.id, { locked: e.currentTarget.checked })}
					/> Locked</label
				>
			</div>
		</div>
	{:else}
		<div class="empty-state">Select an element on the canvas to edit its placement.</div>
	{/if}
</div>

<style>
	.properties-panel {
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 6px;
		border-bottom: 1px solid #334155;
	}
	h3 {
		font-size: 13px;
		margin: 0;
		color: #f1f5f9;
	}
	.type-badge {
		font-size: 9px;
		background: #334155;
		padding: 1px 5px;
		border-radius: 3px;
		color: #94a3b8;
	}
	.compact-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.input-field {
		display: flex;
		align-items: center;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 4px;
		padding: 0 6px;
	}
	.input-field span {
		font-size: 9px;
		color: #64748b;
		font-weight: 800;
		margin-right: 4px;
	}
	input[type='number'] {
		width: 100%;
		background: transparent;
		border: none;
		color: #e2e8f0;
		padding: 5px 0;
		font-size: 12px;
		outline: none;
	}
	.toggle-group {
		grid-column: 1 / -1;
		display: flex;
		gap: 12px;
	}
	.toggle-group label {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
		font-size: 11px;
		color: #94a3b8;
	}
	.empty-state {
		color: #64748b;
		font-size: 12px;
		text-align: center;
		padding: 12px 0;
		font-style: italic;
	}
</style>
