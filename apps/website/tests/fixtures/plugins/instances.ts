import { UltimaBase } from '@ultimabase/core'

import { workflowPlugin } from './authoring.js'

export const ultimabase = new UltimaBase({
	plugins: [workflowPlugin('editorial'), workflowPlugin('publishing')],
	schemas: [],
})
