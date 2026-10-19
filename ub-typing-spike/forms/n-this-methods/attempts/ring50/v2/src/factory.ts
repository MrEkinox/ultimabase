import { UltimaBase } from '@ultimabase/core'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '@ultimabase/core/plugins'

export const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), postgresPlugin())
