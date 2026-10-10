import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	plugin,
	contributeApplication,
	getCurrentRequest,
	getOperationSchema,
	provideCapability,
	provideRuntimeBehavior,
	requireCapability,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PluginDefinition,
	type RuntimeLogicalOperationAst,
	type PreparedDatabaseOperation,
	type SchemaDefinition,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpRoute, provideHttpEndpoints } from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { withContext } from '@ultimabase/core/plugin'

const RuntimeProbe = UltimaBase.Schema.define({
	className: 'HttpRuntimeSecretProbe',
	fields: (field) => ({ title: field.string() }),
})

/** Limits the behavior observer to the probe's collection reads. */
const isProbeRead = (operation: RuntimeLogicalOperationAst): boolean =>
	operation.kind === 'find-many' &&
	getOperationSchema(operation) === RuntimeProbe

class ObservedTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	constructor(private readonly observations: unknown[]) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.observations.push({
			context: getCurrentRequest(),
			kind: 'transaction-execute',
			request,
		})
		return Promise.resolve([] as unknown as DatabaseOperationResult<TOperation>)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		void request
		throw new TypeError('Runtime propagation fixture executes reads only')
	}

	commit(): Promise<void> {
		this.observations.push({ context: getCurrentRequest(), kind: 'commit' })
		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.observations.push({ context: getCurrentRequest(), kind: 'rollback' })
		return Promise.resolve()
	}
}

class ObservedDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	constructor(private readonly observations: unknown[]) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		throw new TypeError('Runtime propagation fixture expects a transaction')
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		this.observations.push({
			context: getCurrentRequest(),
			kind: 'begin-transaction',
		})
		return Promise.resolve(new ObservedTransactionAdapter(this.observations))
	}
}

describe('HTTP Runtime propagation', () => {
	it('keeps one safe context through hooks, plans, transaction, audit, and logs', async () => {
		const rawSecret = 'runtime-master-secret'
		const observations: unknown[] = []
		const logs: unknown[] = []
		const audits: unknown[] = []
		let http: HttpApplication | undefined
		const runtimeState: {
			current?: UltimaBase<
				readonly SchemaDefinition[],
				readonly PluginDefinition[]
			>
		} = {}
		const database = plugin({
			id: 'fixture.http-runtime-database',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'observed-adapter',
					create: () => ({
						value: new ObservedDatabaseAdapter(observations),
					}),
				}),
			],
		})
		const hooks = plugin({
			id: 'fixture.http-runtime-hooks',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'runtime:intercept': 'Observes safe HTTP Runtime propagation.',
			},
			contributions: [
				provideRuntimeBehavior({
					contributionId: 'read-observer',
					create: () => ({
						value: {
							beforeOperation: (input) => {
								if (isProbeRead(input.operation)) {
									observations.push({ kind: 'before-hook', input })
								}
							},
							transformResult: (input) => {
								if (isProbeRead(input.operation)) {
									observations.push({ kind: 'after-hook', input })
								}
								return input.result
							},
						},
					}),
				}),
			],
		})
		const routeOwner = plugin({
			id: 'fixture.http-runtime-route',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Exposes the Runtime probe.' },
			contributions: [
				provideHttpEndpoints({
					contributionId: 'runtime-probe',
					create: () =>
						httpRoute({
							method: 'GET',
							path: '/runtime',
							protocol: { name: 'fixture.runtime', version: '1' },
							handle: async (request) => {
								const runtime = runtimeState.current
								if (runtime === undefined) {
									throw new TypeError('Runtime fixture is unavailable')
								}
								observations.push({
									context: getCurrentRequest(),
									headers: [...request.headers],
									kind: 'handler',
								})
								const engine = withContext(runtime, getCurrentRequest())
								const results = await engine.transaction(() =>
									RuntimeProbe.findMany(),
								)
								return Response.json({ count: results.length })
							},
						}),
				}),
			],
		})
		const applicationRequirement = requireCapability(
			httpApplicationCapability,
			'^1.0.0',
			{ phase: 'setup' },
		)
		const server = plugin({
			id: 'fixture.http-runtime-server',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				applicationRequirement,
				contributeApplication(({ capabilities }) => {
					http = capabilities.get(applicationRequirement)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const created = new (UltimaBase.use(
			database,
			hooks,
			routeOwner,
			httpPlugin({ appId: 'runtime-app', master: { enabled: true } }),
			server,
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'runtime', value: rawSecret }],
				onUse: (event) => {
					audits.push(event)
				},
			}),
			pluginPrivileges: {
				logger: {
					error: (report) => {
						logs.push(report)
					},
					info: (report) => {
						logs.push(report)
					},
				},
			},
			schemas: [RuntimeProbe],
		})
		runtimeState.current = created
		await created.start()
		if (http === undefined)
			throw new TypeError('HTTP Runtime fixture is missing')

		const response = await http.fetch({
			originalHeaders: [
				['X-UltimaBase-Application-Id', 'runtime-app'],
				['X-UltimaBase-Master-Key', rawSecret],
			],
			request: new Request('http://localhost/runtime', {
				headers: { 'X-UltimaBase-Master-Key': rawSecret },
			}),
		})
		expect(await response.json()).toStrictEqual({ count: 0 })
		expect(observations.map((entry) => JSON.stringify(entry))).toEqual(
			expect.arrayContaining([
				expect.stringContaining('begin-transaction'),
				expect.stringContaining('before-hook'),
				expect.stringContaining('transaction-execute'),
				expect.stringContaining('after-hook'),
				expect.stringContaining('commit'),
			]),
		)
		expect(JSON.stringify({ audits, logs, observations })).not.toContain(
			rawSecret,
		)
		await created.dispose()
	})
})
