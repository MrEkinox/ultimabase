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
	type PluginSchemaRulesSource,
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
	type RestSchemaRules,
} from './options.js'
import { createRestOpenApiDocument } from './openapi.js'
import { compileRestOperationRouteFragment } from './operation-routes.js'
import {
	restClassPath,
	restProtocol,
	restRouteGraphCapability,
	type RestPluginOperationRouteDefinition,
	type RestRouteDefinition,
	type RestRouteFragmentValue,
	type RestRouteGraph,
	type RestSchemaMutationRouteDefinition,
} from './routes.js'
import {
	compileRestRouteFragment,
	restRouteTemplates,
} from './schema-routes.js'
import {
	compileRestSchemaMutationRouteFragment,
	readExposableCommands,
	restCommandPath,
} from './schema-mutation-routes.js'
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

// The schema option projects nothing: `.with({ rest })` types it (ADR-0324).
type RestOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-rest-schema-option'
	readonly schema: Readonly<{ rest: typeof restSchemaOption }>
}>

type RestSource = RestOptionSource | PluginSchemaRulesSource<RestSchemaRules>

/** Names one configured REST v1 route generator. */
export type RestPlugin = PluginInstance<{
	readonly id: typeof restPluginId
	readonly exports: RestPluginExports
	readonly instanceId: string | undefined
	readonly version: typeof restPluginVersion
	readonly core: '^0.0.0'
	readonly source: RestSource
}>

// Native routes that write; with plugin commands they need a policy (ADR-0294).
const writeOperations: ReadonlySet<string> = new Set([
	'bulkCreate',
	'bulkDelete',
	'bulkUpdate',
	'bulkUpsert',
	'create',
	'delete',
	'update',
	'upsert',
])

const describeRoute = (route: RestRouteDefinition): string =>
	route.kind === 'rest-schema-mutation-route'
		? `${route.schema}.${route.command}`
		: route.kind === 'rest-schema-route'
			? `${route.method} ${route.path}`
			: route.operation

/**
 * Refuses to start when REST exposes writes and no protected policy is
 * installed, unless `publicWrites` opts in (ADR-0294).
 */
const assertPublicWrites = (
	routes: readonly RestRouteDefinition[],
	executor: ApplicationRequestExecutor,
	publicWrites: boolean,
): void => {
	if (publicWrites) return
	const writes = routes.filter(
		(route) =>
			route.kind === 'rest-schema-mutation-route' ||
			(route.kind === 'rest-schema-route' &&
				writeOperations.has(route.operation)),
	)
	if (writes.length === 0 || executor.hasProtectedPolicy()) return
	throw new TypeError(
		`REST exposes writes (${writes.slice(0, 3).map(describeRoute).join(', ')}${writes.length > 3 ? ', …' : ''}) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass restPlugin({ publicWrites: true }) to let every client write.`,
	)
}

/** Installs deterministic REST route metadata without executing Runtime. */
export const restPlugin = (options: RestPluginOptions = {}): RestPlugin => {
	const normalized = parseRestPluginOptions(options)
	const { basePath, defaultRule, instanceId } = normalized
	// Each application's HTTP mount reads the configuration its setup binds later.
	const httpSlots = new WeakMap<
		ApplicationRequestExecutor,
		{ configuration?: RestHttpConfiguration }
	>()

	// Each compiler sees the same configuration; planning is read only when needed.
	const routeConfig = {
		basePath,
		defaultRule,
		pluginVersion: restPluginVersion,
	}
	const planMutations = (planner: ApplicationOperationTransportPlanner) =>
		planner.planSchemaMutations({
			bindings: 'optional',
			transport: restProtocol,
		})
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
					hide: normalized.hide,
					owner,
					plan: planner().plan({ transport: restProtocol }),
					schemas,
				}),
		],
		[
			'official-rest-schema-mutation-routes',
			(owner, schemas, planner) =>
				compileRestSchemaMutationRouteFragment({
					...routeConfig,
					owner,
					plan: planMutations(planner()),
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
									basePath,
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
			const planner = capabilities.get(transportPlanningRequirement)
			const slot = httpSlots.get(capabilities.get(requestExecutionRequirement))
			if (slot !== undefined) {
				slot.configuration = immutableRecord({
					knownPaths: readKnownPaths(
						basePath,
						ownRoutes,
						readExposableCommands(planMutations(planner)),
					),
					limits: readLimits,
					logger,
					openapi: normalized.openapi
						? lazyDocument(() =>
								createRestOpenApiDocument({
									basePath,
									operations: planner.plan({ transport: restProtocol })
										.operations,
									routes: ownRoutes,
									schemas,
								}),
							)
						: undefined,
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
					'REST exposes no schema or operation: register application schemas in new App({ schemas }), or install a plugin or defineOperation() that declares public operations.',
				)
			} else if (capabilities.get(optionalHttpApplication) === undefined) {
				logger.warn(
					'REST has routes but no HTTP plugin to serve them: install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).',
				)
			}
			return {
				exports,
				startTransports: () => {
					const executor = capabilities.get(requestExecutionRequirement)
					assertPublicWrites(ownRoutes, executor, normalized.publicWrites)
					// REST settles ADR-0294 itself; Core's unverified-protection
					// warning stays only for GraphQL until migration step 6.6c.
					const handled = { acknowledgeUnverifiedProtection: true } as const
					// Core exposes only the exact allowlists compiled into this route graph.
					operations?.[1](
						executor.exposeOperations({
							...handled,
							operations: operationRoutes.map(({ operation }) => operation),
							transport: restProtocol,
						}),
					)
					schemaMutations?.[1](
						executor.exposeSchemaMutations({
							...handled,
							bindings: 'optional',
							transport: restProtocol,
						}),
					)
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

/** Builds a JSON document once, on the first request that reads it. */
const lazyDocument = (build: () => unknown): (() => string) => {
	let document: string | undefined
	return () => {
		document ??= JSON.stringify(build())
		return document
	}
}

/**
 * Every route path of each schema REST exposes, enabled or not, and of its
 * exposable commands: a request for a disabled method answers 405, not 404
 * (ADR-0324). A schema without any route stays 404.
 */
const readKnownPaths = (
	basePath: string,
	routes: readonly RestRouteDefinition[],
	commands: ReadonlyMap<
		string,
		readonly Readonly<{ command: string; schema: string }>[]
	>,
): readonly string[] => {
	const exposed = new Set(
		routes.flatMap((route) =>
			route.kind === 'rest-plugin-operation-route' ? [] : [route.schema],
		),
	)
	return immutableArray(
		[...exposed].flatMap((className) => {
			const classPath = restClassPath(basePath, className)
			return [...new Set(restRouteTemplates.map(({ suffix }) => suffix))]
				.map((suffix) => `${classPath}${suffix}`)
				.concat(
					(commands.get(className) ?? []).map(
						({ command }) => `${classPath}/{id}/${restCommandPath(command)}`,
					),
				)
		}),
	)
}
