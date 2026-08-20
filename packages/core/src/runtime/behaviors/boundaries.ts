import {
	createRuntimeHookBoundaries,
	type RuntimeHookBoundaries,
} from '../hooks/boundaries.js'

/** Generic product-behavior name for Core's invariant-preserving boundaries. */
export type RuntimeBehaviorBoundaries = RuntimeHookBoundaries

/** Creates invariant boundaries without selecting a concrete behavior engine. */
export const createRuntimeBehaviorBoundaries: () => RuntimeBehaviorBoundaries =
	createRuntimeHookBoundaries
