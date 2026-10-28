// `@ultimabase/postgres` (D-47, D-98): the PostgreSQL adapter.
import type { Postgres } from './adapter.ts'
import { createAdapter } from './adapter.ts'

export type { Postgres }

/**
 * Stores the app's models in the PostgreSQL database at `url`. An unset one,
 * `process.env.DATABASE_URL` perhaps, is refused when the app starts. A query
 * waits up to 10 seconds for one of its `connections`, 10 by default.
 * `_search` reads its words in `searchLanguage`, a text search configuration
 * of the server, `'simple'` by default.
 */
export function postgres(options: {
	readonly url: string | undefined
	readonly connections?: number
	readonly searchLanguage?: string
}): Postgres {
	return createAdapter(options)
}
