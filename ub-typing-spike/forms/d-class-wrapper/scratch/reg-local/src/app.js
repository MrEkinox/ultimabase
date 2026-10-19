import { UltimaBase } from '@ultimabase/core';
import { accessPlugin, aclPlugin, hooksPlugin, passwordAuthPlugin, postgresPlugin, rolesPlugin, softDeletePlugin } from '@ultimabase/core/plugins';
/** Configured application: one plugin list, used by every schema and by `new App(...)`. */
export const App = UltimaBase.use(postgresPlugin(), accessPlugin(), hooksPlugin(), softDeletePlugin(), aclPlugin(), rolesPlugin(), passwordAuthPlugin());
