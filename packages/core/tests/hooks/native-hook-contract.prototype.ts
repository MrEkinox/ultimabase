import {
	defineSchemaExtension,
	intField as coreIntField,
	RequestContextValue,
	stringField as coreStringField,
} from '../../src/index.js'
import type {
	EnumFieldOptions,
	EnumValue,
	EnumValues,
	FieldDefinition,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	FieldValidationOptions,
	InferCreateInput,
	InferObject,
	InferOperationResult,
	InferUpdateInput,
	HookContext,
	ObjectFieldOptions,
	ObjectFields,
	ObjectFieldValue,
	OperationAst,
	OperationAstNode,
	Query,
	QueryFieldName,
	ScalarFieldInferenceState,
	SchemaDefinition,
	SchemaExtensions,
	SchemaFields,
	SchemaOptions,
} from '../../src/index.js'

interface FixturePrincipal {
	readonly id: string
}

const principalValue = new RequestContextValue<FixturePrincipal>(
	'fixture.principal',
	(value: unknown): FixturePrincipal => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('Fixture principal must contain a string id')
		}

		return Object.freeze({ id: value.id })
	},
)
declare const hookContext: HookContext

export const /* hover:request-context-value */ packedPrincipal =
		hookContext.getValue(principalValue)

type MaybePromise<TValue> = TValue | Promise<TValue>

type PrototypeSchemaDefinition<
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> = SchemaDefinition<TClassName, TFields, TExtensions>

type SchemaResolveInputContext<TSchema extends SchemaDefinition> =
	| {
			readonly kind: 'create'
			readonly input: InferCreateInput<TSchema>
	  }
	| {
			readonly kind: 'update'
			readonly input: InferUpdateInput<TSchema>
	  }

type CreateOperation<TSchema extends SchemaDefinition> = Extract<
	OperationAst<TSchema>,
	{
		readonly kind: 'create-many' | 'create-one'
	}
>

type ReadOperation<TSchema extends SchemaDefinition> = Extract<
	OperationAst<TSchema>,
	{
		readonly kind: 'count' | 'exists' | 'find-many' | 'find-one' | 'get'
	}
>

type SchemaOperationResultContext<
	TSchema extends SchemaDefinition,
	TOperation extends OperationAst<TSchema> = OperationAst<TSchema>,
> = TOperation extends OperationAstNode
	? {
			readonly kind: TOperation['kind']
			readonly operation: TOperation
			readonly result: InferOperationResult<TOperation>
		}
	: never

interface PrototypeSchemaHooks<TSchema extends SchemaDefinition> {
	readonly resolveInput?: (
		context: SchemaResolveInputContext<TSchema>,
	) => MaybePromise<void>
	readonly beforeCreate?: (context: {
		readonly object: InferObject<TSchema>
		readonly operation: CreateOperation<TSchema>
	}) => MaybePromise<void>
	readonly beforeRead?: PrototypeBeforeReadHook<TSchema>
	readonly afterRead?: (
		context: SchemaOperationResultContext<TSchema, ReadOperation<TSchema>>,
	) => MaybePromise<void>
}

/** Preserves a terminal's accumulated selection through immutable query transforms. */
export type PrototypeBeforeReadHook<TSchema extends SchemaDefinition> = <
	const TSelectedField extends QueryFieldName<TSchema>,
>(context: {
	readonly operation: ReadOperation<TSchema>
	readonly query: Query<TSchema, TSelectedField>
}) => MaybePromise<Query<TSchema, TSelectedField> | undefined>

type PrototypeSchemaOptions<
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> = Omit<SchemaOptions<TClassName, TFields, TExtensions>, 'hooks'> & {
	readonly hooks?: PrototypeSchemaHooks<
		PrototypeSchemaDefinition<
			NoInfer<TClassName>,
			NoInfer<TFields>,
			NoInfer<TExtensions>
		>
	>
}

/**
 * Models the future constructor boundary without adding production storage in issue 324.
 */
declare class PrototypeSchema<
	const TClassName extends string,
	const TFields extends SchemaFields,
	const TExtensions extends SchemaExtensions = readonly [],
> implements SchemaDefinition<TClassName, TFields, TExtensions> {
	/** Mirrors the neutral metadata boundary introduced by the production schema class. */
	readonly definition: SchemaDefinition<
		TClassName,
		TFields,
		TExtensions
	>['definition']
	readonly className: TClassName
	readonly fields: SchemaDefinition<TClassName, TFields, TExtensions>['fields']
	readonly indexes: SchemaDefinition<
		TClassName,
		TFields,
		TExtensions
	>['indexes']
	readonly extensions: readonly [...TExtensions]

	constructor(options: PrototypeSchemaOptions<TClassName, TFields, TExtensions>)
}

interface PrototypeFieldHooks<TValue> {
	readonly resolveInput?: (context: {
		readonly value: TValue
	}) => MaybePromise<TValue>
}

type PrototypePresenceOptions<
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
> = Omit<
	FieldOptions<TValue, FieldValidationOptions, TList>,
	'default' | 'list' | 'validation'
> & {
	readonly hooks?: PrototypeFieldHooks<
		TRequired extends true
			? FieldListValue<TValue, TList>
			: FieldListValue<TValue, TList> | null
	>
	readonly list?: TList
	readonly validation?: {
		readonly required?: TRequired
	}
}

