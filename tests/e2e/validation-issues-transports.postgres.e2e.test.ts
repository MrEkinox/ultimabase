import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// ADR-0319: one VALIDATION_ERROR lists Core's structural issues and every
// plugin issue; REST (422, details.issues) and GraphQL
// (extensions.details.issues) carry the whole list.
const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	validationPlugin(),
)

const Contact = App.Schema.define({
	className: 'ValidationIssuesContact',
	fields: (field) => ({
		name: field.string({ required: true }),
		email: field.string({ validation: z.string().email() }),
		code: field.string({
			validation: (value) =>
				/^[A-Z]{3}$/u.test(value) || {
					code: 'contact.code',
					message: 'Three capital letters',
				},
		}),
	}),
}).with({})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.validation-issues-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'validation-issues'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		restPlugin({ default: { mutations: true } }),
		graphqlPlugin({ default: { mutations: true } }),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ logger: false, schemas: [Contact] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}

// The name is missing (Core) and two fields fail their validators (plugin).
const invalidContact = { code: 'abc', email: 'not an email' }
const expectedIssues = [
	expect.objectContaining({ path: ['input', 'name'] }),
	expect.objectContaining({ code: 'field.validation', path: ['input', 'email'] }),
	{ code: 'contact.code', message: 'Three capital letters', path: ['input', 'code'] },
]

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'validation_issues' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('validation issues through transports (ADR-0319)', () => {
	it('answers REST 422 with every issue in details.issues', async () => {
		if (capture.current === undefined) throw new TypeError('HTTP unavailable')
		const headers = new Headers({
			'content-type': 'application/json',
			[httpApplicationIdHeader]: appId,
		})
		const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
		const response = await capture.current.fetch({
			originalHeaders,
			request: new Request(
				`https://example.test/api/v1/classes/${Contact.className}`,
				{ body: JSON.stringify(invalidContact), headers, method: 'POST' },
			),
		})

		expect(response.status).toBe(422)
		const body: unknown = await response.json()
		expect(body).toMatchObject({
			error: { code: 'VALIDATION_ERROR', details: { issues: expectedIssues } },
		})
	})

	it('reports every issue in GraphQL extensions.details.issues', async () => {
		const result = await application()
			.plugin('@ultimabase/graphql-plugin')
			.execute({
				context: anonymous(application(), {
					requestId: 'graphql-validation-issues',
					source: 'ultimabase.graphql',
				}).context,
				document: `mutation Create($input: ValidationIssuesContactCreateInput!) {
					createValidationIssuesContact(input: $input) { id }
				}`,
				// GraphQL itself requires `name`; both validator issues remain.
				variables: { input: { ...invalidContact, name: 'Ada' } },
			})

		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_ERROR',
			details: { issues: expectedIssues.slice(1) },
		})
	})
})
