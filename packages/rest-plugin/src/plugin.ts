import {
	applicationRequestExecutionCapability,
	provideCapability,
	requireCapability,
	type ApplicationRequestExecutor,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import {
	normalizeRestSchemaRoutes,
	restSchemaOption,
	type RestSchemaRoutesOption,
} from './options.js'
import {
	compileRestRouteFragment,
	restProtocol,
	restRouteGraphCapability,
	type RestRouteGraph,
} from './routes.js'

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
	/** Supplies sparse route defaults inherited by application schemas. */
	readonly default?: RestSchemaRoutesOption
	/** Distinguishes two explicit REST configurations in one application. */
	readonly instanceId?: string
}

/** Exposes only the inert route graph and normalized configuration. */
export interface RestPluginExports {
	readonly basePath: string
	readonly routeGraph: RestRouteGraph
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

const parseRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		'acknowledgeUnverifiedProtection',
		'basePath',
		'default',
		'instanceId',
	] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		basePath,
		default: defaultRoutes,
		instanceId,
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
			defaultRoutes:
				defaultRoutes === undefined
					? undefined
					: normalizeRestSchemaRoutes(defaultRoutes, 'REST plugin default'),
			instanceId,
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
	const capabilities: RestPluginCapabilities = {
		provides: [routeProvider],
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
		setup: ({ capabilities: reader }) =>
			immutableRecord({
				basePath: normalized.basePath,
				routeGraph: reader.get(routeGraphRequirement),
			}),
		hooks: {
			startTransports: ({ capabilities: reader, pluginExports }) => {
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
