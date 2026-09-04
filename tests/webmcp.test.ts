import { describe, expect, it } from 'vitest';
import { buildStudioTools, STUDIO_TOOL_NAMES } from '../src/lib/webmcp/tools';

describe('WebMCP tool surface', () => {
	it('registers the workspace, composition and animation workflow as ten bounded tools', () => {
		const tools = buildStudioTools();
		expect(tools.map((tool) => tool.name)).toEqual([...STUDIO_TOOL_NAMES]);
		expect(STUDIO_TOOL_NAMES).toEqual([
			'get_scene',
			'switch_scene',
			'inspect_animation_targets',
			'inspect_vector_scene',
			'preview_scene_patch',
			'apply_scene_patch',
			'preview_timeline_patch',
			'apply_timeline_patch',
			'undo_last_timeline_change',
			'save_scene'
		]);
	});

	it('keeps preview tools non-destructive and inspectors read-only', () => {
		const byName = new Map(buildStudioTools().map((tool) => [tool.name, tool]));
		expect(byName.get('inspect_vector_scene')?.annotations?.readOnlyHint).toBe(true);
		expect(byName.get('switch_scene')?.annotations?.destructiveHint).toBe(true);
		expect(byName.get('preview_scene_patch')?.annotations?.destructiveHint).toBe(false);
		expect(byName.get('apply_scene_patch')?.annotations?.destructiveHint).toBe(false);
	});

	it('exposes only JSON-serializable schemas', () => {
		expect(() => JSON.stringify(buildStudioTools().map((tool) => tool.inputSchema))).not.toThrow();
	});
});
