import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { assertExactObjectKeys } from '../exact-object-validation.js'
import type { PluginDefinition } from '../plugins/definition.js'
import type { PluginGraph } from '../plugins/graph.js'
import {
	pluginEnvironmentClaimMetadata,
	pluginEnvironmentClaims,
	pluginPrivilegeMetadata,
	pluginPrivilegeNames,
	snapshotPluginIdentity,
	snapshotVocabularyList,
	type PluginEnvironmentClaim,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeSeverity,
} from '../plugins/manifest.js'
import type {
	ConfiguredPlugin,
	ConfiguredPluginId,
} from './configured-plugins.js'

/** Denies enforceable privileges separately from informational environment claims. */
export interface PluginPrivilegePolicyScope {
	/** Denies exact Core-owned powers. @example `deny: ['adapter:raw']` */
	readonly deny?: readonly PluginPrivilege[]
	/** Rejects plugins that announce these direct Node.js behaviors. @example `denyClaims: ['environment:network']` */
	readonly denyClaims?: readonly PluginEnvironmentClaim[]
}

type ConfiguredPluginInstanceId<
	TPlugins extends readonly PluginDefinition[],
	TPluginId extends ConfiguredPluginId<TPlugins>,
> =
	ConfiguredPlugin<TPlugins> extends infer TPlugin
		? TPlugin extends PluginDefinition
			? TPlugin['manifest']['identity']['pluginId'] extends TPluginId
				? Exclude<TPlugin['manifest']['identity']['instanceId'], undefined>
				: never
			: never
		: never

/** Applies cumulative denials to all or one exact instance of a stable plugin ID. */
export type PluginPrivilegePluginPolicy<TInstanceId extends string = string> =
	PluginPrivilegePolicyScope &
		([TInstanceId] extends [never]
			? { readonly instances?: never }
			: {
					readonly instances?: Readonly<
						Partial<Record<TInstanceId, PluginPrivilegePolicyScope>>
					>
				})

type PluginPrivilegePolicies<TPlugins extends readonly PluginDefinition[]> =
	string extends ConfiguredPluginId<TPlugins>
		? Readonly<Record<string, PluginPrivilegePluginPolicy>>
		: {
				readonly [
					TPluginId in ConfiguredPluginId<TPlugins>
				]?: PluginPrivilegePluginPolicy<
					ConfiguredPluginInstanceId<TPlugins, TPluginId>
				>
			}

/** Receives one complete detached startup report through the matching result channel. */
export interface PluginPrivilegeLogger {
	/** Receives successful policy reports. */
	readonly info: (report: PluginPrivilegeReport) => unknown
	/** Receives reports containing active denials. */
	readonly error: (report: PluginPrivilegeReport) => unknown
}

/** Configures cumulative application-local plugin denials and startup reporting. */
export interface PluginPrivilegePolicy<
	TPlugins extends readonly PluginDefinition[] = readonly PluginDefinition[],
> extends PluginPrivilegePolicyScope {
	/** Applies additional denials by stable plugin ID and optional exact instance. */
	readonly plugins?: PluginPrivilegePolicies<TPlugins>
	/** Replaces the default console logger or explicitly silences it with `false`. */
	readonly logger?: PluginPrivilegeLogger | false
}

/** Reports one requested privilege without retaining its capability condition token. */
export interface PluginPrivilegeRequestReport {
	readonly blockedPhase?: 'before-static-declaration'
	readonly name: PluginPrivilege
	readonly reason: string
	readonly severity: PluginPrivilegeSeverity
	readonly active: boolean
	readonly policyResult: 'allowed' | 'denied'
}

/** Reports one informational direct-environment claim and its policy result. */
export interface PluginEnvironmentClaimReport {
	readonly blockedPhase?: 'before-static-declaration'
	readonly name: PluginEnvironmentClaim
	readonly reason: string
	readonly severity: PluginPrivilegeSeverity
	readonly policyResult: 'allowed' | 'denied'
}

/** Reports one flattened plugin in deterministic graph order. */
export interface PluginPrivilegePluginReport {
	readonly order: number
	readonly identity: PluginIdentity
	readonly version: string
	readonly privileges: readonly PluginPrivilegeRequestReport[]
	readonly environment: readonly PluginEnvironmentClaimReport[]
}

/** Contains the complete detached result of pre-effect plugin policy evaluation. */
export interface PluginPrivilegeReport {
	readonly allowed: boolean
	readonly plugins: readonly PluginPrivilegePluginReport[]
}

