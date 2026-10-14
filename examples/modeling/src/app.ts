//#region factory
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * The configured factory declares every schema of the bookshop. Data modeling
 * is Core: the only plugin is the database, and `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts, not when it is imported.
 */
export const App = UltimaBase.use(postgresPlugin())
//#endregion factory
