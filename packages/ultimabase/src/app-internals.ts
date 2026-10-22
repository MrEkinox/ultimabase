// What the `ultimabase` commands read from an application (D-105): its
// options and its lifecycle, kept off its public surface.
import type { Lifecycle, LifecycleOptions } from './lifecycle.ts'

export type Internals = {
	readonly options: LifecycleOptions
	readonly app: Lifecycle
}

const internals = new WeakMap<object, Internals>()

/** Remembers the options `defineApp` built `app` from. */
export function remember<T extends Lifecycle>(
	app: T,
	options: LifecycleOptions,
): T {
	internals.set(app, { options, app })
	return app
}

/** What `defineApp` kept of a value it returned, or `undefined`. */
export function internalsOf(value: unknown): Internals | undefined {
	return typeof value === 'object' && value !== null
		? internals.get(value)
		: undefined
}
