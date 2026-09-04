<script lang="ts">
	import { studioScene, elementRegistries, stagedPreview } from '$lib/studio/stores/scene';
	import { studioUI } from '$lib/studio/stores/studioUI';
	import { commitOperationsFromUI } from '$lib/actions/sceneActions';
	import { ALLOWED_ROLES } from '$lib/actions/schema';
	import { splitNamespacedId } from '$lib/studio/namespacing';
	import type { TimelineStep, TweenType } from '$lib/types';

	let scopeId = '';
	let targetType: 'id' | 'group' | 'role' = 'id';
	let targetValue = '';
	let tweenType: TweenType = 'from';
	let label = '';
	let duration = '0.6';
	let position = '0';
	let ease = 'power2.out';
	let staggerAmount = '';
	let staggerFrom = 'start';
	let staggerSort = 'dom-order';
	let drawSVG = '0%';
	let props: Record<string, string> = {
		x: '',
		y: '',
		scale: '',
		rotation: '',
		opacity: '',
		transformOrigin: ''
	};
	let fromProps: Record<string, string> = { x: '', y: '', scale: '', rotation: '', opacity: '' };
	let error: string | null = null;
	let saving = false;

	$: elements = $studioScene?.elements ?? [];
	$: if (!scopeId && elements[0]) scopeId = elements[0].id;
	$: registry = $elementRegistries[scopeId] ?? {};
	$: idOptions = Object.entries(registry).map(([ns, meta]) => ({
		value: splitNamespacedId(ns).local,
		label: meta.label ?? splitNamespacedId(ns).local,
		role: meta.role
	}));
	$: groupOptions = [
		...new Set(Object.values(registry).map((m) => splitNamespacedId(m.group).local))
	];
	$: valueOptions =
		targetType === 'id'
			? idOptions.map((o) => ({ value: o.value, label: `${o.label} · ${o.role}` }))
			: targetType === 'group'
				? groupOptions.map((g) => ({ value: g, label: g }))
				: ALLOWED_ROLES.map((r) => ({ value: r, label: r }));
	$: if (valueOptions.length && !valueOptions.some((o) => o.value === targetValue))
		targetValue = valueOptions[0]?.value ?? '';

	$: selectedStepId = $studioUI.selectedStepId;
	$: selectedStep = $studioScene?.timeline.steps.find((s) => s.id === selectedStepId);
	$: if (selectedStep) loadStep(selectedStep);

	$: {
		const id = targetType === 'id' && scopeId && targetValue ? `${scopeId}__${targetValue}` : null;
		if ($studioUI.highlightedSubElementId !== id)
			studioUI.update((s) => ({ ...s, highlightedSubElementId: id }));
	}

	function loadStep(step: TimelineStep) {
		scopeId = step.target.scopeToId ?? scopeId;
		targetType = step.target.type;
		targetValue = step.target.value;
		tweenType = step.tweenType;
		label = step.label ?? '';
		duration = String(step.duration);
		position = String(step.position);
		ease = step.ease ?? '';
		if (typeof step.stagger === 'number') {
			staggerAmount = String(step.stagger);
			staggerFrom = 'start';
			staggerSort = 'dom-order';
		} else if (step.stagger) {
			staggerAmount = String(step.stagger.amount);
			staggerFrom = String(step.stagger.from ?? 'start');
			staggerSort = step.stagger.sortBy ?? 'dom-order';
		} else {
			staggerAmount = '';
		}
		drawSVG = step.props.drawSVG ?? '0%';
		props = {
			x: str(step.props.x),
			y: str(step.props.y),
			scale: str(step.props.scale),
			rotation: str(step.props.rotation),
			opacity: str(step.props.opacity),
			transformOrigin: step.props.transformOrigin ?? ''
		};
		const f = step.props.fromProps ?? {};
		fromProps = {
			x: str(f.x),
			y: str(f.y),
			scale: str(f.scale),
			rotation: str(f.rotation),
			opacity: str(f.opacity)
		};
		error = null;
	}

	const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

	function numericProps(src: Record<string, string>): Record<string, number | string> {
		const out: Record<string, number | string> = {};
		for (const [k, v] of Object.entries(src)) {
			if (v === '') continue;
			out[k] = k === 'transformOrigin' ? v : Number(v);
		}
		return out;
	}

	function buildStep(id: string): Record<string, unknown> {
		const p: Record<string, unknown> = numericProps(props);
		if (tweenType === 'fromTo') p.fromProps = numericProps(fromProps);
		if (tweenType === 'drawSVG' && drawSVG) p.drawSVG = drawSVG;
		const step: Record<string, unknown> = {
			id,
			target: { type: targetType, value: targetValue, scopeToId: scopeId },
			tweenType,
			props: p,
			duration: Number(duration),
			position: /^\d+(\.\d+)?$/.test(position.trim()) ? Number(position) : position.trim()
		};
		if (label.trim()) step.label = label.trim();
		if (ease.trim()) step.ease = ease.trim();
		if (staggerAmount !== '') {
			step.stagger = {
				amount: Number(staggerAmount),
				from: /^\d+$/.test(staggerFrom) ? Number(staggerFrom) : staggerFrom,
				sortBy: staggerSort
			};
		}
		return step;
	}

	async function handleSave() {
		error = null;
		saving = true;
		try {
			if (selectedStepId && selectedStep) {
				const next = buildStep(selectedStepId);
				const changes: Record<string, unknown> = { ...next };
				delete changes.id;
				// props replace wholesale: null out anything that was present but is now gone
				const nextProps = next.props as Record<string, unknown>;
				const merged: Record<string, unknown> = { ...nextProps };
				for (const k of Object.keys(selectedStep.props)) if (!(k in nextProps)) merged[k] = null;
				changes.props = merged;
				if (!('stagger' in next)) changes.stagger = null;
				if (!('ease' in next)) delete changes.ease;
				if (!('label' in next)) delete changes.label;
				await commitOperationsFromUI(
					[{ op: 'update_step', stepId: selectedStepId, changes }],
					`Edited step "${selectedStepId}"`
				);
			} else {
				const base =
					(label.trim() || `${targetValue}-${tweenType}`)
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/^-|-$/g, '') || 'step';
				const existing = new Set($studioScene?.timeline.steps.map((s) => s.id));
				let id = base;
				let n = 2;
				while (existing.has(id)) id = `${base}-${n++}`;
				await commitOperationsFromUI(
					[{ op: 'add_step', step: buildStep(id) }],
					`Added step "${id}"`
				);
				resetForm();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!selectedStepId) return;
		error = null;
		try {
			await commitOperationsFromUI(
				[{ op: 'remove_step', stepId: selectedStepId }],
				`Removed step "${selectedStepId}"`
			);
			resetForm();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	function resetForm() {
		studioUI.update((s) => ({ ...s, selectedStepId: null }));
		label = '';
		props = { x: '', y: '', scale: '', rotation: '', opacity: '', transformOrigin: '' };
		fromProps = { x: '', y: '', scale: '', rotation: '', opacity: '' };
		staggerAmount = '';
		error = null;
	}

	const eases = [
		'power1.out',
		'power2.out',
		'power3.out',
		'power4.out',
		'power2.inOut',
		'sine.out',
		'expo.out',
		'back.out(1.4)',
		'elastic.out(1, 0.4)',
		'bounce.out',
		'none'
	];
</script>

<div class="step-editor">
	<header>
		<h4>{selectedStepId ? `Edit step · ${selectedStepId}` : 'New step'}</h4>
		<button class="link-btn" on:click={resetForm}>{selectedStepId ? 'Done' : 'Clear'}</button>
	</header>

	{#if $stagedPreview}
		<div class="notice">A preview is staged. Apply or discard it before editing steps by hand.</div>
	{/if}

	<div class="form-body" class:disabled={!!$stagedPreview}>
		<div class="row">
			<div class="field">
				<label for="se-scope">Element</label><select id="se-scope" bind:value={scopeId}
					>{#each elements as el}<option value={el.id}>{el.name}</option>{/each}</select
				>
			</div>
			<div class="field">
				<label for="se-ttype">Target by</label><select id="se-ttype" bind:value={targetType}
					><option value="id">id</option><option value="group">group</option><option value="role"
						>role</option
					></select
				>
			</div>
		</div>
		<div class="field">
			<label for="se-tval">Target</label><select id="se-tval" bind:value={targetValue}
				>{#each valueOptions as o}<option value={o.value}>{o.label}</option>{/each}</select
			>
		</div>

		<div class="row">
			<div class="field">
				<label for="se-tween">Tween</label><select id="se-tween" bind:value={tweenType}
					><option value="from">from</option><option value="to">to</option><option value="fromTo"
						>fromTo</option
					><option value="set">set</option><option value="drawSVG">drawSVG</option></select
				>
			</div>
			<div class="field">
				<label for="se-label">Label</label><input
					id="se-label"
					type="text"
					bind:value={label}
					placeholder="symbol-enter"
				/>
			</div>
		</div>

		{#if tweenType === 'fromTo'}
			<div class="props-box">
				<span class="sub-label">From</span>
				<div class="props-grid">
					<input type="number" placeholder="x" bind:value={fromProps.x} /><input
						type="number"
						placeholder="y"
						bind:value={fromProps.y}
					/>
					<input type="number" placeholder="scale" step="0.1" bind:value={fromProps.scale} /><input
						type="number"
						placeholder="rotation"
						bind:value={fromProps.rotation}
					/>
					<input
						type="number"
						placeholder="opacity"
						step="0.1"
						min="0"
						max="1"
						bind:value={fromProps.opacity}
					/>
				</div>
			</div>
		{/if}

		<div class="props-box">
			<span class="sub-label"
				>{tweenType === 'from'
					? 'Start values (animates to natural state)'
					: tweenType === 'fromTo'
						? 'End values'
						: 'Values'}</span
			>
			{#if tweenType === 'drawSVG'}
				<input type="text" placeholder="0%" bind:value={drawSVG} />
			{/if}
			<div class="props-grid">
				<input type="number" placeholder="x" bind:value={props.x} /><input
					type="number"
					placeholder="y"
					bind:value={props.y}
				/>
				<input type="number" placeholder="scale" step="0.1" bind:value={props.scale} /><input
					type="number"
					placeholder="rotation"
					bind:value={props.rotation}
				/>
				<input
					type="number"
					placeholder="opacity"
					step="0.1"
					min="0"
					max="1"
					bind:value={props.opacity}
				/><input type="text" placeholder="origin: 50% 50%" bind:value={props.transformOrigin} />
			</div>
		</div>

		<div class="row">
			<div class="field">
				<label for="se-dur">Duration (s)</label><input
					id="se-dur"
					type="number"
					step="0.05"
					min="0"
					bind:value={duration}
				/>
			</div>
			<div class="field">
				<label for="se-pos">Position</label><input
					id="se-pos"
					type="text"
					bind:value={position}
					placeholder="0, <, >, +=0.2"
				/>
			</div>
		</div>
		<div class="row">
			<div class="field">
				<label for="se-ease">Ease</label><input
					id="se-ease"
					list="se-eases"
					type="text"
					bind:value={ease}
				/><datalist id="se-eases"
					>{#each eases as e}<option value={e}></option>{/each}</datalist
				>
			</div>
			<div class="field">
				<label for="se-stag">Stagger (s)</label><input
					id="se-stag"
					type="number"
					step="0.05"
					min="0"
					bind:value={staggerAmount}
					placeholder="none"
				/>
			</div>
		</div>
		{#if staggerAmount !== ''}
			<div class="row">
				<div class="field">
					<label for="se-sfrom">Stagger from</label><select id="se-sfrom" bind:value={staggerFrom}
						><option value="start">start</option><option value="center">center</option><option
							value="end">end</option
						><option value="random">random</option></select
					>
				</div>
				<div class="field">
					<label for="se-ssort">Order by</label><select id="se-ssort" bind:value={staggerSort}
						><option value="dom-order">dom order</option><option value="x-position"
							>x position</option
						><option value="y-position">y position</option><option value="distance-from-center"
							>distance from centre</option
						></select
					>
				</div>
			</div>
		{/if}

		{#if error}<div class="error">{error}</div>{/if}
	</div>

	<div class="actions">
		<button
			class="save-btn"
			on:click={handleSave}
			disabled={saving || !!$stagedPreview || !targetValue}
			>{selectedStepId ? 'Update step' : 'Add step'}</button
		>
		{#if selectedStepId}<button
				class="delete-btn"
				on:click={handleDelete}
				disabled={!!$stagedPreview}>Delete step</button
			>{/if}
	</div>
</div>

<style>
	.step-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		height: 100%;
		overflow-y: auto;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 6px;
		border-bottom: 1px solid #334155;
	}
	h4 {
		font-size: 11px;
		text-transform: uppercase;
		color: #94a3b8;
		margin: 0;
		letter-spacing: 0.05em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.notice {
		font-size: 11px;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
		padding: 6px 8px;
		border-radius: 4px;
	}
	.form-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.form-body.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.field {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	label {
		font-size: 9px;
		color: #64748b;
		font-weight: 700;
		text-transform: uppercase;
	}
	.sub-label {
		font-size: 10px;
		color: #64748b;
		font-style: italic;
		display: block;
		margin-bottom: 4px;
	}
	select,
	input {
		background: #0f172a;
		border: 1px solid #334155;
		color: #e2e8f0;
		padding: 5px 6px;
		border-radius: 4px;
		font-size: 12px;
		outline: none;
		width: 100%;
		box-sizing: border-box;
	}
	select:focus,
	input:focus {
		border-color: #3b82f6;
	}
	.props-box {
		background: #0f172a;
		padding: 8px;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.props-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.props-box input {
		background: #1e293b;
	}
	.error {
		font-size: 11px;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.35);
		padding: 6px 8px;
		border-radius: 4px;
		word-break: break-word;
	}
	.actions {
		display: flex;
		gap: 8px;
		padding-top: 6px;
	}
	.save-btn {
		flex: 1;
		background: #3b82f6;
		color: white;
		border: none;
		padding: 9px;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}
	.save-btn:disabled,
	.delete-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.delete-btn {
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
		border: 1px solid #ef4444;
		padding: 9px;
		border-radius: 6px;
		cursor: pointer;
	}
	.link-btn {
		background: none;
		border: none;
		color: #64748b;
		font-size: 11px;
		cursor: pointer;
	}
	.link-btn:hover {
		color: #e2e8f0;
	}
</style>
