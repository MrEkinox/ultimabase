//#region factory
import { UltimaBase } from '@ultimabase/core'

import { database } from './database.ts'

/** The configured factory types the `postgres` rule and field option. */
export const App = UltimaBase.use(database)
//#endregion factory
