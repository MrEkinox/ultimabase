// `@ultimabase/postgres` (D-47, D-98): the PostgreSQL adapter.
import type { Adapter } from 'ultimabase'
import { createAdapter } from './adapter.ts'

/**
 * Stores the app's models in the PostgreSQL database at `url`. An unset one,
 * `process.env.DATABASE_URL` perhaps, is refused when the app starts. A query
 * waits up to 10 seconds for one of its `connections`, 10 by default.
 */
export function postgres(options: {
	readonly url: string | undefined
	readonly connections?: number
}): Adapter {
	return createAdapter(options)
}
