import {
	FrameworkError,
	applicationSchemaMutationSurfaceCapability,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideRuntimeConstraint,
	protectedPolicy,
	requireCapability,
	type CapabilityRequirement,
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
import {
	accessContributionsCapability,
	type OwnedAccessContribution,
} from './contributions.js'
import { AccessRuntime } from './runtime/dispatcher.js'
import { accessDiagnosticsObserverCapability } from './runtime/diagnostics.js'

const optionalAccessContributions: CapabilityRequirement<
	typeof accessContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(accessContributionsCapability, '^1.0.0')
const optionalAccessDiagnostics: CapabilityRequirement<
	typeof accessDiagnosticsObserverCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(accessDiagnosticsObserverCapability, '^1.0.0')
const schemaMutationSurfaceRequirement: CapabilityRequirement<
	typeof applicationSchemaMutationSurfaceCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(applicationSchemaMutationSurfaceCapability, '^1.0.0', {
	phase: 'materialization',
})

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

const denyByDefault: AccessDefaultPolicy = immutableRecord({
	create: false,
	delete: false,
	read: immutableRecord({
		count: false,
		exists: false,
		many: false,
		one: false,
	}),
	update: false,
	upsert: false,
	schemaMutations: false,
})

const normalizeReadDefaults = (value: unknown): AccessDefaultPolicy['read'] => {
	if (typeof value === 'boolean') {
		return immutableRecord({
			count: value,
			exists: value,
			many: value,
			one: value,
		})
	}
	if (!isPlainRecord(value)) {
		throw new TypeError('Access read default must be a boolean or plain object')
	}

	const allowedKeys = new Set<string>(schemaReadAccessBranches)
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !allowedKeys.has(key)) {
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
	normalize: ({ default: defaultAccess }): AccessDefaultPolicy => {
		if (defaultAccess === undefined) return denyByDefault
		if (typeof defaultAccess === 'boolean') {
			return immutableRecord({
				create: defaultAccess,
				delete: defaultAccess,
				read: normalizeReadDefaults(defaultAccess),
				update: defaultAccess,
				upsert: defaultAccess,
				schemaMutations: defaultAccess,
			})
		}
		if (!isPlainRecord(defaultAccess)) {
			throw new TypeError('Access default must be a boolean or plain object')
		}
		const allowedFamilies = new Set<string>([
			...schemaAccessFamilies,
			'schemaMutations',
		])
		for (const key of Reflect.ownKeys(defaultAccess)) {
			if (typeof key !== 'string' || !allowedFamilies.has(key)) {
				throw new TypeError(`Unknown Access default: ${String(key)}`)
			}
			if (key !== 'read' && typeof defaultAccess[key] !== 'boolean') {
				throw new TypeError(`Access ${key} default must be a boolean`)
			}
		}

		return immutableRecord({
			create: defaultAccess.create === true,
			delete: defaultAccess.delete === true,
			read:
				defaultAccess.read === undefined
					? denyByDefault.read
					: normalizeReadDefaults(defaultAccess.read),
			update: defaultAccess.update === true,
			upsert: defaultAccess.upsert === true,
			schemaMutations: defaultAccess.schemaMutations === true,
		})
	},
})

// Only authorization denials become policy decisions; other failures propagate.
const returnsDenied = async (run: () => Promise<unknown>): Promise<boolean> => {
	try {
		await run()
		return true
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'PERMISSION_DENIED') {
			return false
		}
		throw error
	}
}

const evaluatesDenied = async <TResult>(
	run: () => Promise<TResult>,
): Promise<TResult | Readonly<{ readonly allowed: false }>> => {
	try {
		return await run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'PERMISSION_DENIED') {
			return immutableRecord({ allowed: false as const })
		}
		throw error
	}
}

const accessPluginPermissions = {
	'schema:declare': 'Declares the official schema and field Access options.',
	'runtime:constrain':
		'Applies official Access through protected Runtime policy.',
} as const

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
			const contributions: OwnedAccessContribution[] = capabilities
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
					evaluate: (input) => evaluatesDenied(() => runtime.evaluate(input)),
					master: 'bypass',
					mutationOutcome: (input) =>
						returnsDenied(() => runtime.enforceMutationOutcome(input)),
					preparedMutation: (input) =>
						returnsDenied(() => runtime.enforcePreparedMutation(input)),
					reevaluate: (input) => returnsDenied(() => runtime.reevaluate(input)),
					relation: (input) =>
						returnsDenied(() => runtime.enforceRelationRead(input)),
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
		permissions: accessPluginPermissions,
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
