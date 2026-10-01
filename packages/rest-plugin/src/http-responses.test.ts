import {
	FrameworkError,
	PluginError,
	UltimaBase,
	contributeOperation,
	databaseAdapterCapability,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	databasePersistencePlanCapability,
	plugin,
	contributeApplication,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
	requireCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { restPlugin } from './plugin.js'

const objectId = '01991f00-0000-7000-8000-000000000201'
const row = {
	createdAt: '2026-09-05T12:00:00.000Z',
	id: objectId,
	title: 'Visible',
	updatedAt: '2026-09-05T12:00:00.000Z',
}
const countRouteOption = { rest: { count: true } }

const RestSchemaApplication = UltimaBase.use(restPlugin())
const HttpRecord = RestSchemaApplication.Schema.define({
	...countRouteOption,
	className: 'RestHttpRecord',
	fields: (field) => ({ title: field.string() }),
})

const operationInput = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const operationResult = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
const httpOperation = defineOperation({
	errors: ['fixture.rest-http.conflict'] as const,
	input: operationInput,
	name: 'fixture.rest-http.execute',
	result: operationResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const operationCodec = operationWireCodec({
	decode: (value) => {
		if (!isPlainRecord(value) || typeof value.text !== 'string') {
			throw new TypeError('REST operation input must contain text')
		}
		return immutableRecord({ message: value.text })
	},
	encode: (value) => immutableRecord({ ok: value.accepted }),
	operation: httpOperation,
	transport: defineOperationTransport({
		name: 'ultimabase.rest',
		version: '1.0.0',
	}),
})
const operationPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.rest-http-operation',
	permissions: {
		'operation:declare': 'Declares the fixture operation.',
		'transport:expose': 'Binds the fixture to REST.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			bindings: [
				operationTransportBinding({
					codec: operationCodec,
					metadata: {
						errors: { 'fixture.rest-http.conflict': 409 },
						path: '/actions/execute',
					},
					operation: httpOperation,
				}),
			],
			execute: ({ input }) => {
				if (input.message === 'conflict') {
					throw new PluginError(
						'fixture.rest-http.conflict',
						'internal conflict secret',
						{ publicMessage: 'The operation conflicted.' },
					)
				}
				return immutableRecord({ accepted: true })
			},
			operation: httpOperation,
		}),
	],
})

class ResponseDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	failure: unknown
	requests = 0

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests += 1
		if (this.failure !== undefined) {
			return Promise.reject(
				this.failure instanceof Error
					? this.failure
					: new TypeError('Invalid response fixture failure'),
			)
		}
		const result: unknown =
			request.operation.kind === 'find-many'
				? [row]
				: request.operation.kind === 'find-one'
					? null
					: request.operation.kind === 'count'
						? 2
						: request.operation.kind === 'exists'
							? false
							: row
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Response fixture does not execute valid mutations')
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-http-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})

const capturePlugin = (capture: { current?: HttpApplication }) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-http-capture',
		version: '1.0.0',
		contributions: [
			httpRequirement,
			contributeApplication(({ capabilities }) => {
				capture.current = capabilities.get(httpRequirement)
				const exports = undefined
				return { exports }
			}),
		],
	})

const createFixture = async () => {
	const adapter = new ResponseDatabase()
	const capture: { current?: HttpApplication } = {}
	const application = new (UltimaBase.use(
		databasePlugin(adapter),
		operationPlugin,
		restPlugin({
			acknowledgeUnverifiedProtection: true,
			operations: [httpOperation],
		}),
		httpPlugin({ appId: 'response-app' }),
		capturePlugin(capture),
	))({
		pluginPrivileges: { logger: false },
		schemas: [HttpRecord],
	})
	await application.start()
	if (capture.current === undefined)
		throw new TypeError('HTTP application missing')
	return { adapter, application, http: capture.current }
}

const fetchApplication = (
	http: HttpApplication,
	path: string,
	options: RequestInit = {},
) => {
	const headers = new Headers(options.headers)
	if (!headers.has('X-UltimaBase-Application-Id')) {
		headers.set('X-UltimaBase-Application-Id', 'response-app')
	}
	const originalHeaders: HttpOriginalHeader[] = []
	for (const pair of headers.entries()) originalHeaders.push(pair)
	return http.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, {
			...options,
			headers,
		}),
	})
}