interface NormalizedPolicyScope {
	readonly deny: ReadonlySet<PluginPrivilege>
	readonly denyClaims: ReadonlySet<PluginEnvironmentClaim>
}

interface NormalizedPluginPolicy extends NormalizedPolicyScope {
	readonly instances: ReadonlyMap<string, NormalizedPolicyScope>
}

interface NormalizedPluginPrivilegePolicy extends NormalizedPolicyScope {
	readonly plugins: ReadonlyMap<string, NormalizedPluginPolicy>
	readonly logger: PluginPrivilegeLogger | false
}

export interface EvaluatedPluginPrivilegePolicy {
	readonly report: PluginPrivilegeReport
	readonly logger: PluginPrivilegeLogger | false
}

const defaultPluginPrivilegeLogger: PluginPrivilegeLogger = Object.freeze({
	info: (report: PluginPrivilegeReport): void => {
		console.info('[UltimaBase] Plugin privilege report', report)
	},
	error: (report: PluginPrivilegeReport): void => {
		console.error('[UltimaBase] Plugin privilege report', report)
	},
})

const policyScopeKeys = new Set(['deny', 'denyClaims'])
const pluginPolicyKeys = new Set(['deny', 'denyClaims', 'instances'])
const rootPolicyKeys = new Set(['deny', 'denyClaims', 'logger', 'plugins'])

const normalizeDeniedValues = <TValue extends string>(
	values: unknown,
	accepted: readonly TValue[],
	path: string,
): ReadonlySet<TValue> =>
	new Set(
		values === undefined
			? []
			: snapshotVocabularyList(values, accepted, {
					notArray: `${path} must be an array`,
					unknown: (index, value) =>
						`${path}[${String(index)}] is unknown: ${String(value)}`,
					duplicate: (value) => `Duplicate ${path} entry: ${value}`,
				}),
	)

const normalizeScope = (
	value: unknown,
	path: string,
	acceptedKeys: ReadonlySet<string> = policyScopeKeys,
): NormalizedPolicyScope => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertExactObjectKeys(
		value,
		acceptedKeys,
		`${path} contains unknown option: `,
	)

	return {
		deny: normalizeDeniedValues(
			value.deny,
			pluginPrivilegeNames,
			`${path}.deny`,
		),
		denyClaims: normalizeDeniedValues(
			value.denyClaims,
			pluginEnvironmentClaims,
			`${path}.denyClaims`,
		),
	}
}

const normalizeLogger = (value: unknown): PluginPrivilegeLogger | false => {
	if (value === undefined) return defaultPluginPrivilegeLogger
	if (value === false) return false

	if (!isPlainRecord(value)) {
		throw new TypeError(
			'pluginPrivileges.logger must be false or a plain object',
		)
	}

	assertExactObjectKeys(
		value,
		new Set(['error', 'info']),
		'pluginPrivileges.logger contains unknown option: ',
	)
	if (typeof value.info !== 'function') {
		throw new TypeError('pluginPrivileges.logger.info must be a function')
	}
	if (typeof value.error !== 'function') {
		throw new TypeError('pluginPrivileges.logger.error must be a function')
	}

	return immutableRecord({
		error: value.error as PluginPrivilegeLogger['error'],
		info: value.info as PluginPrivilegeLogger['info'],
	})
}

const normalizePluginPolicy = (
	value: unknown,
	path: string,
	configuredInstances: ReadonlySet<string>,
): NormalizedPluginPolicy => {
	const scope = normalizeScope(value, path, pluginPolicyKeys)
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	const instances = new Map<string, NormalizedPolicyScope>()
	if (value.instances !== undefined) {
		if (!isPlainRecord(value.instances)) {
			throw new TypeError(`${path}.instances must be a plain object`)
		}

		for (const [instanceId, instancePolicy] of Object.entries(
			value.instances,
		)) {
			if (!configuredInstances.has(instanceId)) {
				throw new TypeError(
					`${path}.instances targets unknown instance: ${instanceId}`,
				)
			}

			instances.set(
				instanceId,
				normalizeScope(instancePolicy, `${path}.instances.${instanceId}`),
			)
		}
	}

	return { ...scope, instances }
}

