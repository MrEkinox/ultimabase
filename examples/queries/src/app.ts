import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * Access opens every operation of a schema that declares no rule, so the blog
 * data stays public in this example; `Announcement` declares its own rules.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	postgresPlugin(),
)
