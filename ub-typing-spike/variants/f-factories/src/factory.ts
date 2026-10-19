import { UltimaBase } from '../../../lib-f/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, passwordAuthPlugin, postgresPlugin, rolesPlugin, softDeletePlugin } from '../../../lib-f/plugins.ts'

/** Configured factory: one plugin list, used by schemas and by the application. */
export const App = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())
	.use(softDeletePlugin())
	.use(postgresPlugin())
	.use(rolesPlugin())
	.use(passwordAuthPlugin())
