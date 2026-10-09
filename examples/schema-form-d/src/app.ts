import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/** Configured application: one plugin list for every schema and `new App(...)`. */
export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
)
