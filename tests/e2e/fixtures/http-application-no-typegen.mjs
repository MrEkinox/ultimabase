/* global Request, Response */

import process from 'node:process'

import {
	FrameworkApplication,
	definePlugin,
	requireCapability,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	httpRoute,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'

const protocol = Object.freeze({
	name: 'fixture.javascript-http',
	version: '1',
})
const routeOwner = definePlugin({
	pluginId: 'fixture.javascript-http-route',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'transport:expose',
			reason: 'Exposes the JavaScript fixture route.',
		},
	],
	capabilities: {
		provides: [
			provideHttpEndpoints({
				contributionId: 'javascript-route',
				create: () =>
					httpRoute({
						method: 'GET',
						path: '/javascript',
						protocol,
						handle: () => new Response('typegen-free'),
					}),
			}),
		],
	},
})
const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const server = definePlugin({
	pluginId: 'fixture.javascript-http-server',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: { requires: [requirement] },
	setup: ({ capabilities }) => ({ http: capabilities.get(requirement) }),
})
const application = new FrameworkApplication({
	pluginPrivileges: { logger: false },
	plugins: [routeOwner, httpPlugin({ appId: 'javascript-app' }), server],
	schemas: [],
})

try {
	await application.initialize()
	const http = application.getPlugin('fixture.javascript-http-server').http
	const response = await http.fetch({
		originalHeaders: [['X-UltimaBase-Application-Id', 'javascript-app']],
		request: new Request('http://localhost/javascript'),
	})
	process.stdout.write(
		JSON.stringify({
			appId: http.appId,
			owner: http.routeGraph.routes[0].provenance.owner,
			response: await response.text(),
		}),
	)
} finally {
	await application.dispose()
}
