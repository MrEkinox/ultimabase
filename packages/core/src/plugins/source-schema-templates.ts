import type { ApplicationSchemaMutationMethod } from '../application/application-schema-mutations.js'
import type {
	FieldSourceOpaque,
	FieldSourceValue,
	GenericField,
} from '../schema/fields/base/contract.js'
import type {
	SchemaClass,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { SchemaItem } from '../schema/schema/values.js'
import type { SchemaTypeInfo } from '../schema/type-info.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

declare const pluginSourceMutationMethodType: unique symbol
declare const pluginSourceSchemaMutationType: unique symbol
declare const pluginSourceSchemaFieldValuesType: unique symbol

/** Marks persisted developer-field values without Core system fields. */
export interface PluginSourceSchemaFieldValues<
	TExcluded extends string = never,
> {
	readonly [pluginSourceSchemaFieldValuesType]: TExcluded
}

/** Carries exact source-declared schema mutations without adding a runtime property. */
export interface PluginSourceSchemaMutationCarrier<
	TMutations extends Readonly<Record<string, PluginSchemaMutationDefinition>>,
> {
	readonly [pluginSourceSchemaMutationType]: TMutations
}

/** Reads exact source-declared mutations from one configured schema class. */
export type PluginSourceSchemaMutations<TSchema> =
	TSchema extends PluginSourceSchemaMutationCarrier<infer TMutations>
		? TMutations
		: Readonly<Record<never, never>>

/** Defers one mutation method until the configured schema contract is known. */
export interface PluginSourceMutationMethod<
	TMutation extends PluginSchemaMutationDefinition,
> {
	readonly [pluginSourceMutationMethodType]: Readonly<{
		readonly mutation: TMutation
	}>
}

/** Resolves one plugin template against an exact configured schema contract. */
export type ResolveSourceSchemaTemplate<
	TTemplate,
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> = TTemplate extends GenericField
	? TTemplate
	: TTemplate extends FieldSourceOpaque<infer TValue>
		? TValue
		: TTemplate extends PluginSourceSchemaFieldValues<infer TExcluded>
			? Readonly<
					Pick<
						SchemaItem<TSchema>,
						Extract<
							Exclude<
								TContract['persistedFields'],
								'id' | 'createdAt' | 'updatedAt' | TExcluded
							>,
							keyof SchemaItem<TSchema>
						>
					>
				>
			: TTemplate extends FieldSourceValue
				? never
				: TTemplate extends PluginSourceMutationMethod<infer TMutation>
					? ApplicationSchemaMutationMethod<SchemaClass<TContract>, TMutation>
					: TTemplate extends (...arguments_: infer TArguments) => infer TResult
						? (
								...arguments_: {
									[TIndex in keyof TArguments]: ResolveSourceSchemaTemplate<
										TArguments[TIndex],
										TContract,
										TSchema
									>
								}
							) => ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
						: TTemplate extends Promise<infer TResult>
							? Promise<
									ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
								>
							: TTemplate extends PromiseLike<infer TResult>
								? PromiseLike<
										ResolveSourceSchemaTemplate<TResult, TContract, TSchema>
									>
								: TTemplate extends readonly (infer TEntry)[]
									? readonly ResolveSourceSchemaTemplate<
											TEntry,
											TContract,
											TSchema
										>[]
									: TTemplate extends object
										? ResolveSourceSchemaObject<TTemplate, TContract, TSchema>
										: TTemplate

/**
 * Resolves one object template member by member. Declared outside the
 * conditional above on purpose: a mapped type written inside conditional
 * branches captures their unresolved `infer` parameters, which makes every
 * schema type containing it look generic. TypeScript then re-instantiates whole
 * schemas when a relationship target thunk is resolved (TS2589 on self relations).
 */
type ResolveSourceSchemaObject<
	TTemplate,
	TContract extends SchemaTypeInfo,
	TSchema extends SchemaDefinition,
> = {
	readonly [TKey in keyof TTemplate]: ResolveSourceSchemaTemplate<
		TTemplate[TKey],
		TContract,
		TSchema
	>
}
