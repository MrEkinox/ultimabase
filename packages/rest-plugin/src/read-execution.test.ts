import { onTestFinished, describe, expect, it } from 'vitest'
import {
	MasterAuthority,
	RequestContextValue,
	UltimaBase,
	applicationRequestExecutionCapability,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineCapability,
	plugin,
	contributeApplication,
	getCurrentRequest,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type AnonymousRequestAccess,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpPlugin,
	httpRoute,
	provideHttpEndpoints,
	type HttpApplication,
} from '@ultimabase/http-plugin'

import { executeRestReadRequest } from './reads.js'
import { restPlugin } from './plugin.js'

const recordId = '01991f00-0000-7000-8000-000000000010'
const missingId = '01991f00-0000-7000-8000-000000000011'
const record = {
	createdAt: '2026-09-05T10:00:00.000Z',
	id: recordId,
	title: 'Visible',
	updatedAt: '2026-09-05T10:00:00.000Z',
}

const RecordSchema = UltimaBase.Schema.define({
	className: 'RestExecutedRecord',
	fields: (field) => ({ title: field.string() }),
})

const principal = new RequestContextValue<string>(
	'fixture.rest-read-principal',
	(value) => {
		if (typeof value !== 'string')
			throw new TypeError('Expected a principal ID')
		return value
	},
)

interface ExecutionObservation {
	readonly access: RequestContext['access']
	readonly kind: DatabaseOperationAst['kind']
	readonly principal: string | undefined
	readonly requestId: string
	readonly signal: AbortSignal
}

class ReadDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly requests: DatabaseOperationRequest[] = []
	readonly observations: ExecutionObservation[] = []

	constructor(private readonly waitForAbort = false) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		const context = getCurrentRequest()
		this.observations.push({
			access: context.access,
			kind: request.operation.kind,
			principal: context.getValue(principal),
			requestId: context.requestId,
			signal: context.signal,
		})
		if (this.waitForAbort) {
			return new Promise<DatabaseOperationResult<TOperation>>(
				(_resolve, reject) => {
					const rejectForCancellation = (): void => {
						const reason: unknown = context.signal.reason
						reject(
							reason instanceof Error
								? reason
								: new Error('REST read execution was cancelled', {
										cause: reason,
									}),
						)
					}
					if (context.signal.aborted) {
						rejectForCancellation()
						return
					}
					context.signal.addEventListener(
						'abort',
						() => {
							rejectForCancellation()
						},
						{ once: true },
					)
				},
			)
		}
		const value: unknown =
			request.operation.kind === 'find-many'
				? [record]
				: request.operation.kind === 'count'
					? 1
					: request.operation.kind === 'exists'
						? true
						: request.operation.kind === 'get' &&
							  'id' in request.operation &&
							  request.operation.id === missingId
							? null
							: record
		return Promise.resolve(value as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('REST read tests do not open transactions')
	}
}

interface RequestHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
}

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const httpApplicationRequirement = requireCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const harnessCapability = defineCapability<
	Readonly<{ readonly ready: true }>
>()({
	capabilityId: 'fixture.rest-read-execution-harness',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([value]) => value,
})

const createHarnessPlugin = (harness: RequestHarness) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-read-execution',
		version: '1.0.0',
		permissions: {
			'authority:elevate': 'Verifies the REST Master execution fixture.',
		},
		contributions: [
			withPluginPrivileges(
				provideCapability(harnessCapability, {
					contributionId: 'harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.executor = capabilities.get(requestExecutionRequirement)
						harness.owner = owner
						return { value: { ready: true } }
					},
				}),
				['authority:elevate'],
			),
			requestExecutionRequirement,
		],
	})

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-read-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	})

