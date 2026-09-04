export type ErrorCode =
	| 'INVALID_INPUT'
	| 'REVISION_CONFLICT'
	| 'TARGET_NOT_FOUND'
	| 'STEP_NOT_FOUND'
	| 'UNSUPPORTED_PROPERTY'
	| 'LIMIT_EXCEEDED'
	| 'PREVIEW_EXPIRED'
	| 'PREVIEW_ALREADY_USED'
	| 'PREVIEW_NOT_FOUND'
	| 'PREVIEW_PENDING'
	| 'UNSAVED_CHANGES'
	| 'NOTHING_TO_UNDO'
	| 'NO_SCENE'
	| 'BUSY'
	| 'ABORTED'
	| 'INTERNAL';

export class StudioError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		public readonly details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'StudioError';
	}
}

export interface ErrorPayload {
	code: ErrorCode;
	message: string;
	details?: Record<string, unknown>;
}

/** Structured error for agents and the activity log. Never includes a stack. */
export function toErrorPayload(err: unknown): ErrorPayload {
	if (err instanceof StudioError) {
		return {
			code: err.code,
			message: err.message,
			...(err.details ? { details: err.details } : {})
		};
	}
	return { code: 'INTERNAL', message: 'Unexpected error while applying the request.' };
}
