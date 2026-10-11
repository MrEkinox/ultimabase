import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	type ApplicationOperationTransportPlanner,
	type ApplicationRequestExecutor,
	type CompiledSchemaRegistry,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	type PluginDeclarationContribution,
	type PluginIdentity,
	type PluginInstance,
	type PluginSchemaOptionSource,
} from '@ultimabase/core/plugin'
import {
	httpApplicationCapability,
	httpEndpointContributionsCapability,
} from '@ultimabase/http-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	parseRestPluginOptions,
	restSchemaOption,
	type RestPluginOptions,
} from './options.js'
import { compileRestOperationRouteFragment } from './operation-routes.js'
import {
	restProtocol,
	restRouteGraphCapability,
	type RestPluginOperationRouteDefinition,
	type RestRouteFragmentValue,
	type RestRouteGraph,
	type RestSchemaMutationRouteDefinition,
} from './routes.js'
import { compileRestRouteFragment } from './schema-routes.js'
import { compileRestSchemaMutationRouteFragment } from './schema-mutation-routes.js'
import {
	createRestOperationTransport,
	createRestSchemaMutationTransport,
	type RestOperationTransport,
	type RestSchemaMutationTransport,
} from './transports.js'
import type { RestReadLimits } from './reads.js'
import {
	createRestHttpMounts,
	type RestHttpConfiguration,
} from './http-handler.js'

const restPluginId = '@ultimabase/rest-plugin' as const
const restPluginVersion = '0.0.0' as const

const routeGraphRequirement = requireCapability(
	restRouteGraphCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const transportPlanningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
// Read at setup only, to warn when no HTTP plugin serves the routes (ADR-0313).
const optionalHttpApplication = optionalCapability(
	httpApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)

type RestRouteCompiler = (
	owner: PluginIdentity,
	schemas: CompiledSchemaRegistry,
	planner: () => ApplicationOperationTransportPlanner,
) => RestRouteFragmentValue

/** Exposes normalized routes plus the optional narrow operation executor. */
export interface RestPluginExports {
	readonly basePath: string
	readonly readLimits: RestReadLimits
	readonly routeGraph: RestRouteGraph
	/** Exists only when this REST instance explicitly exposes operations. */
	readonly operationTransport?: RestOperationTransport
	/** Exists only when this instance exposes plugin-owned schema mutations. */
	readonly schemaMutationTransport?: RestSchemaMutationTransport
}

// The installed option definition is also the configured factory's type source.
type RestOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-rest-schema-option'
	readonly schema: Readonly<{ rest: typeof restSchemaOption }>
}>

/** Names one configured REST v1 route generator. */
export type RestPlugin = PluginInstance<{
	readonly id: typeof restPluginId
	readonly exports: RestPluginExports
	readonly instanceId: string | undefined
	readonly version: typeof restPluginVersion
	readonly core: '^0.0.0'
	readonly source: RestOptionSource
}>

