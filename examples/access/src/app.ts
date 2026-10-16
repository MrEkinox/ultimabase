//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ http: { appId: 'newsroom' }, rest: true }),
	postgresPlugin(),
)
//#endregion factory
