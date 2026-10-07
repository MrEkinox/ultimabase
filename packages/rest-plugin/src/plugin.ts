import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	contributeApplication,
	contributeDeclarations,
	plugin,
	provideCapability,
	requireCapability,
	type ApplicationOperationTransportPlanner,
	type ApplicationRequestExecutor,
	type CompiledSchemaRegistry,
	type PluginDeclarationContribution,
	type PluginIdentity,
	type PluginInstance,
	type PluginSchemaOptionSource,
} from '@ultimabase/core'
import { httpEndpointContributionsCapability } from '@ultimabase/http-plugin'
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

const restPluginPermissions = {
	'schema:declare': 'Declares the direct REST schema route option.',
	'transport:expose':
		'Generates explicitly configured public REST route metadata.',
} as const

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

	const compileSchemaRoutes = (
		owner: PluginIdentity,
		schemas: CompiledSchemaRegistry,
	) =>
		compileRestRouteFragment({
			basePath,
			defaultRoutes,
			owner,
			pluginVersion: restPluginVersion,
			schemas,
		})
	const compileOperationRoutes = (
		owner: PluginIdentity,
		planner: ApplicationOperationTransportPlanner,
		schemas: CompiledSchemaRegistry,
	) =>
		compileRestOperationRouteFragment({
			basePath,
			plan: planner.plan({
				operations: normalized.operations,
				transport: restProtocol,
			}),
			owner,
			pluginVersion: restPluginVersion,
			schemas,
		})
	const compileSchemaMutationRoutes = (
		owner: PluginIdentity,
		planner: ApplicationOperationTransportPlanner,
		schemas: CompiledSchemaRegistry,
	) =>
		compileRestSchemaMutationRouteFragment({
			basePath,
			defaultRoutes,
			owner,
			plan: planner.planSchemaMutations({ transport: restProtocol }),
			pluginVersion: restPluginVersion,
			schemas,
		})

	const routeProviders = [
		provideCapability(restRouteGraphCapability, {
			contributionId: 'official-rest-schema-routes',
			create: ({ owner, schemas }) => ({
				value: compileSchemaRoutes(owner, schemas),
			}),
		}),
		provideCapability(restRouteGraphCapability, {
			contributionId: 'official-rest-operation-routes',
			create: ({ capabilities, owner, schemas }) => ({
				value: compileOperationRoutes(
					owner,
					capabilities.get(transportPlanningRequirement),
					schemas,
				),
			}),
		}),
		provideCapability(restRouteGraphCapability, {
			contributionId: 'official-rest-schema-mutation-routes',
			create: ({ capabilities, owner, schemas }) => ({
				value: compileSchemaMutationRoutes(
					owner,
					capabilities.get(transportPlanningRequirement),
					schemas,
				),
			}),
		}),
	] as const
	const httpEndpointProvider = provideCapability(
		httpEndpointContributionsCapability,
		{
			contributionId: 'official-rest-http-dispatcher',
			create: ({ capabilities, owner, schemas }) => {
				const routeCount =
					compileSchemaRoutes(owner, schemas).routes.length +
					compileOperationRoutes(
						owner,
						capabilities.get(transportPlanningRequirement),
						schemas,
					).routes.length +
					compileSchemaMutationRoutes(
						owner,
						capabilities.get(transportPlanningRequirement),
						schemas,
					).routes.length
				const executor = capabilities.get(requestExecutionRequirement)
				const slot: { configuration?: RestHttpConfiguration } = {}
				httpSlots.set(executor, slot)
				return {
					value:
						routeCount === 0
							? immutableArray([])
							: createRestHttpMounts(
									normalized.mountPath,
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
	const application = contributeApplication(({ capabilities, schemas }) => {
		const routeGraph = capabilities.get(routeGraphRequirement)
		const readLimits = immutableRecord({
			bodyBytes: normalized.bodyLimit,
			maximumResults: normalized.maxLimit,
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
					capabilities.get(requestExecutionRequirement).exposeSchemaMutations({
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
	})
	return plugin({
		id: restPluginId,
		version: restPluginVersion,
		core: '^0.0.0',
		...(instanceId === undefined ? {} : { instanceId }),
		permissions: restPluginPermissions,
		contributions: [
			...routeProviders,
			httpEndpointProvider,
			routeGraphRequirement,
			requestExecutionRequirement,
			transportPlanningRequirement,
			declarations,
			application,
		],
	})
}
