//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'

import { roleAuditPlugin } from './role-audit.ts'

/**
 * Roles adds `App.RoleSchema` and resolves memberships; Access turns a
 * membership into a decision through `hasRole()`. The audit plugin observes
 * committed role changes. `postgresPlugin()` reads `DATABASE_URL` when the
 * application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	roleAuditPlugin,
	...apiServer({ http: { appId: 'newsroom' }, rest: true }),
	postgresPlugin(),
)
//#endregion factory
