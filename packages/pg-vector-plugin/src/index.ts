import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	assertFieldOptions,
	definePluginField,
	type FieldListOption,
	type FieldOptions,
	type FieldValidationOptions,
	type FieldValidationPlan,
	type PluginFieldDefinition,
	type ScalarValidationPlan,
	type ValidatedFieldOptions,
} from '@ultimabase/core'

/**
 * Namespaces the logical kind so independent community packages cannot collide.
 */
export const vectorFieldKind = 'pg-vector.vector' as const

/**
 * Describes presence rules available to vector fields before vector-specific constraints.
 */
export type VectorValidationOptions = FieldValidationOptions

/**
 * Carries the fixed vector dimension alongside common field metadata.
 */
export type VectorFieldOptions<
	TList extends FieldListOption = FieldListOption,
> = FieldOptions<readonly number[], VectorValidationOptions, TList> & {
	readonly dimensions: number
}

/**
 * Represents a logical pgvector value independently from its future SQL compiler.
 */
export type VectorField<
	TOptions extends VectorFieldOptions = VectorFieldOptions,
> = PluginFieldDefinition<typeof vectorFieldKind, readonly number[], TOptions>

/**
 * Narrows the shared scalar plan back to the vector plugin's exact contract.
 */
export type VectorFieldValidationPlan = ScalarValidationPlan<VectorField>

/**
 * Defines the static field-plan capability that Core will later register globally.
 */
export interface PgVectorPluginDefinition {
	readonly name: 'pg-vector'
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
export function vectorField<const TOptions extends VectorFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, readonly number[]> extends never
			? never
			: unknown),
): VectorField<TOptions>

export function vectorField(options: VectorFieldOptions): VectorField {
	assertFieldOptions(options)
	assertValidDimensions(options.dimensions)
	const { dimensions } = options

	return definePluginField(vectorFieldKind, options, {
		snapshotValue: (value: unknown, path: string) =>
			snapshotVector(value, path, dimensions),
	})
}

/**
 * Identifies plans owned by this plugin while retaining exact vector metadata.
 */
export const isVectorFieldValidationPlan = (
	plan: FieldValidationPlan,
): plan is VectorFieldValidationPlan =>
	plan.kind === 'scalar' && plan.field.kind === vectorFieldKind

/**
 * Returns the static handler definition consumed by the future global plugin registry.
 */
export const pgVectorPlugin = (): Readonly<PgVectorPluginDefinition> =>
	immutableRecord({
		name: 'pg-vector',
		fieldKind: vectorFieldKind,
		handles: isVectorFieldValidationPlan,
		validate: (value, plan) =>
			snapshotVector(value, 'value', plan.field.options.dimensions),
	})
