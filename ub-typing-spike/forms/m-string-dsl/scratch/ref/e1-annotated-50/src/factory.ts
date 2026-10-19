import { type SchemaOptionsOf, UltimaBase } from '../../../../../e1-annotated/lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../../../../e1-annotated/lib/plugins.ts'

export const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), postgresPlugin())

export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>
