import { UltimaBase } from '@ultimabase/core'
import {
	closeSchemaCommand,
	contributeDeclarations,
	plugin,
} from '@ultimabase/core/plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, onTestFinished } from 'vitest'

import { restPlugin } from '../src/index.js'
import { databasePlugin } from './exposure.test-support.js'

// ADR-0341 decision 3: REST publishes no route for a closed command.
const Ledger = UltimaBase.Schema.define({
	className: 'RestClosedLedger',
	fields: (field) => ({ title: field.string() }),
})
const closingPlugin = (className: string) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-closure',
		permissions: { 'schema:declare': 'Closes ledger creation.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							closeSchemaCommand({
								command: 'create',
								contributionId: 'ledger-creation',
								reason: 'Ledgers are opened by the bank.',
							}),
						],
						targets: schemas.select({ className }),
					})
					return undefined
				},
			}),
		],
	})
const closing = closingPlugin(Ledger.className)

it('publishes no route or OpenAPI entry for a closed command', async () => {
	const ultimabase = new (UltimaBase.use(
		databasePlugin,
		closing,
		restPlugin({ default: true, openapi: true, publicWrites: true }),
		httpPlugin(),
	))({ logger: false, schemas: [Ledger] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const routes = ultimabase
		.plugin('@ultimabase/rest-plugin')
		.routeGraph.routes.map((route) => `${route.method} ${route.path}`)
	const base = '/api/classes/RestClosedLedger'
	for (const route of [
		`POST ${base}`,
		`POST ${base}/bulk/create`,
		`POST ${base}/upsert`,
		`POST ${base}/bulk/upsert`,
	]) {
		expect(routes).not.toContain(route)
	}
	expect(routes).toContain(`GET ${base}`)
	expect(routes).toContain(`POST ${base}/bulk/update`)

	const fetch = (path: string, method = 'GET') =>
		ultimabase.plugin(httpPlugin).fetch(
			new Request(`http://localhost${path}`, {
				method,
				...(method === 'GET'
					? {}
					: {
							body: JSON.stringify({ title: 'Savings' }),
							headers: { 'Content-Type': 'application/json' },
						}),
			}),
		)
	const create = await fetch(base, 'POST')
	expect(create.status).toBe(405)
	expect(create.headers.get('allow')).toBe('GET')
	const openapi: unknown = await (await fetch('/api/openapi.json')).json()
	const paths: unknown = isPlainRecord(openapi) ? openapi.paths : undefined
	if (!isPlainRecord(paths)) throw new TypeError('OpenAPI has no paths')
	expect(Object.keys(paths)).not.toContain('/classes/RestClosedLedger/upsert')
	expect(Object.keys(paths)).not.toContain(
		'/classes/RestClosedLedger/bulk/create',
	)
	const collection = paths['/classes/RestClosedLedger']
	expect(isPlainRecord(collection) ? Object.keys(collection) : []).toEqual([
		'get',
	])
})

// An explicit setting that would publish a closed command fails at startup;
// `true` forms and the defaults stay silent (ADR-0341).
const RuledApp = UltimaBase.use(restPlugin())
const Explicit = RuledApp.Schema.define({
	className: 'RestExplicitClosedLedger',
	fields: (field) => ({ title: field.string() }),
}).with({ rest: { createOne: true } })
const ByDefault = RuledApp.Schema.define({
	className: 'RestDefaultClosedLedger',
	fields: (field) => ({ title: field.string() }),
})

describe('an explicit REST setting for a closed command', () => {
	it.each([
		[
			Explicit,
			{},
			'RestExplicitClosedLedger.createOne is closed by plugin "fixture.rest-closure": Ledgers are opened by the bank. Remove createOne from .with({ rest }) of RestExplicitClosedLedger.',
		],
		[
			ByDefault,
			{ default: { upsertOne: true } },
			'RestDefaultClosedLedger.upsertOne is closed by plugin "fixture.rest-closure": Ledgers are opened by the bank. Remove upsertOne from restPlugin({ default }), or set it to false in .with({ rest }) of RestDefaultClosedLedger.',
		],
	] as const)('fails at startup %#', async (schema, options, message) => {
		const ultimabase = new (UltimaBase.use(
			databasePlugin,
			closingPlugin(schema.className),
			restPlugin({ publicWrites: true, ...options }),
			httpPlugin(),
		))({ logger: false, schemas: [schema] })
		onTestFinished(() => ultimabase.dispose())
		await expect(ultimabase.start()).rejects.toThrow(message)
	})
})
