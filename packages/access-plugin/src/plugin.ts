import {
	FrameworkError,
	applicationSchemaMutationSurfaceCapability,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideRuntimeConstraint,
	protectedPolicy,
	requireCapability,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { AccessDefaultPolicy } from './authoring/plan.js'
import {
	schemaAccessFamilies,
	schemaReadAccessBranches,
} from './authoring/declarations.js'
import { compileAccessPlan } from './authoring/compiler.js'
import { fieldAccessOption, schemaAccessOption } from './options.js'
import { accessContributionsCapability } from './contributions.js'
import { AccessRuntime } from './runtime/dispatcher.js'
import { accessDiagnosticsObserverCapability } from './runtime/diagnostics.js'

const optionalAccessContributions = optionalCapability(
	accessContributionsCapability,
	'^1.0.0',
)
const optionalAccessDiagnostics = optionalCapability(
	accessDiagnosticsObserverCapability,
	'^1.0.0',
)
const schemaMutationSurfaceRequirement = requireCapability(
	applicationSchemaMutationSurfaceCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)

/** Configures static read-capability fallbacks for every application schema. */
export interface SchemaReadAccessDefaults {
	readonly one?: boolean
	readonly many?: boolean
	readonly count?: boolean
	readonly exists?: boolean
}

/**
 * Configures static operation fallbacks without schema-specific row or item rules.
 * Every omitted family or read capability denies.
 */
export interface SchemaAccessDefaults {
	readonly read?: boolean | SchemaReadAccessDefaults
	readonly create?: boolean
	readonly update?: boolean
	readonly upsert?: boolean
	readonly delete?: boolean
	/** Controls every plugin-owned request mutation unless an exact rule overrides it. */
	readonly schemaMutations?: boolean
}

/** Configures the fallback used only when no exact schema decision exists. */
export interface AccessPluginOptions {
	readonly default?: boolean | SchemaAccessDefaults
}

const uniformReadDefaults = (value: boolean): AccessDefaultPolicy['read'] =>
	immutableRecord({ count: value, exists: value, many: value, one: value })

const uniformDefaults = (value: boolean): AccessDefaultPolicy =>
	immutableRecord({
		create: value,
		delete: value,
		read: uniformReadDefaults(value),
		update: value,
		upsert: value,
		schemaMutations: value,
	})

const denyByDefault = uniformDefaults(false)
const readDefaultKeys = new Set<string>(schemaReadAccessBranches)
const defaultKeys = new Set<string>([
	...schemaAccessFamilies,
	'schemaMutations',
])

const normalizeReadDefaults = (value: unknown): AccessDefaultPolicy['read'] => {
	if (typeof value === 'boolean') return uniformReadDefaults(value)
	if (!isPlainRecord(value)) {
		throw new TypeError('Access read default must be a boolean or plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !readDefaultKeys.has(key)) {
			throw new TypeError(`Unknown Access read default: ${String(key)}`)
		}
		if (typeof value[key] !== 'boolean') {
			throw new TypeError(`Access read default ${key} must be a boolean`)
		}
	}
	return immutableRecord({
		count: value.count === true,
		exists: value.exists === true,
		many: value.many === true,
		one: value.one === true,
	})
}

const normalizeDefaults = definePluginOptionsParser({
	name: 'Access plugin options',
	keys: ['default'] as const,
	formatUnknownKey: (key) => `Unknown Access plugin option: ${String(key)}`,
	normalize: ({ default: defaults }): AccessDefaultPolicy => {
		if (defaults === undefined) return denyByDefault
		if (typeof defaults === 'boolean') return uniformDefaults(defaults)
		if (!isPlainRecord(defaults)) {
			throw new TypeError('Access default must be a boolean or plain object')
		}
		for (const key of Reflect.ownKeys(defaults)) {
			if (typeof key !== 'string' || !defaultKeys.has(key)) {
				throw new TypeError(`Unknown Access default: ${String(key)}`)
			}
			if (key !== 'read' && typeof defaults[key] !== 'boolean') {
				throw new TypeError(`Access ${key} default must be a boolean`)
			}
		}
		return immutableRecord({
			create: defaults.create === true,
			delete: defaults.delete === true,
			read:
				defaults.read === undefined
					? denyByDefault.read
					: normalizeReadDefaults(defaults.read),
			update: defaults.update === true,
			upsert: defaults.upsert === true,
			schemaMutations: defaults.schemaMutations === true,
		})
	},
})

const deniedEffects = immutableRecord({ allowed: false as const })

/** Turns authorization denials into policy decisions; other failures propagate. */
const unlessDenied = async <TResult, TDenied>(
	run: () => Promise<TResult>,
	denied: TDenied,
): Promise<TDenied | TResult> => {
	try {
		return await run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'PERMISSION_DENIED') {
			return denied
		}
		throw error
	}
}

type AccessOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-access-options'
	readonly field: Readonly<{ access: typeof fieldAccessOption }>
	readonly schema: Readonly<{ access: typeof schemaAccessOption }>
}>

const accessDeclarations: PluginDeclarationContribution<
	readonly [],
	AccessOptionSource
> = contributeDeclarations({
	schema: ({ schemas }) =>
		schemas.defineOptions({
			contributionId: 'official-access-options',
			field: { access: fieldAccessOption },
			schema: { access: schemaAccessOption },
		}),
})

type AccessSource = PluginDeclarationSource<typeof accessDeclarations>

/** Names the exact configured official Access engine. */
export type AccessPlugin = PluginInstance<{
	readonly id: '@ultimabase/access-plugin'
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: AccessSource
}>

/** Installs official Access authoring and enforcement through the public kernel. */
export const accessPlugin = (
	options: AccessPluginOptions = {},
): AccessPlugin => {
	const defaults = normalizeDefaults(options)
	const runtimeProvider = provideRuntimeConstraint({
		contributionId: 'official-access-runtime',
		create: ({ callbacks, capabilities, schemas }) => {
			const contributions = capabilities
				.contributions(optionalAccessContributions)
				.flatMap(({ contributionId, owner, pluginVersion, value }) =>
					value.map((definition) =>
						immutableRecord({
							contributionId,
							definition,
							owner,
							pluginVersion,
						}),
					),
				)
			const runtime = new AccessRuntime(
				compileAccessPlan(
					schemas,
					defaults,
					contributions,
					capabilities.get(schemaMutationSurfaceRequirement),
				),
				capabilities.get(optionalAccessDiagnostics),
				callbacks,
			)

			return {
				value: protectedPolicy({
					evaluate: (input) =>
						unlessDenied(() => runtime.evaluate(input), deniedEffects),
					master: 'bypass',
					mutationOutcome: (input) =>
						unlessDenied(() => runtime.enforceMutationOutcome(input), false),
					preparedMutation: (input) =>
						unlessDenied(() => runtime.enforcePreparedMutation(input), false),
					reevaluate: (input) =>
						unlessDenied(() => runtime.reevaluate(input), false),
					relation: (input) =>
						unlessDenied(() => runtime.enforceRelationRead(input), false),
					requiresPreparedMutationItems: (operation) =>
						runtime.requiresPreparedMutationItems(operation),
					restrictResult: (input) => runtime.enforceOutput(input),
				}),
			}
		},
	})

	const instance = plugin({
		id: '@ultimabase/access-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			optionalAccessContributions,
			optionalAccessDiagnostics,
			runtimeProvider,
			schemaMutationSurfaceRequirement,
			accessDeclarations,
		],
	})
	return instance
}
