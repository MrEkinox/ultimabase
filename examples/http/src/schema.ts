//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { apiInfoPlugin } from './api-info-plugin.ts'
import { readSecret } from './env.ts'
import { http } from './http.ts'
import { partnerCredentials } from './partners.ts'

/**
 * `apiServer()` installs the HTTP foundation, REST and the Hono server, each
 * with its own options. Access decides who may write through REST.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	partnerCredentials({ acme: readSecret('ACME_PARTNER_TOKEN') }),
	apiInfoPlugin(),
	...apiServer({
		http,
		rest: true,
		// The managed listener: `PORT`, else 1337; `HOST`, else 127.0.0.1
		// outside production.
		server: { compression: true, shutdownTimeoutMs: 5_000 },
	}),
	postgresPlugin(),
)
//#endregion factory

//#region link
/**
 * Saved links, served by REST under `/api/classes/Link`. Everyone reads
 * them; without a write rule, only Master requests write.
 */
export const Link = App.Schema.define({
	className: 'Link',
	fields: (field) => ({
		url: field.string({ required: true }),
		title: field.string(),
	}),
}).with((plugins) => plugins.access({ read: true }))
//#endregion link
