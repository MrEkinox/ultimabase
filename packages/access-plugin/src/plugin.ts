import {
	FrameworkError,
	optionalCapability,
	provideRuntimeConstraint,
	protectedPolicy,
	type FrameworkPlugin,
} from '@ultimabase/core'
import { definePluginModule } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { AccessDefaultPolicy } from './authoring/plan.js'
import { compileAccessPlan } from './authoring/compiler.js'
import { fieldAccessOption, schemaAccessOption } from './options.js'
import {
	accessContributionsCapability,
	type OwnedAccessContribution,
} from './contributions.js'
import { AccessRuntime } from './runtime/dispatcher.js'
import { accessDiagnosticsObserverCapability } from './runtime/diagnostics.js'

const accessPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/access-plugin',
	version: '0.0.0',
})
const optionalAccessContributions = optionalCapability(
	accessContributionsCapability,
	'^1.0.0',
)
const optionalAccessDiagnostics = optionalCapability(
	accessDiagnosticsObserverCapability,
	'^1.0.0',
)

/** Configures the fallback used only when no exact Access declaration exists. */
export interface AccessPluginOptions {
	readonly default?: boolean | AccessDefaultPolicy
}

const allowByDefault: AccessDefaultPolicy = immutableRecord({
	field: true,
	operation: true,
})

const normalizeDefaults = (
	options: AccessPluginOptions,
): AccessDefaultPolicy => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Access plugin options must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (key !== 'default') {
			throw new TypeError(`Unknown Access plugin option: ${String(key)}`)
		}
	}
	if (options.default === undefined) return allowByDefault
	if (typeof options.default === 'boolean') {
		return immutableRecord({
			field: options.default,
			operation: options.default,
		})
	}
	if (
		!isPlainRecord(options.default) ||
		typeof options.default.field !== 'boolean' ||
		typeof options.default.operation !== 'boolean'
	) {
		throw new TypeError(
			'Access default must be a boolean or a complete field/operation object',
		)
	}
	for (const key of Reflect.ownKeys(options.default)) {
		if (key !== 'field' && key !== 'operation') {
			throw new TypeError(`Unknown Access default: ${String(key)}`)
		}
	}

	return immutableRecord({
		field: options.default.field,
		operation: options.default.operation,
	})
}

const returnsDenied = async (run: () => Promise<void>): Promise<boolean> => {
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

/** Names one configured official Access engine. */
export type AccessPlugin = FrameworkPlugin<'@ultimabase/access-plugin'>

/** Installs official Access authoring and enforcement through the public kernel. */
export const accessPlugin = (
	options: AccessPluginOptions = {},
): AccessPlugin => {
	const defaults = normalizeDefaults(options)
	const runtimeProvider = provideRuntimeConstraint({
		contributionId: 'official-access-runtime',
		create: ({ capabilities, schemas }) => {
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
				compileAccessPlan(schemas, defaults, contributions),
				capabilities.get(optionalAccessDiagnostics),
			)

			return {
				value: protectedPolicy({
					evaluate: (input) => evaluatesDenied(() => runtime.evaluate(input)),
					master: 'enforce',
					mutationOutcome: (input) =>
						returnsDenied(() =>
							runtime.enforceMutationOutcome(input).then(() => undefined),
						),
					preparedMutation: (input) =>
						returnsDenied(() => runtime.enforcePreparedMutation(input)),
					reevaluate: (input) =>
						returnsDenied(() =>
							runtime.reevaluate(input).then(() => undefined),
						),
					relation: (input) =>
						returnsDenied(() => runtime.enforceRelationRead(input)),
					requiresPreparedMutationItems: (operation) =>
						runtime.requiresPreparedMutationItems(operation),
					restrictResult: (input) => runtime.enforceOutput(input),
				}),
			}
		},
	})

	return accessPluginModule.plugin({
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the official schema and field Access options.',
			},
			{
				name: 'runtime:constrain',
				reason: 'Applies official Access through protected Runtime policy.',
			},
		],
		capabilities: {
			optional: [optionalAccessContributions, optionalAccessDiagnostics],
			provides: [runtimeProvider],
		},
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-access-options',
				field: { access: fieldAccessOption },
				schema: { access: schemaAccessOption },
			})
		},
	})
}
