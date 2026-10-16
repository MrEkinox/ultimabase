//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

import { readingTime } from './operations.ts'

/**
 * REST serves `/api` through the HTTP foundation and the Hono listener.
 * Access decides what clients may do: an exposed route grants nothing.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	httpPlugin({ appId: 'blog' }),
	restPlugin({
		openapi: true, // GET /api/openapi.json
		pagination: { defaultTake: 20, maxTake: 100 },
	}),
	honoServerPlugin(), // listens on PORT, 1337 by default
	postgresPlugin(),
	readingTime, // POST /api/operations/readingTime
)
//#endregion factory
