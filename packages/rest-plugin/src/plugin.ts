import {
	applicationRequestExecutionCapability,
	isPluginOperationDefinition,
	provideCapability,
	requireCapability,
	type ApplicationRequestExecutor,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginOperationDefinition,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	normalizeRestSchemaRoutes,
	restSchemaOption,
	type RestSchemaRoutesOption,
} from './options.js'
import {
	bindRestOperationTransport,
	createRestOperationTransport,
	type RestOperationTransport,
} from './operation-execution.js'
import { compileRestOperationRouteFragment } from './operation-routes.js'
import {
	restProtocol,
	restRouteGraphCapability,
	type RestPluginOperationRouteDefinition,
	type RestRouteGraph,
} from './routes.js'
import { compileRestRouteFragment } from './schema-routes.js'
import { defaultRestReadLimits, type RestReadLimits } from './reads.js'

const restPluginModule: PluginModule<
	'@ultimabase/rest-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/rest-plugin',
	version: '0.0.0',
})

const routeGraphRequirement: CapabilityRequirement<
	typeof restRouteGraphCapability,
	false,
	'^1.0.0',
	'setup'
> = requireCapability(restRouteGraphCapability, '^1.0.0', { phase: 'setup' })
const requestExecutionRequirement: CapabilityRequirement<
	typeof applicationRequestExecutionCapability,
	false,
	'^1.0.0',
	'setup'
> = requireCapability(applicationRequestExecutionCapability, '^1.0.0', {
	phase: 'setup',
})

/** Configures immutable REST v1 schema-route generation. */
export interface RestPluginOptions {
	/** Accepts Core's inability to prove complete public policy coverage. */
	readonly acknowledgeUnverifiedProtection?: true
	/** Absolute normalized prefix; REST always appends `/v1`. @default "/api" */
	readonly basePath?: string
	/** Maximum streamed JSON request size in bytes. @default 1048576 */
	readonly bodyLimit?: number
	/** Supplies sparse route defaults inherited by application schemas. */
	readonly default?: RestSchemaRoutesOption
	/** Distinguishes two explicit REST configurations in one application. */
	readonly instanceId?: string
	/** Maximum accepted collection limit. @default 1000 */
	readonly maxLimit?: number
	/** Explicitly exposes these exact application operation tokens through REST. */
	readonly operations?: readonly PluginOperationDefinition[]
}

/** Exposes normalized routes plus the optional narrow operation executor. */
export interface RestPluginExports {
	readonly basePath: string
	readonly readLimits: RestReadLimits
	readonly routeGraph: RestRouteGraph
	/** Exists only when this REST instance explicitly exposes operations. */
	readonly operationTransport?: RestOperationTransport
}