describe('REST HTTP response boundary', () => {
	it('dispatches reads with canonical metadata and observable protocol identity', async () => {
		const fixture = await createFixture()
		expect(fixture.http.routeGraph.mounts).toMatchObject([
			{
				path: '/api',
				protocol: { name: 'ultimabase.rest', version: '1.0.0' },
			},
		])

		const response = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
			{
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer session-secret',
					Cookie: 'session=cookie-secret',
					'X-UltimaBase-Request-Id': 'response-request',
				},
			},
		)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe(
			'application/json; charset=utf-8',
		)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(response.headers.get('x-ultimabase-request-id')).toBe(
			'response-request',
		)
		const serialized = await response.text()
		expect(JSON.parse(serialized)).toStrictEqual({ results: [row] })
		expect(serialized).not.toMatch(/session-secret|cookie-secret/u)

		const count = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord/count',
		)
		expect(count.status).toBe(200)
		expect(await count.json()).toStrictEqual({ count: 2 })
		await fixture.application.dispose()
	})

	it('separates HTTP pre-dispatch failures from REST-owned failures', async () => {
		const fixture = await createFixture()
		const cases = [
			['/outside', 404, 'HTTP_NOT_FOUND'],
			['/api/v2/classes/RestHttpRecord', 400, 'REST_UNSUPPORTED_VERSION'],
			['/api/v1/classes/RestHttpRecord/', 400, 'REST_BAD_REQUEST'],
			['/api/v1/classes/Missing', 404, 'REST_NOT_FOUND'],
		] as const
		for (const [path, status, code] of cases) {
			const response = await fetchApplication(fixture.http, path)
			expect(response.status).toBe(status)
			expect(await response.json()).toMatchObject({ error: { code } })
		}

		const rejected = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
			{
				headers: { 'X-UltimaBase-Application-Id': 'wrong-application' },
			},
		)
		expect(rejected.status).toBe(401)
		expect(await rejected.json()).toMatchObject({
			error: { code: 'HTTP_APPLICATION_REJECTED' },
		})
		await fixture.application.dispose()
	})

	it('encodes plugin-operation success and its declared public failure', async () => {
		const fixture = await createFixture()
		const path = '/api/v1/actions/execute'
		const success = await fetchApplication(fixture.http, path, {
			body: JSON.stringify({ input: { text: 'accept' } }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		})
		expect(success.status).toBe(200)
		expect(await success.json()).toStrictEqual({ result: { ok: true } })

		const conflict = await fetchApplication(fixture.http, path, {
			body: JSON.stringify({ input: { text: 'conflict' } }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		})
		const serialized = await conflict.text()
		expect(conflict.status).toBe(409)
		expect(serialized).toContain('fixture.rest-http.conflict')
		expect(serialized).toContain('The operation conflicted.')
		expect(serialized).not.toContain('internal conflict secret')
		await fixture.application.dispose()
	})

	it('rejects negotiation and media failures without leaking diagnostics', async () => {
		const fixture = await createFixture()
		const unacceptable = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
			{ headers: { Accept: 'application/json;q=0, */*;q=1' } },
		)
		expect(unacceptable.status).toBe(406)
		expect(await unacceptable.json()).toMatchObject({
			error: { code: 'REST_NOT_ACCEPTABLE' },
		})
		const unsupportedCharset = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
			{ headers: { Accept: 'application/json; charset=iso-8859-1' } },
		)
		expect(unsupportedCharset.status).toBe(406)
		expect(await unsupportedCharset.json()).toMatchObject({
			error: { code: 'REST_NOT_ACCEPTABLE' },
		})

		const media = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
			{ body: '{}', method: 'POST' },
		)
		expect(media.status).toBe(415)
		expect(await media.json()).toMatchObject({
			error: { code: 'REST_MUTATION_UNSUPPORTED_MEDIA_TYPE' },
		})

		fixture.adapter.failure = new Error(
			'postgres sql and credential super-secret must stay internal',
		)
		const failed = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
		)
		const serialized = await failed.text()
		expect(failed.status).toBe(500)
		expect(serialized).toContain('REST_INTERNAL_ERROR')
		expect(serialized).not.toMatch(/postgres|sql|super-secret/u)

		fixture.adapter.failure = new FrameworkError(
			'PERMISSION_DENIED',
			'private policy state',
			{ publicMessage: 'The operation is not permitted.' },
		)
		const denied = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpRecord',
		)
		expect(denied.status).toBe(403)
		expect(await denied.json()).toMatchObject({
			error: { code: 'PERMISSION_DENIED' },
		})
		await fixture.application.dispose()
	})
})