const createDeadlineRoutePlugin = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-read-deadline-route',
		version: '1.0.0',
		permissions: {
			'transport:expose': 'Exposes the REST read deadline fixture.',
		},
		contributions: [
			provideHttpEndpoints({
				contributionId: 'rest-read-deadline',
				create: ({ capabilities }) => {
					const executor = capabilities.get(requestExecutionRequirement)
					return httpRoute({
						handle: async (request) => {
							const results = await executeRestReadRequest(
								executor,
								getCurrentRequest(),
								RecordSchema,
								{ operation: 'find', request },
							)
							return Response.json({ count: results.length })
						},
						method: 'GET',
						path: '/records',
						protocol: { name: 'ultimabase.rest', version: '1' },
					})
				},
			}),
			requestExecutionRequirement,
		],
	})

const createHttpCapturePlugin = (capture: { current?: HttpApplication }) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-read-http-capture',
		version: '1.0.0',
		contributions: [
			httpApplicationRequirement,
			contributeApplication(({ capabilities }) => {
				capture.current = capabilities.get(httpApplicationRequirement)
				const exports = undefined
				return { exports }
			}),
		],
	})

const readHarness = (harness: RequestHarness) => {
	if (
		harness.callbacks === undefined ||
		harness.executor === undefined ||
		harness.owner === undefined
	) {
		throw new TypeError('REST read execution harness is unavailable')
	}
	return {
		callbacks: harness.callbacks,
		executor: harness.executor,
		owner: harness.owner,
	}
}

const runAsHarness = <TResult>(
	harness: RequestHarness,
	callback: (executor: ApplicationRequestExecutor) => TResult,
): TResult => {
	const ready = readHarness(harness)
	return ready.callbacks.runPlugin(ready.owner, () => callback(ready.executor))
}

const createContext = (
	harness: RequestHarness,
	requestId: string,
	signal?: AbortSignal,
): RequestContext<AnonymousRequestAccess> =>
	runAsHarness(harness, (executor) =>
		executor
			.createAnonymousContext({
				requestId,
				...(signal === undefined ? {} : { signal }),
				source: 'ultimabase.rest',
			})
			.withValue(principal, 'session-user'),
	)

