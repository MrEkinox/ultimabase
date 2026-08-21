import {
	Schema,
	defineCapability,
	definePlugin,
	defineSchemaOption,
	getOperationSchema,
	optionalCapability,
	protectedPolicy,
	provideCapability,
	provideRuntimeConstraint,
	requireCapability,
	resolveWhereInput,
	typegenEmitterCapability,
	type CompiledSchemaRegistry,
	type OperationKind,
} from '@ultimabase/core'
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

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		/** Configures the independent tenant policy fixture when its plugin is installed. */
		readonly alternativePolicy?: AlternativeTenantPolicyOptions
	}
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
const optionalTypegen = optionalCapability(typegenEmitterCapability, '^1.0.0')

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
	typegen: {
		module: './fixtures/alternative-policy-engine.js',
		type: 'AlternativeTenantPolicyOptions',
	},
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
	const plugin = definePlugin({
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		capabilities: {
			optional: [optionalTypegen],
			provides: [stateProvider, policyProvider],
			requires: [alternativePolicyEngine],
		},
		core: '^0.0.0',
		declare: ({ schemas, typegenContributions }) => {
			schemas.defineOptions({
				contributionId: 'alternative-policy-option',
				schema: { alternativePolicy: alternativePolicySchemaOption },
			})
			typegenContributions?.add({
				contributionId: 'diagnostic-contract',
				declarations: [
					{
						kind: 'type',
						name: 'AlternativeTenantPolicyDiagnostic',
						type: {
							kind: 'object',
							properties: [
								{
									name: 'tenant',
									readonly: true,
									type: { kind: 'string' },
								},
								{
									name: 'schema',
									readonly: true,
									type: { kind: 'string' },
								},
							],
						},
					},
				],
				staticOptions: {
					instanceId: options.instanceId ?? 'default',
				},
			})
		},
		pluginId: alternativePolicyPluginId,
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the alternative policy schema option.',
			},
			{
				name: 'runtime:constrain',
				reason: 'Contributes independent tenant and field restrictions.',
			},
			{
				name: 'typegen:contribute',
				reason: 'Contributes the alternative policy diagnostic contract.',
				when: optionalTypegen,
			},
		],
		setup: ({ capabilities }) => {
			const state = capabilities.get(alternativePolicyEngine)
			return immutableRecord({ diagnostics: () => state.snapshot() })
		},
		version: '1.0.0',
	})

	return immutableRecord({ plugin })
}