const normalizePolicy = (
	graph: PluginGraph,
	policy: unknown,
): NormalizedPluginPrivilegePolicy => {
	if (policy === undefined) {
		return {
			deny: new Set(),
			denyClaims: new Set(),
			plugins: new Map(),
			logger: defaultPluginPrivilegeLogger,
		}
	}

	if (!isPlainRecord(policy)) {
		throw new TypeError('pluginPrivileges must be a plain object')
	}

	const scope = normalizeScope(policy, 'pluginPrivileges', rootPolicyKeys)
	const plugins = new Map<string, NormalizedPluginPolicy>()
	const graphPluginsById = new Map<string, Set<string>>()

	for (const plugin of graph) {
		const identity = plugin.definition.manifest.identity
		const instances = graphPluginsById.get(identity.pluginId) ?? new Set()
		if (identity.instanceId !== undefined) instances.add(identity.instanceId)
		graphPluginsById.set(identity.pluginId, instances)
	}

	if (policy.plugins !== undefined) {
		if (!isPlainRecord(policy.plugins)) {
			throw new TypeError('pluginPrivileges.plugins must be a plain object')
		}

		for (const [pluginId, pluginPolicy] of Object.entries(policy.plugins)) {
			const configuredInstances = graphPluginsById.get(pluginId)
			if (configuredInstances === undefined) {
				throw new TypeError(
					`pluginPrivileges.plugins targets unknown plugin: ${pluginId}`,
				)
			}

			plugins.set(
				pluginId,
				normalizePluginPolicy(
					pluginPolicy,
					`pluginPrivileges.plugins.${pluginId}`,
					configuredInstances,
				),
			)
		}
	}

	return { ...scope, plugins, logger: normalizeLogger(policy.logger) }
}

const isDenied = <TValue>(
	value: TValue,
	globalValues: ReadonlySet<TValue>,
	pluginValues: ReadonlySet<TValue> | undefined,
	instanceValues: ReadonlySet<TValue> | undefined,
): boolean =>
	globalValues.has(value) ||
	pluginValues?.has(value) === true ||
	instanceValues?.has(value) === true

const createPluginReport = (
	graph: PluginGraph,
	policy: NormalizedPluginPrivilegePolicy,
): PluginPrivilegeReport => {
	let allowed = true
	const plugins = graph.plugins.map((plugin, order) => {
		const manifest = plugin.definition.manifest
		const identity = manifest.identity
		const pluginPolicy = policy.plugins.get(identity.pluginId)
		const instancePolicy =
			identity.instanceId === undefined
				? undefined
				: pluginPolicy?.instances.get(identity.instanceId)
		const privilegeReports = manifest.privileges.map((request) => {
			const active = graph.capabilities.isPrivilegeActive(identity, request)
			const denied = isDenied(
				request.name,
				policy.deny,
				pluginPolicy?.deny,
				instancePolicy?.deny,
			)

			if (active && denied) allowed = false

			return immutableRecord({
				...(active && denied
					? { blockedPhase: 'before-static-declaration' as const }
					: {}),
				name: request.name,
				reason: request.reason,
				severity: pluginPrivilegeMetadata[request.name].severity,
				active,
				policyResult: denied ? ('denied' as const) : ('allowed' as const),
			})
		})
		const environmentReports = manifest.environment.map((name) => {
			const metadata = pluginEnvironmentClaimMetadata[name]
			const denied = isDenied(
				name,
				policy.denyClaims,
				pluginPolicy?.denyClaims,
				instancePolicy?.denyClaims,
			)

			if (denied) allowed = false

			return immutableRecord({
				...(denied
					? { blockedPhase: 'before-static-declaration' as const }
					: {}),
				name,
				reason: metadata.reason,
				severity: metadata.severity,
				policyResult: denied ? ('denied' as const) : ('allowed' as const),
			})
		})

		return immutableRecord({
			order,
			identity: snapshotPluginIdentity(identity),
			version: manifest.version,
			privileges: immutableArray(privilegeReports),
			environment: immutableArray(environmentReports),
		})
	})

	return immutableRecord({ allowed, plugins: immutableArray(plugins) })
}

/** Evaluates cumulative policy scopes without executing plugin callbacks. */
export const evaluatePluginPrivilegePolicy = <
	TPlugins extends readonly PluginDefinition[],
>(
	graph: PluginGraph,
	policy: PluginPrivilegePolicy<TPlugins> | undefined,
): EvaluatedPluginPrivilegePolicy => {
	const normalized = normalizePolicy(graph, policy)

	return immutableRecord({
		report: createPluginReport(graph, normalized),
		logger: normalized.logger,
	})
}
