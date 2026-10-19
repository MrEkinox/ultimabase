import { UltimaBase } from '../lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, passwordAuthPlugin, postgresPlugin, rolesPlugin, softDeletePlugin } from '../lib/plugins.ts'

/** Configured factory: one plugin list for the whole application. */
export const App = UltimaBase.use(postgresPlugin(), accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), rolesPlugin(), passwordAuthPlugin())

export const { field } = App
