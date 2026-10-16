//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'

/**
 * ACL stores the rights of each row with the row. Access decides which
 * operations run at all, creation included; Roles tells ACL the caller's
 * roles. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	aclPlugin(),
	accessPlugin(),
	rolesPlugin(),
	postgresPlugin(),
)
//#endregion factory
