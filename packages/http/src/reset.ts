// `POST /_ultimabase/reset`, outside production: Master empties the database
// between end-to-end tests (D-188).
import { Hono } from 'hono'
import { PublicError } from 'ultimabase'
import { emptyRunning } from 'ultimabase/internal'
import type { HttpEnv } from './app.ts'

export const resetRoutes: Hono<HttpEnv> = new Hono<HttpEnv>().post(
	'/_ultimabase/reset',
	async (c) => {
		if (c.var.caller.kind !== 'master') {
			throw new PublicError(
				'ACCESS_DENIED',
				'Only the master key empties the database.',
			)
		}
		await emptyRunning()
		return c.body(null, 204)
	},
)
