//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * The configured factory types the `softDelete` key, its commands and fields.
 * Access and Roles only decide who may read the trash; Soft Delete needs
 * neither. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin(),
	rolesPlugin(),
	...apiServer({ rest: true, graphql: true }),
	postgresPlugin(),
)
//#endregion factory
