import { UltimaBase, definePlugin, requireCapability } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import {
	httpApplicationCapability,
	httpPlugin,
	type HttpApplication,
} from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

import { ApiPost } from './schema.ts'
import { apiDatabasePlugin } from './test-database.ts'

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})

export const createApiFixture = async () => {
	let mountedHttp: HttpApplication | undefined
	const captureHttp = definePlugin({
		capabilities: { requires: [httpRequirement] },
		core: '^0.0.0',
		pluginId: 'fixture.website-api-http-capture',
		setup: ({ capabilities }) => {
			mountedHttp = capabilities.get(httpRequirement)
		},
		version: '0.0.0',
	})
	const application = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			apiDatabasePlugin,
			httpPlugin({ appId: 'docs' }),
			restPlugin({ acknowledgeUnverifiedProtection: true }),
			graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
			graphqlYogaPlugin({ introspection: true }),
			captureHttp,
		],
		schemas: [ApiPost],
	})
	await application.start()
	if (mountedHttp === undefined) {
		await application.dispose()
		throw new TypeError('API fixture did not expose its HTTP application')
	}
	return { application, http: mountedHttp }
}
