/* global Request, Response */

import process from 'node:process'

import { UltimaBase, databaseAdapterCapability } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'
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
const routeOwner = plugin({
	id: 'fixture.javascript-http-route',
	version: '1.0.0',
	core: '^0.0.0',
	permissions: {
		'transport:expose': 'Exposes the JavaScript fixture route.',
	},
	contributions: [
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
})
const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const server = plugin({
	id: 'fixture.javascript-http-server',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		requirement,
		contributeApplication(({ capabilities }) => ({
			exports: { http: capabilities.get(requirement) },
		})),
	],
})
const database = plugin({
	id: 'fixture.javascript-http-database',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
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
})
const Application = UltimaBase.use(
	database,
	routeOwner,
	httpPlugin({ appId: 'javascript-app' }),
	server,
)
const ultimabase = new Application({
	logger: false,
	schemas: [],
})

try {
	await ultimabase.start()
	const http = ultimabase.plugin('fixture.javascript-http-server').http
	const response = await dispatchHttpApplicationRequest(http, {
		originalHeaders: [['X-UltimaBase-Application-Id', 'javascript-app']],
		request: new Request('http://localhost/javascript'),
	})
	// ADR-0323: a header-less request runs without a server through fetch().
	const portFree = await ultimabase
		.plugin(httpPlugin)
		.fetch(new Request('http://localhost/javascript'))
	const absent = await dispatchHttpApplicationRequest(undefined, {
		originalHeaders: [['X-UltimaBase-Request-Id', 'absent.request']],
		request: new Request('http://localhost/javascript'),
	})
	process.stdout.write(
		JSON.stringify({
			appId: http.appId,
			absentStatus: absent.status,
			absentRequestId: absent.headers.get('X-UltimaBase-Request-Id'),
			owner: http.routeGraph.routes.find(
				(route) => route.path === '/javascript',
			).provenance.owner,
			portFree: await portFree.text(),
			response: await response.text(),
		}),
	)
} finally {
	await ultimabase.dispose()
}
