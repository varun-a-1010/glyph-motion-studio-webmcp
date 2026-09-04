<script lang="ts">
	import { activityLog } from '$lib/studio/stores/activity';

	function time(at: number): string {
		return new Date(at).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}
</script>

<div class="activity">
	{#if $activityLog.length === 0}
		<div class="empty">No activity yet.</div>
	{/if}
	{#each $activityLog as entry (entry.id)}
		<div
			class="entry"
			class:rejected={entry.status === 'rejected'}
			class:started={entry.status === 'started'}
		>
			<div class="line1">
				<span class="src src-{entry.source}">{entry.source}</span>
				<span class="action">{entry.action}</span>
				<span class="status status-{entry.status}">{entry.status}</span>
				<span class="time">{time(entry.at)}</span>
			</div>
			<div class="purpose">{entry.purpose}</div>
			{#if entry.message}<div class="message">{entry.message}</div>{/if}
		</div>
	{/each}
</div>

<style>
	.activity {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		overflow-y: auto;
		font-size: 11px;
	}
	.empty {
		color: #64748b;
		font-style: italic;
	}
	.entry {
		background: #0f172a;
		border: 1px solid #263243;
		border-left: 3px solid #3b82f6;
		border-radius: 4px;
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.entry.rejected {
		border-left-color: #ef4444;
	}
	.entry.started {
		border-left-color: #fbbf24;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.src {
		font-size: 9px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 5px;
		border-radius: 3px;
	}
	.src-agent {
		background: #7c3aed;
		color: #fff;
	}
	.src-user {
		background: #0ea5e9;
		color: #fff;
	}
	.src-system {
		background: #334155;
		color: #cbd5e1;
	}
	.action {
		font-family: ui-monospace, Menlo, monospace;
		color: #e2e8f0;
	}
	.status {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.status-succeeded {
		color: #4ade80;
	}
	.status-rejected {
		color: #f87171;
	}
	.status-started {
		color: #fbbf24;
	}
	.status-cancelled {
		color: #94a3b8;
	}
	.time {
		margin-left: auto;
		color: #475569;
		font-family: ui-monospace, Menlo, monospace;
		font-size: 10px;
	}
	.purpose {
		color: #cbd5e1;
	}
	.message {
		color: #94a3b8;
		word-break: break-word;
	}
</style>
