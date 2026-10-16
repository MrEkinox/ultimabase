import {
	FrameworkError,
	applicationSchemaMutationSurfaceCapability,
	provideRuntimeConstraint,
	protectedPolicy,
	readPolicyQuery,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	optionalCapability,
	plugin,
	requireCapability,
	schemaPermissionsCapability,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
	type SchemaRulesSource,
	provideSchemaRules,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import type { SchemaAccess } from './authoring/contracts.js'
import {
	normalizeAllowWithoutRule,
	type AllowWithoutRule,
	type AllowWithoutRulePlan,
} from './authoring/allow-without-rule.js'
import { compileAccessPlan } from './authoring/compiler.js'
import { fieldAccessOption, schemaAccessOption } from './options.js'
import { accessContributionsCapability } from './contributions.js'
import { createDenialLog } from './runtime/denial-log.js'
import { AccessRuntime } from './runtime/dispatcher.js'
import { accessDiagnosticsObserverCapability } from './runtime/diagnostics.js'
import { readPolicyOperation } from './runtime/rule-evaluation.js'
import { contributeAccessStartup } from './startup.js'

const optionalAccessContributions = optionalCapability(
	accessContributionsCapability,
	'^1.0.0',
)
const optionalAccessDiagnostics = optionalCapability(
	accessDiagnosticsObserverCapability,
	'^1.0.0',
)
const optionalSchemaPermissions = optionalCapability(
	schemaPermissionsCapability,
	'^1.0.0',
)
const schemaMutationSurfaceRequirement = requireCapability(
	applicationSchemaMutationSurfaceCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)

/** Configures Access; without options every operation without a rule is denied. */
export interface AccessPluginOptions {
	/**
	 * Opens operations that have no schema rule (ADR-0317); everything else
	 * is denied.
	 * @example `accessPlugin({ allowWithoutRule: { read: true, write: isAuthenticated } })`
	 */
	readonly allowWithoutRule?: AllowWithoutRule
}

const parseOptions = definePluginOptionsParser({
	name: 'Access plugin options',
	keys: ['allowWithoutRule'] as const,
	formatUnknownKey: (key) =>
		key === 'default'
			? 'Unknown Access plugin option: default (replaced by allowWithoutRule, ADR-0317)'
			: `Unknown Access plugin option: ${String(key)}`,
	normalize: ({ allowWithoutRule }): AllowWithoutRulePlan =>
		normalizeAllowWithoutRule(allowWithoutRule),
})

const deniedEffects = immutableRecord({ allowed: false as const })

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

/** Entry of `.with({ … })` owned by Access, for one schema. */
export interface AccessRules<TSchema> {
	/**
	 * Declares schema rules; an operation without a rule is denied unless
	 * `allowWithoutRule` opens it.
	 * @example `.with({ access: { read: ({ where }) => where.eq('archived', false) } })`
	 */
	readonly access?: SchemaAccess<
		Extract<TSchema, SchemaDefinition>,
		SchemaRulesSource<TSchema>
	>
}

/** Contributes `access` to `.with({ … })` through Core's rules slot (ADR-0297). */
export interface AccessSchemaRules extends SchemaRulesHKT {
	readonly rules: AccessRules<this['schema']>
}

type AccessSource =
	| PluginDeclarationSource<typeof accessDeclarations>
	| PluginSchemaRulesSource<AccessSchemaRules>

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
	const allowWithoutRule = parseOptions(options)
	const runtimeProvider = provideRuntimeConstraint({
		contributionId: 'official-access-runtime',
		create: ({ callbacks, capabilities, logger, schemas }) => {
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
					allowWithoutRule,
					contributions,
					capabilities.get(schemaMutationSurfaceRequirement),
					capabilities
						.contributions(optionalSchemaPermissions)
						.flatMap(({ value }) => value),
				),
				capabilities.get(optionalAccessDiagnostics),
				callbacks,
			)
			const logDenial = createDenialLog(logger, allowWithoutRule.environment)
			/** Turns authorization denials into policy decisions; other failures propagate. */
			const unlessDenied = async <TResult, TDenied>(
				run: () => Promise<TResult>,
				denied: TDenied,
				operation?: RuntimeLogicalOperationAst,
			): Promise<TDenied | TResult> => {
				try {
					return await run()
				} catch (error: unknown) {
					if (
						!(error instanceof FrameworkError) ||
						error.code !== 'PERMISSION_DENIED'
					) {
						throw error
					}
					// `can()` questions are answers, not denials (ADR-0305).
					if (
						operation !== undefined &&
						readPolicyQuery(operation) === undefined
					) {
						logDenial(error, readPolicyOperation(operation))
					}
					return denied
				}
			}

			return {
				value: protectedPolicy({
					evaluate: (input) =>
						unlessDenied(
							() => runtime.evaluate(input),
							deniedEffects,
							input.operation,
						),
					master: 'bypass',
					mutationOutcome: (input) =>
						unlessDenied(
							() => runtime.enforceMutationOutcome(input),
							false,
							input.operation,
						),
					permission: (input) =>
						unlessDenied(() => runtime.holdsPermission(input), false),
					preparedMutation: (input) =>
						unlessDenied(
							() => runtime.enforcePreparedMutation(input),
							false,
							input.operation,
						),
					reevaluate: (input) =>
						unlessDenied(
							() => runtime.reevaluate(input),
							false,
							input.operation,
						),
					relation: (input) =>
						unlessDenied(
							() => runtime.enforceRelationRead(input),
							false,
							input.operation,
						),
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
			optionalSchemaPermissions,
			runtimeProvider,
			schemaMutationSurfaceRequirement,
			accessDeclarations,
			contributeAccessStartup(allowWithoutRule),
		],
	})
	// `.with({ access: { … } })` (ADR-0339).
	return provideSchemaRules<AccessPlugin>(instance, ['access'])
}
