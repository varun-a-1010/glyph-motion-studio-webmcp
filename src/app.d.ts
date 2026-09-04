// Minimal WebMCP ambient types (imperative API) — mirrors the shape shipped in
// Chrome's origin trial / ChatGPT desktop: document.modelContext.registerTool.
declare global {
	namespace WebMCP {
		interface ToolAnnotations {
			readOnlyHint?: boolean;
			destructiveHint?: boolean;
			idempotentHint?: boolean;
			openWorldHint?: boolean;
			untrustedContentHint?: boolean;
		}
		interface ExecuteOptions {
			signal?: AbortSignal;
		}
		interface ModelContextTool {
			name: string;
			title?: string;
			description: string;
			inputSchema: Record<string, unknown>;
			annotations?: ToolAnnotations;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			execute: (input: any, options: ExecuteOptions) => unknown | Promise<unknown>;
		}
		interface ModelContext {
			registerTool(
				tool: ModelContextTool,
				options?: { signal?: AbortSignal }
			): Promise<void> | void;
			unregisterTool?(name: string): void;
			getTools?(): Promise<unknown[]>;
		}
	}
	interface Document {
		modelContext?: WebMCP.ModelContext;
	}
	interface Navigator {
		modelContext?: WebMCP.ModelContext;
	}
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
	}
}

export {};
