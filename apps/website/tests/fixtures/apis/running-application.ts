import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'

import { ApiPost } from './schema.js'
import { apiDatabasePlugin } from './test-database.js'

export const application = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [
		apiDatabasePlugin,
		graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
	],
	schemas: [ApiPost],
})

await application.start()
