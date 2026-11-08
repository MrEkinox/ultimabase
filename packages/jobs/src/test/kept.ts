// `memory()` whose rows outlive a restart, for the tests that start an
// application twice on the same rows.
import type { Adapter, Feed } from 'ultimabase'
import { memory } from 'ultimabase'

export function kept(): Adapter {
	const base = memory()
	let feed: Feed | undefined
	let once = false
	return {
		...base,
		start: async (schema, given, next) => {
			feed = next
			if (once) return
			once = true
			await base.start(schema, given, {
				changed: (changes) => feed?.changed(changes),
				lost: () => feed?.lost(),
				missed: () => feed?.missed(),
			})
		},
	}
}