describe('REST read execution', () => {
	it('executes every read discriminant with the same operation as direct Query', async () => {
		const harness: RequestHarness = {}
		const adapter = new ReadDatabaseAdapter()
		const ultimabase = new (UltimaBase.use(
			restPlugin({ acknowledgeUnverifiedProtection: true }),
			createHarnessPlugin(harness),
			databasePlugin(adapter),
		))({
			pluginPrivileges: { logger: false },
			schemas: [RecordSchema],
		})
		onTestFinished(() => ultimabase.dispose())
		await ultimabase.start()
		const context = createContext(harness, 'rest-read-session')
		const where = { title: { eq: 'Visible' } } as const

		const found = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RecordSchema, {
				operation: 'find',
				request: new Request(
					`https://example.test/records?where=${encodeURIComponent(JSON.stringify(where))}`,
				),
			}),
		)
		const direct = await RecordSchema.findMany(
			{ limit: 100, where },
			{ context },
		)
		const first = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RecordSchema, {
				operation: 'first',
				request: new Request('https://example.test/records/first'),
			}),
		)
		const get = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RecordSchema, {
				id: recordId,
				operation: 'get',
				request: new Request('https://example.test/records/item'),
			}),
		)
		const count = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RecordSchema, {
				operation: 'count',
				request: new Request('https://example.test/records/count'),
			}),
		)
		const exists = await runAsHarness(harness, (executor) =>
			executeRestReadRequest(executor, context, RecordSchema, {
				operation: 'exists',
				request: new Request('https://example.test/records/exists'),
			}),
		)

		expect(found.map((item) => item.toJSON())).toStrictEqual(
			direct.map((item) => item.toJSON()),
		)
		expect(first?.toJSON()).toStrictEqual(record)
		expect(get.toJSON()).toStrictEqual(record)
		expect(count).toBe(1)
		expect(exists).toBe(true)
		expect(
			adapter.requests.map(({ operation }) => operation.kind),
		).toStrictEqual([
			'find-many',
			'find-many',
			'find-one',
			'get',
			'count',
			'exists',
		])
		expect(adapter.requests[0]?.operation).toStrictEqual(
			adapter.requests[1]?.operation,
		)
		expect(adapter.observations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					access: { mode: 'anonymous' },
					principal: 'session-user',
					requestId: 'rest-read-session',
				}),
			]),
		)
		await ultimabase.dispose()
	})

	it('preserves strict not-found, Master, cancellation, and application ownership', async () => {
		const firstHarness: RequestHarness = {}
		const secondHarness: RequestHarness = {}
		const firstAdapter = new ReadDatabaseAdapter()
		const secondAdapter = new ReadDatabaseAdapter()
		const first = new (UltimaBase.use(
			createHarnessPlugin(firstHarness),
			databasePlugin(firstAdapter),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'rest-master', value: 'rest-secret' }],
				onUse: () => undefined,
			}),
			pluginPrivileges: { logger: false },
			schemas: [RecordSchema],
		})
		onTestFinished(() => first.dispose())
		const second = new (UltimaBase.use(
			createHarnessPlugin(secondHarness),
			databasePlugin(secondAdapter),
		))({ pluginPrivileges: { logger: false }, schemas: [RecordSchema] })
		onTestFinished(() => second.dispose())
		await first.start()
		const anonymous = createContext(firstHarness, 'rest-read-security')
		const master = await runAsHarness(firstHarness, (executor) =>
			executor.verifyMasterKey({
				context: anonymous,
				rawKey: 'rest-secret',
				reason: 'REST read test',
			}),
		)

		await expect(
			runAsHarness(firstHarness, (executor) =>
				executeRestReadRequest(executor, anonymous, RecordSchema, {
					id: missingId,
					operation: 'get',
					request: new Request('https://example.test/records/missing'),
				}),
			),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		await expect(
			runAsHarness(firstHarness, (executor) =>
				executeRestReadRequest(executor, master, RecordSchema, {
					operation: 'count',
					request: new Request('https://example.test/records/count'),
				}),
			),
		).resolves.toBe(1)
		expect(firstAdapter.observations.at(-1)?.access).toMatchObject({
			keyId: 'rest-master',
			mode: 'master',
		})

		const controller = new AbortController()
		const cancelled = createContext(
			firstHarness,
			'rest-read-cancelled',
			controller.signal,
		)
		controller.abort('client disconnected')
		await expect(
			runAsHarness(firstHarness, (executor) =>
				executeRestReadRequest(executor, cancelled, RecordSchema, {
					operation: 'find',
					request: new Request('https://example.test/records', {
						signal: controller.signal,
					}),
				}),
			),
		).rejects.toBe('client disconnected')

		await first.dispose()
		await second.start()
		await expect(
			runAsHarness(secondHarness, (executor) =>
				executeRestReadRequest(executor, anonymous, RecordSchema, {
					operation: 'exists',
					request: new Request('https://example.test/records/exists'),
				}),
			),
		).rejects.toThrow(/belongs to another application/u)
		expect(secondAdapter.requests).toHaveLength(0)
		await Promise.all([first.dispose(), second.dispose()])
	})

	it('stops Runtime through the configured HTTP deadline signal', async () => {
		const adapter = new ReadDatabaseAdapter(true)
		const capture: { current?: HttpApplication } = {}
		const ultimabase = new (UltimaBase.use(
			databasePlugin(adapter),
			createDeadlineRoutePlugin(),
			restPlugin({ acknowledgeUnverifiedProtection: true }),
			httpPlugin({ appId: 'rest-deadline', requestTimeoutMs: 10 }),
			createHttpCapturePlugin(capture),
		))({
			pluginPrivileges: { logger: false },
			schemas: [RecordSchema],
		})
		onTestFinished(() => ultimabase.dispose())
		await ultimabase.start()
		if (capture.current === undefined) {
			throw new TypeError('REST deadline HTTP application is unavailable')
		}

		const response = await capture.current.fetch({
			originalHeaders: [['X-UltimaBase-Application-Id', 'rest-deadline']],
			request: new Request('https://example.test/records'),
		})

		expect(response.status).toBe(408)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_REQUEST_TIMEOUT' },
		})
		expect(adapter.requests).toHaveLength(1)
		expect(adapter.observations[0]?.signal.aborted).toBe(true)
		await ultimabase.dispose()
	})
})
