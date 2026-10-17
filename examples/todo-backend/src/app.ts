import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

/**
 * One plugin list types every schema and builds the application.
 * Every schema rules every operation, so Access opens nothing by default.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	validationPlugin(),
	rolesPlugin(),
	aclPlugin(),
	// REST over HTTP and a local Hono listener; Access decides
	// what each request may do.
	apiServer({ rest: true }),
	postgresPlugin(),
)
