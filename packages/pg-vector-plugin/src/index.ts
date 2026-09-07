import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	assertFieldOptions,
	type CompatibleFieldOptionsInput,
	defineFieldBuilderMethod,
	definePluginField,
	definePluginFieldWireProtocol,
	type FieldListOption,
	type FieldOptions,
	type FieldValidationPlan,
	type PluginFieldDefinition,
	type ScalarValidationPlan,
} from '@ultimabase/core'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

/** Names the immutable logical value shared by generation and runtime. */
export type VectorValue = readonly number[]

/**
 * Namespaces the logical kind so independent community packages cannot collide.
 */
export const vectorFieldKind = 'pg-vector.vector' as const
const pgVectorPluginModule: PluginModule<
	'@ultimabase/pg-vector-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/pg-vector-plugin',
	version: '0.0.0',
})
const graphqlV1FieldProtocol = definePluginFieldWireProtocol({
	name: 'ultimabase.graphql.field',
	version: '1.0.0',
})

/**
 * Carries the fixed vector dimension alongside common field metadata.
 */
export type VectorFieldOptions<
	TList extends FieldListOption = FieldListOption,
> = FieldOptions<VectorValue, TList> & {
	/**
	 * Fixes the number of finite components accepted by this logical vector.
	 *
	 * @example `dimensions: 1536`
	 */
	readonly dimensions: number
}

/**
 * Represents a logical pgvector value independently from its future SQL compiler.
 */
export type VectorField<
	TOptions extends VectorFieldOptions = VectorFieldOptions,
> = PluginFieldDefinition<typeof vectorFieldKind, VectorValue, TOptions>

type VectorFieldMetadata<
	TOptions extends VectorFieldOptions,
	TDimensions extends number,
> = Omit<TOptions, 'dimensions'> & {
	readonly dimensions: TDimensions
}

type ResolvedVectorField<
	TOptions extends VectorFieldOptions,
	TDimensions extends number,
> = PluginFieldDefinition<
	typeof vectorFieldKind,
	VectorValue,
	VectorFieldMetadata<TOptions, TDimensions>
>

type VectorFieldDeclarationOptions<
	TOptions extends VectorFieldOptions,
	TDimensions extends number,
> = CompatibleFieldOptionsInput<
	TOptions & { readonly dimensions: TDimensions },
	VectorValue,
	VectorFieldOptions
>

/** Adds the exact vector factory contract to a generated FieldBuilder. */
export interface VectorFieldBuilderMethod {
	/**
	 * Declares one fixed-dimension logical vector.
	 *
	 * @param options Existing vector factory options with an exact dimension.
	 * @example `embedding: field.vector({ dimensions: 1536 })`
	 */
	// The callable interface preserves its public name and JSDoc in TypeScript hovers.
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	<const TDimensions extends number, const TOptions extends VectorFieldOptions>(
		options: VectorFieldDeclarationOptions<TOptions, TDimensions>,
	): ResolvedVectorField<TOptions, TDimensions>
}

/**
 * Narrows the shared scalar plan back to the vector plugin's exact contract.
 */
export type VectorFieldValidationPlan = ScalarValidationPlan<VectorField>

/**
 * Defines the static field-plan capability that Core will later register globally.
 */
export interface PgVectorPluginExports {
	readonly fieldKind: typeof vectorFieldKind
	readonly handles: (
		plan: FieldValidationPlan,
	) => plan is VectorFieldValidationPlan
	readonly validate: (
		value: unknown,
		plan: VectorFieldValidationPlan,
	) => readonly number[]
}

function assertValidDimensions(
	dimensions: unknown,
): asserts dimensions is number {
	if (
		typeof dimensions !== 'number' ||
		!Number.isSafeInteger(dimensions) ||
		dimensions < 1
	) {
		throw new RangeError('dimensions must be a positive safe integer')
	}
}

const snapshotVector = (
	value: unknown,
	path: string,
	dimensions: number,
): readonly number[] => {
	if (!Array.isArray(value)) {
		throw new TypeError(`${path} must be a vector of finite numbers`)
	}

	if (value.length !== dimensions) {
		throw new RangeError(
			`${path} must contain exactly ${String(dimensions)} values`,
		)
	}

	const values: number[] = value.map((entry, index) => {
		if (typeof entry !== 'number' || !Number.isFinite(entry)) {
			throw new TypeError(`${path}[${String(index)}] must be a finite number`)
		}

		return entry
	})

	return immutableArray(values)
}

/**
 * Creates vector metadata while preserving dimensions, lists, and exact options.
 */
export function vectorField<
	const TDimensions extends number,
	const TOptions extends VectorFieldOptions,
>(
	options: VectorFieldDeclarationOptions<TOptions, TDimensions>,
): ResolvedVectorField<TOptions, TDimensions>

export function vectorField(options: VectorFieldOptions): VectorField {
	assertFieldOptions(options)
	// Restore the declared plugin metadata shape after the runtime guard narrows unknown callers.
	const fieldOptions: VectorFieldOptions = options
	assertValidDimensions(fieldOptions.dimensions)
	const { dimensions } = fieldOptions

	return definePluginField(vectorFieldKind, fieldOptions, {
		snapshotValue: (value: unknown, path: string) =>
			snapshotVector(value, path, dimensions),
		wireCodecs: [
			{
				decode: (value: unknown) =>
					snapshotVector(value, 'GraphQL vector field', dimensions),
				encode: (value: VectorValue) => immutableArray(value),
				format: 'json',
				protocol: graphqlV1FieldProtocol,
			},
		],
	})
}

/**
 * Identifies plans owned by this plugin while retaining exact vector metadata.
 */
export const isVectorFieldValidationPlan = (
	plan: FieldValidationPlan,
): plan is VectorFieldValidationPlan =>
	plan.kind === 'scalar' && plan.field.kind === vectorFieldKind

const vectorFieldBuilderMethod = defineFieldBuilderMethod({
	factory: vectorField,
	fieldKind: vectorFieldKind,
	name: 'vector',
	typegen: {
		methodType: 'VectorFieldBuilderMethod',
		module: '@ultimabase/pg-vector-plugin',
		valueType: 'VectorValue',
	},
})

const pgVectorPluginExports: Readonly<PgVectorPluginExports> = immutableRecord({
	fieldKind: vectorFieldKind,
	handles: isVectorFieldValidationPlan,
	validate: (value, plan) =>
		snapshotVector(value, 'value', plan.field.options.dimensions),
})

const pgVectorPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the vector FieldBuilder method.',
	},
] as const
type PgVectorPluginDefinition = Readonly<{
	readonly privileges: typeof pgVectorPluginPrivileges
	readonly setup: () => Readonly<PgVectorPluginExports>
}>

/** Names the exact configured plugin contract retained by application lookup. */
export type PgVectorPlugin = PluginModuleInstance<
	typeof pgVectorPluginModule,
	PgVectorPluginDefinition
>

/** Declares the vector builder method before returning its validation handler. */
export const pgVectorPlugin = (): PgVectorPlugin =>
	pgVectorPluginModule.plugin({
		privileges: pgVectorPluginPrivileges,
		declare: ({ fields }) => {
			fields.register(vectorFieldBuilderMethod)
		},
		setup: () => pgVectorPluginExports,
	})
