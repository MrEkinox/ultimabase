import {
	MasterAuthority,
	RequestContextValue,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
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
	httpContextResolver,
	httpPlugin,
	provideHttpContextResolvers,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { describe, expect, it } from 'vitest'

import { restPlugin } from './plugin.js'

const objectId = '01991f00-0000-7000-8000-000000000201'
const upsertRouteOption = { rest: { upsert: true } }
const viewer = new RequestContextValue<string>(
	'fixture.rest-virtual-http.viewer',
	(value) => {
		if (typeof value !== 'string')
			throw new TypeError('Viewer must be a string')
		return value
	},
)

const VirtualHttpRecord = Schema.define({
	...upsertRouteOption,
	className: 'RestHttpVirtualRecord',
	fields: (field) => ({
		title: field.string({ indexed: 'unique' }),
		displayTitle: field.virtual({
			output: (output) =>
				output.object({
					nullable: false,
					fields: (nested) => ({
						authority: nested.string({ nullable: false }),
						label: nested.string({ nullable: false }),
						viewer: nested.string({ nullable: false }),
					}),
				}),
			resolve: async ({ context, item }) => {
				await Promise.resolve()
				return {
					authority: context.access.mode,
					label: String(item.title).toUpperCase(),
					viewer: context.getValue(viewer) ?? 'anonymous',
				}
			},
			select: { title: true },
		}),
	}),
})

const VirtualFailureRecord = Schema.define({
	className: 'RestHttpVirtualFailure',
	fields: (field) => ({
		title: field.string(),
		broken: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: async () => {
				await Promise.resolve()
				throw new Error('private virtual dependency and resolver secret')
			},
			select: { title: true },
		}),
		invalid: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: () => 42 as unknown as string,
			select: { title: true },
		}),
		waiting: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ context }) =>
				new Promise<string>((_resolve, reject) => {
					context.signal.addEventListener(
						'abort',
						() => {
							const reason: unknown = context.signal.reason
							reject(
								reason instanceof Error
									? reason
									: new Error('Virtual resolver was cancelled', {
											cause: reason,
										}),
							)
						},
						{ once: true },
					)
				}),
			select: { title: true },
		}),
	}),
})

class VirtualDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	requests = 0

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests += 1
		const record = { id: objectId, title: 'Visible' }
		const result: unknown =
			request.operation.kind === 'find-many'
				? [record]
				: request.operation.kind === 'find-one'
					? record
					: record
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Virtual HTTP fixture rejects input before persistence')
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.rest-virtual-http-database',
		version: '1.0.0',
		capabilities: [
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
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.rest-virtual-http-capture',
		version: '1.0.0',
		capabilities: [httpRequirement],
		setup: ({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
		},
	})

const contextPlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.rest-virtual-http-context',
	version: '1.0.0',
	capabilities: [
		provideHttpContextResolvers({
			contributionId: 'viewer',
			create: () => [
				httpContextResolver({
					resolve: ({ context, request }) => {
						const authorization = request.headers.get('Authorization')
						return authorization === null
							? context
							: context.withValue(viewer, authorization)
					},
				}),
			],
		}),
	],
})

const createFixture = async (requestTimeoutMs?: number) => {
	const adapter = new VirtualDatabase()
	const capture: { current?: HttpApplication } = {}
	const application = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'rest-http-master', value: 'rest-http-secret' }],
			onUse: () => undefined,
		}),
		pluginPrivileges: { logger: false },
		plugins: [
			databasePlugin(adapter),
			contextPlugin,
			restPlugin({ acknowledgeUnverifiedProtection: true }),
			httpPlugin({
				appId: 'response-app',
				master: { enabled: true },
				...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
			}),
			capturePlugin(capture),
		],
		schemas: [VirtualHttpRecord, VirtualFailureRecord],
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

describe('REST virtual HTTP boundary', () => {
	it('resolves values with anonymous, authenticated, and Master context', async () => {
		const fixture = await createFixture()
		const path = '/api/v1/classes/RestHttpVirtualRecord?select=id,displayTitle'
		for (const testCase of [
			{ authority: 'anonymous', headers: {}, viewer: 'anonymous' },
			{
				authority: 'anonymous',
				headers: { Authorization: 'Bearer authenticated-viewer' },
				viewer: 'Bearer authenticated-viewer',
			},
			{
				authority: 'master',
				headers: { 'X-UltimaBase-Master-Key': 'rest-http-secret' },
				viewer: 'anonymous',
			},
		] as const) {
			const response = await fetchApplication(fixture.http, path, {
				headers: testCase.headers,
			})
			const body: unknown = await response.json()
			expect(response.status, JSON.stringify(body)).toBe(200)
			expect(body).toStrictEqual({
				results: [
					{
						displayTitle: {
							authority: testCase.authority,
							label: 'VISIBLE',
							viewer: testCase.viewer,
						},
						id: objectId,
					},
				],
			})
		}
		await fixture.application.dispose()
	})

	it('sanitizes resolver rejection and invalid virtual output', async () => {
		const fixture = await createFixture()
		for (const testCase of [
			{ code: 'INTERNAL_ERROR', field: 'broken', status: 500 },
			{ code: 'VALIDATION_ERROR', field: 'invalid', status: 422 },
		] as const) {
			const response = await fetchApplication(
				fixture.http,
				`/api/v1/classes/RestHttpVirtualFailure?select=${testCase.field}`,
			)
			const serialized = await response.text()
			expect(response.status, serialized).toBe(testCase.status)
			expect(serialized).toContain(testCase.code)
			expect(serialized).not.toMatch(/dependency|resolver|secret|title/u)
		}
		await fixture.application.dispose()
	})

	it('propagates cancellation to the HTTP deadline boundary', async () => {
		const fixture = await createFixture(10)
		const response = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpVirtualFailure?select=waiting',
		)
		expect(response.status).toBe(408)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_REQUEST_TIMEOUT' },
		})
		await fixture.application.dispose()
	})

	it('rejects virtual names from mutation and relationship inputs', async () => {
		const fixture = await createFixture()
		for (const testCase of [
			{
				body: { displayTitle: 'forged' },
				method: 'POST',
				path: '/api/v1/classes/RestHttpVirtualRecord',
			},
			{
				body: { displayTitle: 'forged' },
				method: 'PATCH',
				path: `/api/v1/classes/RestHttpVirtualRecord/${objectId}`,
			},
			{
				body: {
					create: { displayTitle: 'forged', title: 'new' },
					update: { displayTitle: 'forged' },
					where: { title: { eq: 'new' } },
				},
				method: 'POST',
				path: '/api/v1/classes/RestHttpVirtualRecord/upsert',
			},
		] as const) {
			const response = await fetchApplication(fixture.http, testCase.path, {
				body: JSON.stringify(testCase.body),
				headers: { 'Content-Type': 'application/json' },
				method: testCase.method,
			})
			const body: unknown = await response.json()
			expect(response.status, JSON.stringify(body)).toBe(400)
			expect(body).toMatchObject({
				error: { code: 'REST_MUTATION_INVALID_INPUT' },
			})
		}
		expect(fixture.adapter.requests).toBe(0)

		const relationship = await fetchApplication(
			fixture.http,
			'/api/v1/classes/RestHttpVirtualRecord?include=displayTitle',
		)
		expect(relationship.status).toBe(400)
		expect(await relationship.json()).toMatchObject({
			error: { code: 'REST_READ_INVALID_INPUT' },
		})
		await fixture.application.dispose()
	})
})