const normalizeOperations = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('REST plugin operations must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`REST plugin operations[${String(index)}] must be an operation token`,
			)
		}
		if (operation.target !== 'application') {
			throw new TypeError(
				`REST plugin operation ${operation.name} must target the application`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`REST plugin operations repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

const normalizeBasePath = (value: unknown): string => {
	if (value === undefined) return '/api/v1'
	if (typeof value !== 'string' || !value.startsWith('/')) {
		throw new TypeError('REST plugin basePath must be an absolute path')
	}
	if (value.includes('?') || value.includes('#')) {
		throw new TypeError(
			'REST plugin basePath cannot contain a query or fragment',
		)
	}
	if (value.length > 1 && value.endsWith('/')) {
		throw new TypeError('REST plugin basePath cannot have a trailing slash')
	}
	const segments = value === '/' ? [] : value.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) {
		throw new TypeError('REST plugin basePath must not contain empty segments')
	}
	for (const segment of segments) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError('REST plugin basePath contains invalid encoding')
		}
		if (decoded === '.' || decoded === '..' || decoded === 'v1') {
			throw new TypeError(
				'REST plugin basePath cannot contain dot or protocol-version segments',
			)
		}
	}
	return value === '/' ? '/v1' : `${value}/v1`
}

const normalizePositiveSafeInteger = (
	value: unknown,
	name: string,
	fallback: number,
): number => {
	if (value === undefined) return fallback
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`REST plugin ${name} must be a positive safe integer`)
	}
	return value
}

const parseRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		'acknowledgeUnverifiedProtection',
		'basePath',
		'bodyLimit',
		'default',
		'instanceId',
		'maxLimit',
		'operations',
	] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		basePath,
		bodyLimit,
		default: defaultRoutes,
		instanceId,
		maxLimit,
		operations,
	}) => {
		if (
			acknowledgeUnverifiedProtection !== undefined &&
			acknowledgeUnverifiedProtection !== true
		) {
			throw new TypeError(
				'REST plugin acknowledgeUnverifiedProtection must be true when provided',
			)
		}
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError('REST plugin instanceId must be a non-empty string')
		}
		return {
			acknowledgeUnverifiedProtection,
			basePath: normalizeBasePath(basePath),
			bodyLimit: normalizePositiveSafeInteger(
				bodyLimit,
				'bodyLimit',
				defaultRestReadLimits.bodyBytes,
			),
			defaultRoutes:
				defaultRoutes === undefined
					? undefined
					: normalizeRestSchemaRoutes(defaultRoutes, 'REST plugin default'),
			instanceId,
			maxLimit: normalizePositiveSafeInteger(
				maxLimit,
				'maxLimit',
				defaultRestReadLimits.maximumResults,
			),
			operations: normalizeOperations(operations),
		}
	},
})

const restPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct REST schema route option.',
	},
	{
		name: 'transport:expose',
		reason: 'Generates explicitly configured public REST route metadata.',
	},
] as const

type RestPluginCapabilities = Readonly<{
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof restRouteGraphCapability>,
		CapabilityProviderDeclaration<typeof restRouteGraphCapability>,
	]
	readonly requires: readonly [
		typeof routeGraphRequirement,
		typeof requestExecutionRequirement,
	]
}>

type RestPluginDefinition = Readonly<{
	readonly capabilities: RestPluginCapabilities
	readonly declare: () => undefined
	readonly hooks: Readonly<{
		readonly startTransports: (
			context: Readonly<{
				readonly capabilities: Readonly<{
					get(
						requirement: typeof requestExecutionRequirement,
					): ApplicationRequestExecutor
				}>
				readonly pluginExports: RestPluginExports
			}>,
		) => void
	}>
	readonly instanceId: string | undefined
	readonly privileges: typeof restPluginPrivileges
	readonly setup: () => RestPluginExports
}>

/** Names one configured REST v1 route generator. */
export type RestPlugin = PluginModuleInstance<
	typeof restPluginModule,
	RestPluginDefinition
>

/** Installs deterministic REST v1 route metadata without executing Runtime. */
export const restPlugin = (options: RestPluginOptions = {}): RestPlugin => {
	const normalized = parseRestPluginOptions(options)
	const routeProvider = provideCapability(restRouteGraphCapability, {
		contributionId: 'official-rest-schema-routes',
		create: ({ owner, schemas }) => ({
			value: compileRestRouteFragment({
				basePath: normalized.basePath,
				defaultRoutes: normalized.defaultRoutes,
				owner,
				pluginVersion: restPluginModule.version,
				schemas,
			}),
		}),
	})
	const operationRouteProvider = provideCapability(restRouteGraphCapability, {
		contributionId: 'official-rest-operation-routes',
		create: ({ owner }) => ({
			value: compileRestOperationRouteFragment({
				basePath: normalized.basePath,
				operations: normalized.operations,
				owner,
				pluginVersion: restPluginModule.version,
			}),
		}),
	})
	const capabilities: RestPluginCapabilities = {
		provides: [routeProvider, operationRouteProvider],
		requires: [routeGraphRequirement, requestExecutionRequirement],
	}

	return restPluginModule.plugin({
		...(normalized.instanceId === undefined
			? {}
			: { instanceId: normalized.instanceId }),
		capabilities,
		privileges: restPluginPrivileges,
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-rest-schema-option',
				schema: { rest: restSchemaOption },
			})
		},
		setup: ({ capabilities: reader }) => {
			const routeGraph = reader.get(routeGraphRequirement)
			const readLimits = immutableRecord({
				bodyBytes: normalized.bodyLimit,
				maximumResults: normalized.maxLimit,
			})
			const operationRoutes = routeGraph.routes.filter(
				(route): route is RestPluginOperationRouteDefinition =>
					route.kind === 'rest-plugin-operation-route' &&
					route.provenance.plugin.pluginId === restPluginModule.pluginId &&
					route.provenance.plugin.instanceId === normalized.instanceId,
			)
			const operationTransport =
				operationRoutes.length === 0
					? undefined
					: createRestOperationTransport(operationRoutes)
			return immutableRecord({
				basePath: normalized.basePath,
				readLimits,
				routeGraph,
				...(operationTransport === undefined ? {} : { operationTransport }),
			})
		},
		hooks: {
			startTransports: ({ capabilities: reader, pluginExports }) => {
				if (pluginExports.operationTransport !== undefined) {
					bindRestOperationTransport(
						pluginExports.operationTransport,
						reader.get(requestExecutionRequirement).exposeOperations({
							...(normalized.acknowledgeUnverifiedProtection === true
								? { acknowledgeUnverifiedProtection: true as const }
								: {}),
							operations: normalized.operations,
							transport: restProtocol,
						}),
					)
				}
				if (pluginExports.routeGraph.routes.length === 0) return
				reader
					.get(requestExecutionRequirement)
					.reportPublicTransportProtection({
						...(normalized.acknowledgeUnverifiedProtection === true
							? { acknowledgeUnverifiedProtection: true as const }
							: {}),
						transport: restProtocol,
					})
			},
		},
	})
}
