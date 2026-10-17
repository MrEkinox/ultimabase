import type { QueryAst, QueryFieldName } from '../query/ast/contracts.js'
import { assertExactEnumerablePlainObject } from '../exact-object-validation.js'
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
import type { CompiledSchemaMutationCommand } from '../plugins/application-surface-contracts.js'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
} from '../plugins/plugin-schema-mutations.js'
import type { WhereInput } from '../query/filters/where-contracts.js'
import { readMutationCommand } from '../plugins/command-graph.js'
import {
	prepareSchemaMutationEnvelope,
	prepareSchemaMutationManyEnvelope,
} from './schema-mutation-envelope.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../schema/type-info.js'

/** Carries one normalized direct call without an executable resolver or adapter. */
export interface PluginSchemaMutationEnvelope {
	readonly command: string
	readonly id: string
	readonly kind: 'plugin-schema-mutation'
	readonly payload: unknown
	readonly query: QueryAst
	readonly mutation: CompiledSchemaMutationCommand['mutation']
}

/**
 * Carries one normalized many-row call (ADR-0316): the identifier-only query
 * of the targeted rows and the result projection applied to each row.
 */
export interface PluginSchemaMutationManyEnvelope {
	readonly command: string
	readonly kind: 'plugin-schema-mutation-many'
	readonly mutation: CompiledSchemaMutationCommand['mutation']
	readonly payload: unknown
	readonly projection: Readonly<{ include?: unknown; select?: unknown }>
	readonly query: QueryAst
}

/** Executes one application-owned schema mutation behind its dynamic method. */
export type ApplicationSchemaMutationExecutor = (
	command: CompiledSchemaMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope | PluginSchemaMutationManyEnvelope,
	options: OperationOptions | undefined,
) => Promise<unknown>

const schemaMutationInputKeys = new Set(['id', 'include', 'input', 'select'])
const schemaMutationManyInputKeys = new Set([
	'include',
	'input',
	'select',
	'where',
])

const assertSchemaMutationInput = (
	value: unknown,
	name: string,
): Readonly<Record<string, unknown>> => {
	assertExactEnumerablePlainObject(
		value,
		schemaMutationInputKeys,
		`Schema mutation ${name} input must be a plain object`,
		`Schema mutation ${name} input contains unknown key: `,
	)
	return value
}

/** @internal Builds one exact schema mutation method. */
export const createApplicationSchemaMutationMethod =
	(options: {
		readonly assertAvailable: () => void
		readonly command: CompiledSchemaMutationCommand
		readonly execute: ApplicationSchemaMutationExecutor
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

		const { command, graph } = readMutationCommand(options.command)
		if (command.definition.target === 'many') {
			assertExactEnumerablePlainObject(
				arguments_[0],
				schemaMutationManyInputKeys,
				`Schema mutation ${options.name} input must be a plain object`,
				`Schema mutation ${options.name} input contains unknown key: `,
			)
			const manyInput: Readonly<Record<string, unknown>> = arguments_[0]
			if (!Object.hasOwn(manyInput, 'where')) {
				throw new TypeError(`Schema mutation ${options.name} requires where`)
			}
			return options.execute(
				options.command,
				options.schema,
				prepareSchemaMutationManyEnvelope({
					graph,
					command,
					schema: options.schema,
					name: options.name,
					where: manyInput.where,
					input: manyInput.input,
					projection: manyInput,
				}),
				arguments_[1] as OperationOptions | undefined,
			)
		}
		const input = assertSchemaMutationInput(arguments_[0], options.name)
		const idValue = input.id
		if (typeof idValue !== 'string') {
			throw new TypeError(`Schema mutation ${options.name} id must be a string`)
		}

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

/**
 * Resolves the exact selected and included result of one schema mutation, like
 * a read with the same projection, except that without `select` it returns
 * `id` plus the included values, like any write (ADR-0341).
 */
export type PluginSchemaMutationResult<
	TSchema extends SchemaDefinition,
	TSelection extends QuerySelection<TSchema> | undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = QueryResult<
	TSchema,
	Extract<
		[TSelection] extends [undefined]
			? 'id' | Extract<keyof NonNullable<TInclude>, QueryFieldName<TSchema>>
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

/**
 * Describes one many-row schema-handle mutation call (ADR-0316): every row
 * matching `where` (`{}` targets every row the caller may target).
 */
export type PluginSchemaMutationManyInput<
	TSchema extends SchemaTypeInfoSource,
	TMutation extends PluginSchemaMutationDefinition,
	TSelection extends QuerySelection<TSchema> | undefined = undefined,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined =
		undefined,
> = Readonly<{ readonly where: WhereInput<TSchema> }> &
	MutationPayloadField<TMutation> &
	MutationProjection<TSchema, TSelection, TInclude>

/**
 * Exposes one many-row mutation on an application schema handle; it resolves
 * to one result per written row, in identifier order (ADR-0316).
 */
export type ApplicationSchemaMutationManyMethod<
	TSchema extends SchemaDefinition,
	TMutation extends PluginSchemaMutationDefinition,
> = <
	const TSelection extends QuerySelection<TSchema> | undefined = undefined,
	const TInclude extends
		SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined = undefined,
>(
	input: PluginSchemaMutationManyInput<
		TSchema,
		TMutation,
		TSelection,
		TInclude
	>,
	options?: OperationOptions,
) => Promise<
	readonly PluginSchemaMutationResult<TSchema, TSelection, TInclude>[]
>

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
