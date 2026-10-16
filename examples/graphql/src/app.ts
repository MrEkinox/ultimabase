//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { versionSchema } from './custom-schema.ts'
import { readingTime } from './operations.ts'

/**
 * `apiServer({ graphql })` installs GraphQL, its Yoga transport (`POST
 * /graphql`), the HTTP foundation and the Hono listener; `explorer` adds
 * GraphiQL at `/graphiql` in development. Access decides what clients may
 * do: an exposed field grants nothing.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	postgresPlugin(), // reads DATABASE_URL when the application starts
	...apiServer({
		http: { appId: 'blog' },
		graphql: {
			pagination: { defaultTake: 20, maxTake: 100 },
			schemas: [versionSchema],
			explorer: 'graphiql',
		},
	}),
	readingTime, // the `readingTime` mutation
)
//#endregion factory
