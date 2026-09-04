/**
 * Registers the Studio tools with the page's model context for the lifetime
 * of the top-level Studio route. Returns a dispose function that aborts the
 * registration (which unregisters every tool).
 */
import { webmcpStatus } from '$lib/studio/stores/scene';
import { logActivity } from '$lib/studio/stores/activity';
import { buildStudioTools } from './tools';

function detectContext(): {
	context: WebMCP.ModelContext;
	api: 'document.modelContext' | 'navigator.modelContext';
} | null {
	if (
		typeof document !== 'undefined' &&
		document.modelContext &&
		typeof document.modelContext.registerTool === 'function'
	)
		return { context: document.modelContext, api: 'document.modelContext' };
	if (
		typeof navigator !== 'undefined' &&
		navigator.modelContext &&
		typeof navigator.modelContext.registerTool === 'function'
	)
		return { context: navigator.modelContext, api: 'navigator.modelContext' };
	return null;
}

export function registerStudioTools(): () => void {
	const ac = new AbortController();

	if (typeof window !== 'undefined' && window.top !== window) {
		webmcpStatus.set({
			supported: false,
			api: null,
			registeredTools: [],
			error: 'Tools only register in a top-level page, not inside an iframe.'
		});
		return () => ac.abort();
	}

	const detected = detectContext();
	if (!detected) {
		webmcpStatus.set({ supported: false, api: null, registeredTools: [], error: null });
		return () => ac.abort();
	}

	const { context, api } = detected;
	const tools = buildStudioTools();

	(async () => {
		const registered: string[] = [];
		try {
			for (const tool of tools) {
				if (ac.signal.aborted) return;
				await context.registerTool(tool, { signal: ac.signal });
				registered.push(tool.name);
				webmcpStatus.set({ supported: true, api, registeredTools: [...registered], error: null });
			}
			if (!ac.signal.aborted) {
				logActivity({
					source: 'system',
					action: 'webmcp',
					purpose: `Registered ${registered.length} site tools via ${api}`,
					status: 'succeeded'
				});
			}
		} catch (err) {
			if (ac.signal.aborted) return;
			webmcpStatus.set({
				supported: true,
				api,
				registeredTools: registered,
				error: 'Tool registration failed.'
			});
			logActivity({
				source: 'system',
				action: 'webmcp',
				purpose: 'Tool registration failed',
				status: 'rejected',
				message: err instanceof Error ? err.message : String(err)
			});
		}
	})();

	return () => {
		ac.abort();
		for (const tool of tools) {
			try {
				context.unregisterTool?.(tool.name);
			} catch {
				/* abort signal already handled it */
			}
		}
		webmcpStatus.update((s) => ({ ...s, registeredTools: [] }));
	};
}