/** Installs deterministic REST v1 route metadata without executing Runtime. */
export const restPlugin = (options: RestPluginOptions = {}): RestPlugin => {
	const normalized = parseRestPluginOptions(options)
	const { basePath, defaultRoutes, instanceId } = normalized
	const acknowledgement =
		normalized.acknowledgeUnverifiedProtection === true
			? { acknowledgeUnverifiedProtection: true as const }
			: {}
	// Each application's HTTP mount reads the configuration its setup binds later.
	const httpSlots = new WeakMap<
		ApplicationRequestExecutor,
		{ configuration?: RestHttpConfiguration }
	>()

	// Each compiler sees the same configuration; planning is read only when needed.
	const routeConfig = {
		basePath,
		defaultRoutes,
		pluginVersion: restPluginVersion,
	}
	const compilers: readonly [string, RestRouteCompiler][] = [
		[
			'official-rest-schema-routes',
			(owner, schemas) =>
				compileRestRouteFragment({ ...routeConfig, owner, schemas }),
		],
		[
			'official-rest-operation-routes',
			(owner, schemas, planner) =>
				compileRestOperationRouteFragment({
					...routeConfig,
					owner,
					plan: planner().plan({
						operations: normalized.operations,
						transport: restProtocol,
					}),
					schemas,
				}),
		],
		[
			'official-rest-schema-mutation-routes',
			(owner, schemas, planner) =>
				compileRestSchemaMutationRouteFragment({
					...routeConfig,
					owner,
					plan: planner().planSchemaMutations({ transport: restProtocol }),
					schemas,
				}),
		],
	]
	const routeProviders = compilers.map(([contributionId, compile]) =>
		provideCapability(restRouteGraphCapability, {
			contributionId,
			create: ({ capabilities, owner, schemas }) => ({
				value: compile(owner, schemas, () =>
					capabilities.get(transportPlanningRequirement),
				),
			}),
		}),
	)
	const httpEndpointProvider = provideCapability(
		httpEndpointContributionsCapability,
		{
			contributionId: 'official-rest-http-dispatcher',
			create: ({ capabilities, owner, schemas }) => {
				const routeCount = compilers.reduce(
					(count, [, compile]) =>
						count +
						compile(owner, schemas, () =>
							capabilities.get(transportPlanningRequirement),
						).routes.length,
					0,
				)
				const executor = capabilities.get(requestExecutionRequirement)
				const slot: { configuration?: RestHttpConfiguration } = {}
				httpSlots.set(executor, slot)
				return {
					value:
						routeCount === 0
							? immutableArray([])
							: createRestHttpMounts(
									normalized.mountPath,
									normalized.bodyLimit,
									executor,
									schemas,
									() => slot.configuration,
								),
				}
			},
		},
	)
	const declarations: PluginDeclarationContribution<
		readonly [],
		RestOptionSource
	> = contributeDeclarations({
		schema: ({ schemas }) =>
			schemas.defineOptions({
				contributionId: 'official-rest-schema-option',
				schema: { rest: restSchemaOption },
			}),
	})
	const application = contributeApplication(
		({ capabilities, logger, schemas }) => {
			const routeGraph = capabilities.get(routeGraphRequirement)
			const readLimits = immutableRecord({
				// Without its own limit REST inherits the HTTP one, which HTTP enforces.
				bodyBytes: normalized.bodyLimit ?? Number.MAX_SAFE_INTEGER,
				defaultTake: normalized.pagination.defaultTake,
				maxTake: normalized.pagination.maxTake,
			})
			const ownRoutes = routeGraph.routes.filter(
				({ provenance: { plugin } }) =>
					plugin.pluginId === restPluginId && plugin.instanceId === instanceId,
			)
			const operationRoutes = ownRoutes.filter(
				(route): route is RestPluginOperationRouteDefinition =>
					route.kind === 'rest-plugin-operation-route',
			)
			const schemaMutationRoutes = ownRoutes.filter(
				(route): route is RestSchemaMutationRouteDefinition =>
					route.kind === 'rest-schema-mutation-route',
			)
			const operations =
				operationRoutes.length === 0
					? undefined
					: createRestOperationTransport(operationRoutes, schemas)
			const schemaMutations =
				schemaMutationRoutes.length === 0
					? undefined
					: createRestSchemaMutationTransport(schemaMutationRoutes)
			const operationTransport = operations?.[0]
			const schemaMutationTransport = schemaMutations?.[0]
			const slot = httpSlots.get(capabilities.get(requestExecutionRequirement))
			if (slot !== undefined) {
				slot.configuration = immutableRecord({
					limits: readLimits,
					logger,
					operationTransport,
					routes: immutableArray(ownRoutes),
					schemaMutationTransport,
				})
			} else if (ownRoutes.length > 0) {
				throw new TypeError('REST HTTP owner state is unavailable')
			}
			const exports = immutableRecord({
				basePath,
				readLimits,
				routeGraph,
				...(operationTransport === undefined ? {} : { operationTransport }),
				...(schemaMutationTransport === undefined
					? {}
					: { schemaMutationTransport }),
			})
			if (ownRoutes.length === 0) {
				logger.warn(
					'REST exposes no schema or operation: register application schemas in new App({ schemas }) or pass restPlugin({ operations }).',
				)
			} else if (capabilities.get(optionalHttpApplication) === undefined) {
				logger.warn(
					'REST has routes but no HTTP plugin to serve them: install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).',
				)
			}
			return {
				exports,
				startTransports: () => {
					// Core exposes only the exact allowlists compiled into this route graph.
					operations?.[1](
						capabilities.get(requestExecutionRequirement).exposeOperations({
							...acknowledgement,
							operations: normalized.operations,
							transport: restProtocol,
						}),
					)
					schemaMutations?.[1](
						capabilities
							.get(requestExecutionRequirement)
							.exposeSchemaMutations({
								...acknowledgement,
								transport: restProtocol,
							}),
					)
					if (routeGraph.routes.length === 0) return
					capabilities
						.get(requestExecutionRequirement)
						.reportPublicTransportProtection({
							...acknowledgement,
							transport: restProtocol,
						})
				},
			}
		},
	)
	return plugin({
		id: restPluginId,
		version: restPluginVersion,
		core: '^0.0.0',
		...(instanceId === undefined ? {} : { instanceId }),
		contributions: [
			...routeProviders,
			httpEndpointProvider,
			routeGraphRequirement,
			requestExecutionRequirement,
			transportPlanningRequirement,
			optionalHttpApplication,
			declarations,
			application,
		],
	})
}
