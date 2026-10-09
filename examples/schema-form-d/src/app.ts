import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/** Configured application: one plugin list for every schema and `new App(...)`. */
export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
	aclPlugin(),
	postgresPlugin({
		url: process.env.DATABASE_URL ?? 'postgres://localhost/form-d',
	}),
)
