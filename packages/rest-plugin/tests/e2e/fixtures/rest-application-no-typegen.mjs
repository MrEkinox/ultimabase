/* global Request, process */

import {
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
} from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'
import { httpApplicationCapability, httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

const adapter = {
	capabilities: { persistencePlans: databasePersistencePlanCapability },
	kind: 'database-adapter',
	beginTransaction: () => {
		throw new TypeError('JavaScript REST fixture does not mutate')
	},
	execute: (request) =>
		Promise.resolve(
			request.operation.kind === 'find-many'
				? [
						{
							createdAt: '2026-09-05T12:00:00.000Z',
							id: '01991f00-0000-7000-8000-000000000301',
							title: 'Typegen-free',
							updatedAt: '2026-09-05T12:00:00.000Z',
						},
					]
				: null,
		),
}

const databasePlugin = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: adapter }),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-rest-database',
	version: '1.0.0',
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
let httpApplication
const capturePlugin = plugin({
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			httpApplication = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-rest-capture',
	version: '1.0.0',
})

const Application = UltimaBase.use(
	databasePlugin,
	restPlugin({ publicWrites: true }),
	httpPlugin({ appId: 'javascript-rest' }),
	capturePlugin,
)
const Note = Application.Schema.define({
	className: 'JavaScriptRestNote',
	fields: (field) => ({
		title: field.string(),
		summary: field.virtual({
			output: (output) =>
				output.object({
					nullable: false,
					fields: (nested) => ({
						bytes: nested.binary({ nullable: false }),
						label: nested.string({ nullable: false }),
						total: nested.bigint({ nullable: false }),
					}),
				}),
			resolve: async ({ item }) => ({
				bytes: Uint8Array.from([1, 2, 3]),
				label: String(item.title).toUpperCase(),
				total: 9_007_199_254_740_993n,
			}),
			select: { title: true },
		}),
	}),
}).with({
	rest: { findMany: true },
})
const ultimabase = new Application({
	logger: false,
	schemas: [Note],
})

await ultimabase.start()
if (httpApplication === undefined) {
	throw new TypeError('JavaScript REST application is unavailable')
}
const response = await httpApplication.fetch({
	originalHeaders: [
		['X-UltimaBase-Application-Id', 'javascript-rest'],
		['X-UltimaBase-Request-Id', 'javascript-rest-request'],
	],
	request: new Request('https://example.test/api/classes/JavaScriptRestNote', {
		headers: {
			'X-UltimaBase-Application-Id': 'javascript-rest',
			'X-UltimaBase-Request-Id': 'javascript-rest-request',
		},
	}),
})

process.stdout.write(
	JSON.stringify({
		body: await response.json(),
		cache: response.headers.get('cache-control'),
		requestId: response.headers.get('x-ultimabase-request-id'),
		status: response.status,
	}),
)
await ultimabase.dispose()
