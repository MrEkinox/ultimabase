/* global Request, Response */

import process from 'node:process'

import {
	UltimaBase,
	databaseAdapterCapability,
	definePlugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core'
import {
	dispatchHttpApplicationRequest,
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
const database = definePlugin({
	pluginId: 'fixture.javascript-http-database',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'javascript-http-adapter',
				create: () => ({
					value: {
						kind: 'database-adapter',
						execute: async () => [],
						beginTransaction: async () => {
							throw new TypeError('Fixture does not execute mutations')
						},
					},
				}),
			}),
		],
	},
})
const ultimabase = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [
		database,
		routeOwner,
		httpPlugin({ appId: 'javascript-app' }),
		server,
	],
	schemas: [],
})

try {
	await ultimabase.start()
	const http = ultimabase.application.getPlugin(
		'fixture.javascript-http-server',
	).http
	const response = await dispatchHttpApplicationRequest(http, {
		originalHeaders: [['X-UltimaBase-Application-Id', 'javascript-app']],
		request: new Request('http://localhost/javascript'),
	})
	const absent = await dispatchHttpApplicationRequest(undefined, {
		originalHeaders: [['X-UltimaBase-Request-Id', 'absent.request']],
		request: new Request('http://localhost/javascript'),
	})
	process.stdout.write(
		JSON.stringify({
			appId: http.appId,
			absentStatus: absent.status,
			absentRequestId: absent.headers.get('X-UltimaBase-Request-Id'),
			owner: http.routeGraph.routes[0].provenance.owner,
			response: await response.text(),
		}),
	)
} finally {
	await ultimabase.dispose()
}
