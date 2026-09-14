import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

import { Article } from './schemas.js'

export const ultimabase = new UltimaBase({
	plugins: [hooksPlugin(), validationPlugin()],
	schemas: [Article],
})
