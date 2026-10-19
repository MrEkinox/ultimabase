import { UltimaBase } from '../../../lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../../lib/plugins.ts'

/** Configured factory: one plugin list, used by schemas and by the application. */
export const App = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())
	.use(softDeletePlugin())
	.use(postgresPlugin())

/** Plugin options of one schema of this application. */
export type Options<TSchema> = import('../../../lib/core.ts').SchemaOptionsOf<typeof App, TSchema>
