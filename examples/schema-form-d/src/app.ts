import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { password } from '@ultimabase/auth-password'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/** Configured application: one plugin list for every schema and `new App(...)`. */
export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
	aclPlugin(),
	rolesPlugin(),
	authPlugin({ methods: [password({ identifier: 'email' })] }),
	postgresPlugin({
		url: process.env.DATABASE_URL ?? 'postgres://localhost/form-d',
	}),
)
