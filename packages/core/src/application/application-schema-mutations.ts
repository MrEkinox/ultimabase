import type { QueryAst, QueryFieldName } from '../query/ast/contracts.js'
import { assertExactEnumerableKeys } from '../exact-object-validation.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelection,
} from '../query/clauses/selection.js'
import type { OperationObjectId } from '../query/operations/contracts.js'
import type { OperationOptions } from '../query/operations/options.js'
import type {
	ExactGeneratedInclusionInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../query/query/input.js'
import type { QueryResult } from '../query/query/result.js'
import type { CompiledSchemaMutationCommand } from '../plugins/application-surface-registry.js'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
} from '../plugins/plugin-schema-mutations.js'
import { readMutationCommand } from '../plugins/command-graph.js'
import { prepareSchemaMutationEnvelope } from './schema-mutation-envelope.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../schema/type-info.js'
import { readPersistedSchemaModelRecord } from '../schema/schema/model-state.js'
import { isPlainRecord } from '@ultimabase/shared'

/** Carries one normalized direct call without an executable resolver or adapter. */
export interface PluginSchemaMutationEnvelope {
	readonly command: string
	readonly id: string
	readonly kind: 'plugin-schema-mutation'
	readonly payload: unknown
	readonly query: QueryAst
	readonly mutation: CompiledSchemaMutationCommand['mutation']
}

/** Executes one application-owned schema mutation behind its dynamic method. */
export type ApplicationSchemaMutationExecutor = (
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	options: OperationOptions | undefined,
) => Promise<unknown>

const schemaMutationInputKeys = new Set(['id', 'include', 'input', 'select'])

const assertSchemaMutationInput = (
	value: unknown,
	name: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`Schema mutation ${name} input must be a plain object`)
	}
	assertExactEnumerableKeys(
		value,
		schemaMutationInputKeys,
		`Schema mutation ${name} input contains unknown key: `,
	)
	return value
}

/** @internal Builds one exact schema or persisted-model mutation method. */
export const createApplicationSchemaMutationMethod =
	(options: {
		readonly assertAvailable: () => void
		readonly command: CompiledSchemaMutationCommand
		readonly execute: ApplicationSchemaMutationExecutor
		readonly model?: object
		readonly name: string
		readonly schema: SchemaDefinition
	}): ((...arguments_: readonly unknown[]) => Promise<unknown>) =>
	async (...arguments_: readonly unknown[]): Promise<unknown> => {
		options.assertAvailable()
		if (arguments_.length > 2) {
			throw new TypeError(
				`Schema mutation ${options.name} accepts at most two arguments`,
			)
		}

		const rawInput =
			options.model === undefined ? arguments_[0] : (arguments_[0] ?? {})
		const input = assertSchemaMutationInput(rawInput, options.name)
		const modelRecord =
			options.model === undefined
				? undefined
				: readPersistedSchemaModelRecord(options.model, options.name)
		const idValue = modelRecord?.objectId ?? input.id
		if (typeof idValue !== 'string') {
			throw new TypeError(`Schema mutation ${options.name} id must be a string`)
		}
		if (options.model !== undefined && Object.hasOwn(input, 'id')) {
			throw new TypeError(
				`Schema mutation ${options.name} model input cannot contain id`,
			)
		}

		const { command, graph } = readMutationCommand(options.command)
		const envelope = prepareSchemaMutationEnvelope({
			graph,
			command,
			schema: options.schema,
			name: options.name,
			id: idValue,
			input: input.input,
			projection: input,
		})

		return options.execute(
			options.command,
			options.schema,
			envelope,
			arguments_[1] as OperationOptions | undefined,
		)
	}

type MutationPayload<TMutation extends PluginSchemaMutationDefinition> =
	PluginSchemaMutationInput<TMutation>

type MutationPayloadField<TMutation extends PluginSchemaMutationDefinition> = [
	MutationPayload<TMutation>,
] extends [undefined]
	? Readonly<{ readonly input?: never }>
	: Readonly<{ readonly input: MutationPayload<TMutation> }>

type MutationProjection<
	TSchema extends SchemaTypeInfoSource,
	TSelection extends QuerySelection<TSchema> | undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = Readonly<{
	readonly select?: TSelection &
		QuerySelection<TSchema> &
		ExactQuerySelection<TSchema, TSelection> &
		LiteralQuerySelection<TSelection>
}> &
	(string extends SchemaTypeInfoFor<TSchema>['fields']
		? Readonly<{
				readonly include?: SchemaTypeInfoFor<TSchema>['inputs']['include']
			}>
		: ExactGeneratedInclusionInput<TSchema, TInclude> &
				Readonly<{ readonly include?: TInclude }>)

type ProjectionIdentity<TSelection, TInclude> = Readonly<
	([TSelection] extends [undefined]
		? object
		: { readonly select: TSelection }) &
		([TInclude] extends [undefined] ? object : { readonly include: TInclude })
>

/** Resolves the exact selected and included result of one schema mutation. */
export type PluginSchemaMutationResult<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = QueryResult<
	TSchema,
	Extract<
		[TSelection] extends [undefined]
			? | Extract<keyof NonNullable<TInclude>, QueryFieldName<TSchema>>
				| ([TInclude] extends [undefined]
						? never
						: Extract<'id', QueryFieldName<TSchema>>)
			: QuerySelectedFieldFromInput<
					SchemaTypeInfoFor<TSchema>,
					ProjectionIdentity<TSelection, TInclude>
				>,
		QueryFieldName<TSchema>
	>,
	QueryIncludedFieldFromInput<
		SchemaTypeInfoFor<TSchema>,
		ProjectionIdentity<TSelection, TInclude>
	>
>

/** Describes one direct schema-handle mutation call. */
export type PluginSchemaMutationSchemaInput<
	TSchema extends SchemaTypeInfoSource,
	TMutation extends PluginSchemaMutationDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined =
		undefined,
> = Readonly<{ readonly id: OperationObjectId<TSchema> }> &
	MutationPayloadField<TMutation> &
	MutationProjection<TSchema, TSelection, TInclude>

/** Describes one direct persisted-model mutation call. */
export type PluginSchemaMutationModelInput<
	TSchema extends SchemaTypeInfoSource,
	TMutation extends PluginSchemaMutationDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined =
		undefined,
> = MutationPayloadField<TMutation> &
	MutationProjection<TSchema, TSelection, TInclude>

/** Exposes one exact direct mutation on an application schema handle. */
export type ApplicationSchemaMutationMethod<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = <
	const TSelection extends QuerySelection<TSchema> | undefined = undefined,
	const TInclude extends
		SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined = undefined,
>(
	input: PluginSchemaMutationSchemaInput<
		TSchema,
		TMutation,
		TSelection,
		TInclude
	>,
	options?: OperationOptions,
) => Promise<PluginSchemaMutationResult<TSchema, TSelection, TInclude>>

/** Exposes one exact direct mutation on a bound persisted-model handle. */
export type ApplicationModelSchemaMutationMethod<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = <
	const TSelection extends QuerySelection<TSchema> | undefined = undefined,
	const TInclude extends
		SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined = undefined,
>(
	...arguments_: [MutationPayload<TMutation>] extends [undefined]
		? readonly [
				input?: PluginSchemaMutationModelInput<
					TSchema,
					TMutation,
					TSelection,
					TInclude
				>,
				options?: OperationOptions,
			]
		: readonly [
				input: PluginSchemaMutationModelInput<
					TSchema,
					TMutation,
					TSelection,
					TInclude
				>,
				options?: OperationOptions,
			]
) => Promise<PluginSchemaMutationResult<TSchema, TSelection, TInclude>>
