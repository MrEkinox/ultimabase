import { UltimaBase, type SchemaOptionsOf } from '../../lib2/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../lib2/plugins.ts'

export const App = UltimaBase.use(accessPlugin()).use(hooksPlugin()).use(aclPlugin()).use(softDeletePlugin()).use(postgresPlugin())

export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>
