//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

/**
 * The configured factory types the `validation` field option and the schema
 * check of `.with({ validation: … })`. Access opens the REST writes of this
 * example; Validation needs neither Access nor REST.
 */
export const App = UltimaBase.use(
	validationPlugin(),
	accessPlugin(),
	...apiServer({ rest: true }),
	postgresPlugin(),
)
//#endregion factory
