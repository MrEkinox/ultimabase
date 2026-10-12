import {
	Schema,
	getOperationSchema,
	protectedPolicy,
	provideRuntimeConstraint,
	resolveWhereInput,
	type CompiledSchemaRegistry,
	type OperationKind,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	defineCapability,
	defineSchemaOption,
	provideCapability,
	plugin as createPlugin,
	requireCapability,
	type PluginDeclarationContribution,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

export const alternativePolicyPluginId =
	'fixture.alternative-policy-engine' as const
export const alternativePolicyOptionName = 'alternativePolicy' as const

export interface AlternativeTenantPolicyOptions {
	/** Removes these fields from every anonymous result. */
	readonly hiddenFields?: readonly string[]
	/** Restricts every row to this application-local tenant value. */
	readonly tenant: string
}

/** Contributes `alternativePolicy` to `.with({ ... })` (ADR-0297). */
export interface AlternativePolicyRules extends SchemaRulesHKT {
	readonly rules: Readonly<{
		/** Configures the independent tenant policy fixture when its plugin is installed. */
		alternativePolicy?: AlternativeTenantPolicyOptions
	}>
}

export interface AlternativePolicyDiagnostic {
	readonly operation: OperationKind
	readonly schema: string
	readonly tenant: string
}

interface AlternativePolicyEngineState {
	record(diagnostic: AlternativePolicyDiagnostic): void
	snapshot(): readonly AlternativePolicyDiagnostic[]
}

/** Identifies the independent engine without borrowing official Access contracts. */
export const alternativePolicyEngineCapability =
	defineCapability<AlternativePolicyEngineState>()({
		capabilityId: 'fixture.alternative-policy-engine.runtime',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		compose: ([state]) => state,
	})

const alternativePolicyEngine = requireCapability(
	alternativePolicyEngineCapability,
	'^1.0.0',
)

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0

/** Declares a tenant-centric policy vocabulary unrelated to official Access rules. */
export const alternativeTenantPolicy = (
	options: AlternativeTenantPolicyOptions,
): AlternativeTenantPolicyOptions => {
	const untrustedOptions: unknown = options
	const hiddenFields: unknown = isPlainRecord(untrustedOptions)
		? untrustedOptions.hiddenFields
		: undefined
	if (
		!isPlainRecord(untrustedOptions) ||
		typeof untrustedOptions.tenant !== 'string' ||
		untrustedOptions.tenant.trim() === '' ||
		(hiddenFields !== undefined &&
			(!isUnknownArray(hiddenFields) || !hiddenFields.every(isNonEmptyString)))
	) {
		throw new TypeError(
			'alternative tenant policy requires a tenant and optional field names',
		)
	}

	return immutableRecord({
		hiddenFields: immutableArray(
			isUnknownArray(hiddenFields) && hiddenFields.every(isNonEmptyString)
				? hiddenFields
				: [],
		),
		tenant: untrustedOptions.tenant,
	})
}

const alternativePolicySchemaOption = defineSchemaOption({
	normalize: (value) =>
		alternativeTenantPolicy(value as AlternativeTenantPolicyOptions),
	protocolVersion: 1,
	valueKind: 'json',
})

const compilePolicyPlan = (
	schemas: CompiledSchemaRegistry,
): ReadonlyMap<string, AlternativeTenantPolicyOptions> => {
	const plan = new Map<string, AlternativeTenantPolicyOptions>()

	for (const schema of schemas.values()) {
		if (!Object.hasOwn(schema.definition, alternativePolicyOptionName)) continue
		const config: unknown = Reflect.get(
			schema.definition,
			alternativePolicyOptionName,
		)
		const hiddenFields: unknown = isPlainRecord(config)
			? config.hiddenFields
			: undefined
		if (
			!isPlainRecord(config) ||
			typeof config.tenant !== 'string' ||
			!isUnknownArray(hiddenFields) ||
			!hiddenFields.every(isNonEmptyString)
		) {
			throw new TypeError(
				`Invalid alternative tenant policy on ${schema.className}`,
			)
		}
		for (const field of hiddenFields) {
			if (!(field in schema.fields)) {
				throw new TypeError(
					`Unknown alternative tenant policy field ${field} on ${schema.className}`,
				)
			}
		}
		plan.set(
			schema.className,
			immutableRecord({
				hiddenFields: immutableArray(hiddenFields),
				tenant: config.tenant,
			}),
		)
	}

	return plan
}

const createState = (): AlternativePolicyEngineState => {
	const diagnostics: AlternativePolicyDiagnostic[] = []

	return immutableRecord({
		record: (diagnostic: AlternativePolicyDiagnostic): void => {
			diagnostics.push(immutableRecord(diagnostic))
		},
		snapshot: () => immutableArray(diagnostics),
	})
}

export interface AlternativePolicyEngineOptions {
	readonly instanceId?: string
	readonly onDispose?: () => void
}

/** Builds one independent policy engine from public schema and Runtime contracts. */
export const createAlternativePolicyEngine = (
	options: AlternativePolicyEngineOptions = {},
) => {
	const stateProvider = provideCapability(alternativePolicyEngineCapability, {
		contributionId: 'engine-state',
		create: () => ({ value: createState() }),
	})
	const policyProvider = provideRuntimeConstraint({
		contributionId: 'tenant-policy',
		create: ({ capabilities, schemas }) => {
			const state = capabilities.get(alternativePolicyEngine)
			const plan = compilePolicyPlan(schemas)

			return {
				dispose: () => options.onDispose?.(),
				value: protectedPolicy({
					evaluate: ({ context, operation }) => {
						// This engine deliberately adopts Core Master as its explicit bypass.
						if (context.access.mode === 'master') return undefined
						if (operation.kind === 'plugin-schema-mutation') return undefined
						const schema = getOperationSchema(operation)
						if (!Schema.is(schema)) return undefined
						const config = plan.get(schema.className)
						if (config === undefined) return undefined
						state.record({
							operation: operation.kind,
							schema: schema.className,
							tenant: config.tenant,
						})

						return {
							rowFilter: resolveWhereInput(schema, {
								tenant: { eq: config.tenant },
							}),
							selectionFields: Object.keys(schema.fields).filter(
								(field) => !config.hiddenFields?.includes(field),
							),
						}
					},
				}),
			}
		},
	})
	// The rules slot types `.with({ alternativePolicy })` (ADR-0297).
	const declarations: PluginDeclarationContribution<
		readonly [],
		PluginSchemaRulesSource<AlternativePolicyRules>
	> = contributeDeclarations({
		schema: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'alternative-policy-option',
				schema: { alternativePolicy: alternativePolicySchemaOption },
			})
		},
	})
	const plugin = createPlugin({
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		contributions: [
			stateProvider,
			policyProvider,
			alternativePolicyEngine,
			declarations,
			contributeApplication(({ capabilities }) => {
				const state = capabilities.get(alternativePolicyEngine)
				return {
					exports: immutableRecord({ diagnostics: () => state.snapshot() }),
				}
			}),
		],
		core: '^0.0.0',
		id: alternativePolicyPluginId,
		permissions: {
			'schema:declare': 'Declares the alternative policy schema option.',
			'runtime:constrain':
				'Contributes independent tenant and field restrictions.',
		},
		version: '1.0.0',
	})

	return immutableRecord({ plugin })
}
