import { UltimaBase } from '../../../lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../../lib/plugins.ts'

/** Configured factory: one plugin list, used by schemas and by the application. */
export const App = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())
	.use(softDeletePlugin())
	.use(postgresPlugin())