type PrototypeField<
	TKind extends string,
	TValue,
	TOptions extends object,
	TRequired extends boolean,
	TList extends FieldListOption,
> = FieldDefinition<
	TKind,
	TValue,
	TOptions,
	ScalarFieldInferenceState<TRequired, TList, false, false>
>

/** Models a scalar factory whose callback declarations never enter field metadata. */
declare function stringField<
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
>(
	options?: PrototypePresenceOptions<string, TRequired, TList>,
): PrototypeField<'string', string, FieldOptions<string>, TRequired, TList>

type PrototypeEnumOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
> = Omit<EnumFieldOptions<TValues>, 'default' | 'list' | 'validation'> &
	PrototypePresenceOptions<EnumValue<TValues>, TRequired, TList>

/** Models exact enum value inference before native field hooks are implemented. */
declare function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
>(
	options: PrototypeEnumOptions<TValues, TRequired, TList>,
): PrototypeField<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TRequired,
	TList
>

type PrototypeObjectOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
> = Omit<ObjectFieldOptions<TFields>, 'default' | 'list' | 'validation'> &
	PrototypePresenceOptions<ObjectFieldValue<TFields>, TRequired, TList>

/** Models exact structured values without exposing sibling schema fields. */
declare function objectField<
	const TFields extends ObjectFields,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
>(
	options: PrototypeObjectOptions<TFields, TRequired, TList>,
): PrototypeField<
	'object',
	ObjectFieldValue<TFields>,
	ObjectFieldOptions<TFields>,
	TRequired,
	TList
>

type VectorValue = readonly [number, number, number]

/** Models a community field whose plugin fixes its logical value before hooks run. */
declare function vectorField<
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
>(
	options?: PrototypePresenceOptions<VectorValue, TRequired, TList>,
): PrototypeField<
	'fixture.vector',
	VectorValue,
	FieldOptions<VectorValue>,
	TRequired,
	TList
>

export const emailField = /* hover:field-definition */ stringField({
	hooks: {
		resolveInput: ({ value }) => {
			if (value === null) return null

			// @ts-expect-error -- Inline field hooks never expose sibling schema fields.
			void value.title
			const normalized = /* hover:string-value */ value.trim()

			return normalized
		},
	},
})

export const statusField = enumField({
	values: ['draft', 'published'] as const,
	hooks: {
		resolveInput: ({ value }) => {
			const status = /* hover:enum-value */ value

			return status
		},
	},
})

export const profileField = objectField({
	fields: {
		displayName: coreStringField({ validation: { required: true } }),
	},
	hooks: {
		resolveInput: ({ value }) => {
			const profile = /* hover:object-value */ value

			return profile === null
				? null
				: { displayName: profile.displayName.trim() }
		},
	},
})

export const matrixField = stringField({
	list: [true, true],
	hooks: {
		resolveInput: ({ value }) => {
			const matrix = /* hover:list-value */ value

			return matrix
		},
	},
})

export const nullableField = stringField({
	hooks: {
		resolveInput: ({ value }) => {
			const nullable = /* hover:nullable-value */ value

			return nullable === null ? null : nullable.trim()
		},
	},
})

export const embeddingField = vectorField({
	hooks: {
		resolveInput: ({ value }) => {
			const embedding = /* hover:custom-value */ value

			return embedding
		},
	},
})

const permissionsExtension = defineSchemaExtension('fixture.permissions', {
	marker: 'OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK',
})

export const PostSchema = new PrototypeSchema({
	className: 'Post',
	fields: {
		email: emailField,
		status: statusField,
		title: coreStringField({ validation: { required: true } }),
		views: coreIntField(),
	},
	extensions: [permissionsExtension],
	hooks: {
		resolveInput: (context) => {
			if (context.kind === 'create') {
				const /* hover:create-input */ createInput = context.input

				createInput.title.toUpperCase()
			} else {
				const /* hover:update-input */ updateInput = context.input

				updateInput.title?.toUpperCase()
			}
		},
		beforeCreate: ({ object }) => {
			const /* hover:object */ savedObject = object

			savedObject.id.toUpperCase()
			savedObject.title.toUpperCase()
		},
		beforeRead: ({ operation, query }) => {
			const /* hover:query */ typedQuery = query

			if (operation.kind === 'get') {
				operation.id.toUpperCase()
			}

			return typedQuery.limit(25)
		},
		afterRead: (context) => {
			if (context.kind === 'count') {
				const /* hover:count-result */ count = context.result

				count.toFixed()
			}

			if (context.kind === 'find-many') {
				const /* hover:find-result */ posts = context.result

				posts.at(0)?.title.toUpperCase()
			}
		},
	},
})

// Completion-only declarations exercise the contextual option surfaces.
new PrototypeSchema({
	/* completion:schema-options */ className: 'CompletionOptions',
	fields: {},
})
new PrototypeSchema({
	className: 'Completion',
	fields: {},
	hooks: {/* completion:schema-hooks */},
})
stringField({/* completion:field-options */})

stringField({
	hooks: {
		// @ts-expect-error -- A field transform must preserve its logical value type.
		resolveInput: () => 42,
	},
})
