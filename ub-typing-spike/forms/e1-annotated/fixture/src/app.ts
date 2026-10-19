import { type SchemaOptionsOf, UltimaBase } from '../../lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, passwordAuthPlugin, postgresPlugin, rolesPlugin, softDeletePlugin } from '../../lib/plugins.ts'

/** Configured factory: one plugin list, used by schemas and by the application. */
export const App = UltimaBase.use(
	postgresPlugin(),
	accessPlugin(),
	hooksPlugin(),
	aclPlugin(),
	softDeletePlugin(),
	rolesPlugin(),
	passwordAuthPlugin(),
)

/** Plugin options of one schema of this application (written once per application). */
export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>
