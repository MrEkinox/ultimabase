// `@ultimabase/postgres` (D-47, D-98): the PostgreSQL adapter.
import type { Adapter } from 'ultimabase'
import { createAdapter } from './adapter.ts'

/** Stores the app's models in the PostgreSQL database at `url`. */
export function postgres(options: { readonly url: string }): Adapter {
	return createAdapter({ url: options.url })
}
