<script lang="ts">
	import { webmcpStatus } from '$lib/studio/stores/scene';
	let open = false;
</script>

<div class="chip-wrap">
	<button
		class="chip"
		class:on={$webmcpStatus.supported && $webmcpStatus.registeredTools.length > 0}
		class:off={!$webmcpStatus.supported}
		on:click={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="dot"></span>
		{#if $webmcpStatus.supported && $webmcpStatus.registeredTools.length > 0}
			WebMCP · {$webmcpStatus.registeredTools.length} site tools
		{:else if $webmcpStatus.supported}
			WebMCP · registering…
		{:else}
			WebMCP unavailable
		{/if}
	</button>
	{#if open}
		<div class="popover">
			{#if $webmcpStatus.supported}
				<div class="pop-title">Registered via <code>{$webmcpStatus.api}</code></div>
				<ul>
					{#each $webmcpStatus.registeredTools as t}<li><code>{t}</code></li>{/each}
				</ul>
				{#if $webmcpStatus.error}<div class="pop-err">{$webmcpStatus.error}</div>{/if}
			{:else}
				<div class="pop-title">No model context in this browser.</div>
				<p>
					The editor works normally. To let your browser agent use the ten site tools, open this
					page in a WebMCP-capable browser (Chrome 149+ with <code
						>chrome://flags/#enable-webmcp-testing</code
					>, or the ChatGPT desktop browser).
				</p>
				{#if $webmcpStatus.error}<div class="pop-err">{$webmcpStatus.error}</div>{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.chip-wrap {
		position: relative;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid #334155;
		background: #0f172a;
		color: #94a3b8;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #64748b;
	}
	.chip.on {
		color: #a7f3d0;
		border-color: rgba(52, 211, 153, 0.4);
	}
	.chip.on .dot {
		background: #34d399;
		box-shadow: 0 0 6px #34d399;
	}
	.popover {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 300px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 10px 12px;
		z-index: 100;
		font-size: 11px;
		color: #cbd5e1;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}
	.pop-title {
		color: #e2e8f0;
		margin-bottom: 6px;
	}
	ul {
		margin: 0;
		padding-left: 16px;
	}
	code {
		font-family: ui-monospace, Menlo, monospace;
		color: #c4b5fd;
	}
	p {
		margin: 0;
		line-height: 1.4;
	}
	.pop-err {
		margin-top: 6px;
		color: #fca5a5;
	}
</style>
