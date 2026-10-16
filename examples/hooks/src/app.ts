//#region factory
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

import { sendMessage } from './effects.ts'
import { announcePost } from './events.ts'

/**
 * The configured factory types `.with({ hooks: … })` and field `hooks` from the
 * plugin declaration. `postgresPlugin()` reads `DATABASE_URL` at start.
 */
export const App = UltimaBase.use(
	hooksPlugin({
		// Runs for every schema, before the schema's own Hooks.
		global: {
			afterCommit: {
				all: ({ schema, kind }) =>
					sendMessage({ to: 'audit', subject: `${schema}.${kind}` }),
			},
		},
		// Consumers of typed events, run after the commit.
		events: [announcePost],
	}),
	softDeletePlugin(),
	// Hooks are not an authorization layer: every client may write here.
	// Install Access before exposing an application.
	...apiServer({ http: { appId: 'blog' }, rest: { publicWrites: true } }),
	postgresPlugin(),
)
//#endregion factory
