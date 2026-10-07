export interface StandardSchema<TValue> {
	readonly '~standard': {
		readonly validate: (
			value: unknown,
		) =>
			| { readonly issues: readonly { readonly message: string }[] }
			| { readonly value: TValue }
		readonly vendor: string
		readonly version: 1
	}
}

interface FieldValueType {
	readonly sourceType: 'field-value'
}
interface SchemaCreateInputWith<TExtra extends object> {
	readonly extra: TExtra
	readonly sourceType: 'schema-create-input'
}
interface SchemaItemType {
	readonly sourceType: 'schema-item'
}
interface SchemaSelectType {
	readonly sourceType: 'schema-select'
}
interface SchemaWhereType {
	readonly sourceType: 'schema-where'
}

interface SchemaProjectionTemplate<TTemplate extends object = object> {
	readonly classNames?: readonly string[]
	readonly template: TTemplate
}

interface PluginSourceProjection {
	readonly application?: object
	readonly fieldBuilder?: object
	readonly fieldOptions?: object
	readonly schemaFields?: SchemaProjectionTemplate
	readonly schemaOptions?: SchemaProjectionTemplate
	readonly schemaStatics?: SchemaProjectionTemplate
}

export interface PluginDefinition<
	TProjection extends PluginSourceProjection = PluginSourceProjection,
> {
	readonly source: TProjection
}

type ProjectionOf<TPlugin> =
	TPlugin extends PluginDefinition<infer TProjection> ? TProjection : never

interface SourceProjectionState {
	readonly application: object
	readonly fieldBuilder: object
	readonly fieldOptions: object
	readonly schemaFields: SchemaProjectionTemplate
	readonly schemaOptions: SchemaProjectionTemplate
	readonly schemaStatics: SchemaProjectionTemplate
}

interface EmptySourceProjection extends SourceProjectionState {
	readonly schemaFields: never
	readonly schemaOptions: never
	readonly schemaStatics: never
}

type ObjectProjection<TProjection, TKey extends keyof PluginSourceProjection> =
	TProjection extends Readonly<Record<TKey, infer TValue extends object>>
		? TValue
		: object
type TemplateProjection<
	TProjection,
	TKey extends keyof PluginSourceProjection,
> =
	TProjection extends Readonly<
		Record<TKey, infer TValue extends SchemaProjectionTemplate>
	>
		? TValue
		: never

interface MergeSourceProjection<
	TCurrent extends SourceProjectionState,
	TAdded extends PluginSourceProjection,
> {
	readonly application: TCurrent['application'] &
		ObjectProjection<TAdded, 'application'>
	readonly fieldBuilder: TCurrent['fieldBuilder'] &
		ObjectProjection<TAdded, 'fieldBuilder'>
	readonly fieldOptions: TCurrent['fieldOptions'] &
		ObjectProjection<TAdded, 'fieldOptions'>
	readonly schemaFields:
		TCurrent['schemaFields'] | TemplateProjection<TAdded, 'schemaFields'>
	readonly schemaOptions:
		TCurrent['schemaOptions'] | TemplateProjection<TAdded, 'schemaOptions'>
	readonly schemaStatics:
		TCurrent['schemaStatics'] | TemplateProjection<TAdded, 'schemaStatics'>
}
type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never
type ObjectIntersection<TValue> =
	UnionToIntersection<TValue> extends object
		? UnionToIntersection<TValue>
		: object
type Simplify<TValue extends object> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
}

type ResolveFieldTemplate<TTemplate, TValue> = TTemplate extends FieldValueType
	? TValue
	: TTemplate extends (...args: infer TArguments) => infer TResult
		? (
				...args: {
					[TIndex in keyof TArguments]: ResolveFieldTemplate<
						TArguments[TIndex],
						TValue
					>
				}
			) => ResolveFieldTemplate<TResult, TValue>
		: TTemplate extends Promise<infer TResult>
			? Promise<ResolveFieldTemplate<TResult, TValue>>
			: TTemplate extends readonly (infer TItem)[]
				? readonly ResolveFieldTemplate<TItem, TValue>[]
				: TTemplate extends object
					? {
							readonly [TKey in keyof TTemplate]: ResolveFieldTemplate<
								TTemplate[TKey],
								TValue
							>
						}
					: TTemplate

type PluginFieldOptions<
	TSource extends SourceProjectionState,
	TValue,
> = ResolveFieldTemplate<TSource['fieldOptions'], TValue>

type PluginFieldBuilder<TSource extends SourceProjectionState> =
	TSource['fieldBuilder']

interface ScalarField<
	TKind extends string,
	TValue,
	TRequired extends boolean,
	THasDefault extends boolean,
> {
	readonly hasDefault: THasDefault
	readonly kind: TKind
	readonly required: TRequired
	readonly value: TValue
}

interface ObjectField<TFields extends Fields, TRequired extends boolean> {
	readonly fields: TFields
	readonly hasDefault: false
	readonly kind: 'object'
	readonly required: TRequired
}

interface PointerField<TTarget extends string, TRequired extends boolean> {
	readonly hasDefault: false
	readonly kind: 'pointer'
	readonly required: TRequired
	readonly target: TTarget
}

interface RelationField<TTarget extends string> {
	readonly hasDefault: true
	readonly kind: 'relation'
	readonly required: true
	readonly target: TTarget
}

export type SoftDeleteField = ScalarField<'boolean', boolean, true, true> & {
	readonly mutationInput: 'forbidden'
}
export type RoleNameField = ScalarField<'string', string, true, false>
export type SourceRelationField<TTarget extends string> = RelationField<TTarget>
export type VectorField = ScalarField<'vector', readonly number[], false, false>

type Field =
	| ObjectField<Fields, boolean>
	| PointerField<string, boolean>
	| RelationField<string>
	| ScalarField<string, unknown, boolean, boolean>

export type Fields = Readonly<Record<string, Field>>

type ScalarOptions<
	TSource extends SourceProjectionState,
	TValue,
	TRequired extends boolean,
	TDefault,
> = PluginFieldOptions<TSource, TValue> & {
	readonly default?: TDefault
	readonly required?: TRequired
}

interface CoreFieldBuilder<TSource extends SourceProjectionState> {
	readonly boolean: <
		const TRequired extends boolean = false,
		const TDefault extends boolean | undefined = undefined,
	>(
		options?: ScalarOptions<TSource, boolean, TRequired, TDefault>,
	) => ScalarField<
		'boolean',
		boolean,
		TRequired,
		TDefault extends undefined ? false : true
	>
	readonly int: <
		const TRequired extends boolean = false,
		const TDefault extends number | undefined = undefined,
	>(
		options?: ScalarOptions<TSource, number, TRequired, TDefault>,
	) => ScalarField<
		'int',
		number,
		TRequired,
		TDefault extends undefined ? false : true
	>
	readonly object: <
		const TObjectFields extends Fields,
		const TRequired extends boolean = false,
	>(options: {
		readonly fields: (
			field: CoreFieldBuilder<TSource> & PluginFieldBuilder<TSource>,
		) => TObjectFields
		readonly required?: TRequired
	}) => ObjectField<TObjectFields, TRequired>
	readonly pointer: <
		const TTarget extends string,
		const TRequired extends boolean = false,
	>(options: {
		readonly required?: TRequired
		readonly target: TTarget
	}) => PointerField<TTarget, TRequired>
	readonly relation: <const TTarget extends string>(options: {
		readonly mappedBy?: string
		readonly target: TTarget
	}) => RelationField<TTarget>
	readonly string: <
		const TRequired extends boolean = false,
		const TDefault extends string | undefined = undefined,
	>(
		options?: ScalarOptions<TSource, string, TRequired, TDefault>,
	) => ScalarField<
		'string',
		string,
		TRequired,
		TDefault extends undefined ? false : true
	>
}

export interface GeneratedSchemaRegistry {
	readonly __typegenRegistryBrand?: never
}

export interface GeneratedSchema<
	TName extends string = string,
	TFields extends Fields = Fields,
> {
	readonly className: TName
	readonly fields: TFields
}

type GeneratedSchemaByName<TName extends string> =
	TName extends keyof GeneratedSchemaRegistry
		? GeneratedSchemaRegistry[TName] extends GeneratedSchema
			? GeneratedSchemaRegistry[TName]
			: never
		: never

export interface PointerHandle<TTarget extends string> {
	readonly className: TTarget
	readonly findOne: () => Promise<ItemOf<GeneratedSchemaByName<TTarget>> | null>
	readonly id: string
}

type FieldValue<TField extends Field> =
	TField extends ScalarField<string, infer TValue, infer TRequired, boolean>
		? TRequired extends true
			? TValue
			: TValue | null
		: TField extends ObjectField<infer TObjectFields, infer TRequired>
			? TRequired extends true
				? ItemFields<TObjectFields>
				: ItemFields<TObjectFields> | null
			: TField extends PointerField<infer TTarget, infer TRequired>
				? TRequired extends true
					? PointerHandle<TTarget>
					: PointerHandle<TTarget> | null
				: never

type ItemFields<TFields extends Fields> = {
	readonly [
		TName in keyof TFields as TFields[TName] extends RelationField<string>
			? never
			: TName
	]: FieldValue<TFields[TName]>
}

export type ItemOf<TSchema> =
	TSchema extends GeneratedSchema<string, infer TFields>
		? Readonly<
				{
					readonly createdAt: Date
					readonly id: string
					readonly updatedAt: Date
				} & ItemFields<TFields>
			>
		: never

type CreateFieldValue<TField extends Field> =
	TField extends ScalarField<string, infer TValue, boolean, boolean>
		? TValue
		: TField extends ObjectField<infer TObjectFields, boolean>
			? CreateInput<TObjectFields>
			: TField extends PointerField<infer TTarget, boolean>
				? | { readonly connect: string }
					| {
							readonly create: CreateInput<
								GeneratedSchemaByName<TTarget>['fields']
							>
					  }
				: TField extends RelationField<infer TTarget>
					? {
							readonly connect?: readonly string[]
							readonly create?: readonly CreateInput<
								GeneratedSchemaByName<TTarget>['fields']
							>[]
						}
					: never

type RequiredCreateNames<TFields extends Fields> = {
	[TName in keyof TFields]: TFields[TName] extends {
		readonly mutationInput: 'forbidden'
	}
		? never
		: TFields[TName] extends {
					readonly hasDefault: false
					readonly required: true
			  }
			? TName
			: never
}[keyof TFields]

type WritableCreateNames<TFields extends Fields> = {
	[TName in keyof TFields]: TFields[TName] extends {
		readonly mutationInput: 'forbidden'
	}
		? never
		: TName
}[keyof TFields]

type CreateInput<TFields extends Fields> = Readonly<
	{
		[TName in RequiredCreateNames<TFields>]: CreateFieldValue<TFields[TName]>
	} & {
		[
			TName in Exclude<
				WritableCreateNames<TFields>,
				RequiredCreateNames<TFields>
			>
		]?: CreateFieldValue<TFields[TName]>
	}
>

type UpdateInput<TFields extends Fields> = Readonly<{
	[
		TName in keyof TFields as TFields[TName] extends {
			readonly mutationInput: 'forbidden'
		}
			? never
			: TName
	]?: CreateFieldValue<TFields[TName]>
}>

type ScalarFilter<TValue> = Readonly<{
	eq?: TValue
	in?: readonly TValue[]
	ne?: TValue
}>

type WhereFieldValue<TField extends Field> =
	TField extends PointerField<infer TTarget, boolean>
		? { readonly is?: WhereOf<GeneratedSchemaByName<TTarget>> }
		: TField extends RelationField<infer TTarget>
			? { readonly some?: WhereOf<GeneratedSchemaByName<TTarget>> }
			: ScalarFilter<Exclude<FieldValue<TField>, null>>

export type WhereOf<TSchema> =
	TSchema extends GeneratedSchema<string, infer TFields>
		? Readonly<
				{
					readonly AND?: readonly WhereOf<TSchema>[]
					readonly id?: ScalarFilter<string>
				} & {
					readonly [TName in keyof TFields]?: WhereFieldValue<TFields[TName]>
				}
			>
		: never

type PublicSchema<TName extends string, TFields extends Fields> =
	GeneratedSchemaByName<TName> extends never
		? GeneratedSchema<TName, TFields>
		: GeneratedSchemaByName<TName>

type SelectOf<TFields extends Fields> = Readonly<
	{ readonly id?: true } & {
		readonly [TName in keyof TFields]?: true
	}
>

type ResolveSchemaTemplate<TTemplate, TContext extends GeneratedSchema> =
	TTemplate extends SchemaCreateInputWith<infer TExtra>
		? CreateInput<TContext['fields']> & ResolveSchemaTemplate<TExtra, TContext>
		: TTemplate extends SchemaItemType
			? ItemOf<PublicSchema<TContext['className'], TContext['fields']>>
			: TTemplate extends SchemaSelectType
				? SelectOf<TContext['fields']>
				: TTemplate extends SchemaWhereType
					? WhereOf<PublicSchema<TContext['className'], TContext['fields']>>
					: TTemplate extends (...args: infer TArguments) => infer TResult
						? (
								...args: {
									[TIndex in keyof TArguments]: ResolveSchemaTemplate<
										TArguments[TIndex],
										TContext
									>
								}
							) => ResolveSchemaTemplate<TResult, TContext>
						: TTemplate extends Promise<infer TResult>
							? Promise<ResolveSchemaTemplate<TResult, TContext>>
							: TTemplate extends readonly (infer TItem)[]
								? readonly ResolveSchemaTemplate<TItem, TContext>[]
								: TTemplate extends object
									? {
											readonly [TKey in keyof TTemplate]: ResolveSchemaTemplate<
												TTemplate[TKey],
												TContext
											>
										}
									: TTemplate

type ResolveSchemaProjection<TProjection, TContext extends GeneratedSchema> =
	TProjection extends SchemaProjectionTemplate<infer TTemplate>
		? TProjection extends { readonly classNames: readonly string[] }
			? TContext['className'] extends TProjection['classNames'][number]
				? ResolveSchemaTemplate<TTemplate, TContext>
				: object
			: ResolveSchemaTemplate<TTemplate, TContext>
		: never

type PluginSchemaOptions<
	TSource extends SourceProjectionState,
	TContext extends GeneratedSchema,
> = Simplify<
	ObjectIntersection<
		ResolveSchemaProjection<TSource['schemaOptions'], TContext>
	>
>

type PluginSchemaFields<
	TSource extends SourceProjectionState,
	TContext extends GeneratedSchema,
> = Simplify<
	ObjectIntersection<ResolveSchemaProjection<TSource['schemaFields'], TContext>>
>
type CompleteSchemaFields<
	TName extends string,
	TFields extends Fields,
	TSource extends SourceProjectionState,
> = Readonly<
	Simplify<
		TFields &
			(PluginSchemaFields<
				TSource,
				GeneratedSchema<TName, TFields>
			> extends Fields
				? PluginSchemaFields<TSource, GeneratedSchema<TName, TFields>>
				: object)
	>
>

type PluginSchemaStatics<
	TSource extends SourceProjectionState,
	TContext extends GeneratedSchema,
> = Simplify<
	ObjectIntersection<
		ResolveSchemaProjection<TSource['schemaStatics'], TContext>
	>
>

type DefinedSchema<
	TName extends string,
	TFields extends Fields,
	TStatics extends object,
> = GeneratedSchema<TName, TFields> & {
	readonly createOne: (options: {
		readonly data: CreateInput<TFields>
		readonly select?: SelectOf<TFields>
	}) => Promise<ItemOf<PublicSchema<TName, TFields>>>
	readonly findMany: (options?: {
		readonly select?: SelectOf<TFields>
		readonly where?: WhereOf<PublicSchema<TName, TFields>>
	}) => Promise<readonly ItemOf<PublicSchema<TName, TFields>>[]>
	readonly updateOne: (options: {
		readonly data: UpdateInput<TFields>
		readonly where: WhereOf<PublicSchema<TName, TFields>>
	}) => Promise<ItemOf<PublicSchema<TName, TFields>> | null>
} & TStatics

type FieldDeclaration<TSource extends SourceProjectionState> = (
	field: CoreFieldBuilder<TSource> & PluginFieldBuilder<TSource>,
) => Fields

interface SchemaFactory<TSource extends SourceProjectionState> {
	readonly define: <
		const TName extends string,
		const TFieldDeclaration extends FieldDeclaration<TSource>,
	>(
		options: {
			readonly className: TName
			readonly fields: TFieldDeclaration
		} & PluginSchemaOptions<
			TSource,
			GeneratedSchema<
				TName,
				CompleteSchemaFields<TName, ReturnType<TFieldDeclaration>, TSource>
			>
		>,
	) => DefinedSchema<
		TName,
		CompleteSchemaFields<TName, ReturnType<TFieldDeclaration>, TSource>,
		PluginSchemaStatics<
			TSource,
			GeneratedSchema<
				TName,
				CompleteSchemaFields<TName, ReturnType<TFieldDeclaration>, TSource>
			>
		>
	>
}

export interface ApplicationInstance<
	TSource extends SourceProjectionState,
> extends AsyncDisposable {
	readonly operations: TSource['application']
	readonly start: () => Promise<void>
}

export interface ApplicationFactory<TSource extends SourceProjectionState> {
	readonly Schema: SchemaFactory<TSource>
	readonly use: <TPlugin extends PluginDefinition>(
		plugin: TPlugin,
	) => ApplicationFactory<MergeSourceProjection<TSource, ProjectionOf<TPlugin>>>
	new (options: {
		readonly schemas: readonly GeneratedSchema[]
	}): ApplicationInstance<TSource>
}

interface AccessFieldOptions {
	readonly access?: { readonly read?: boolean; readonly write?: boolean }
}

interface AccessSchemaOptions {
	readonly access?: Readonly<
		Partial<
			Record<
				'create' | 'delete' | 'read' | 'update',
				| boolean
				| {
						readonly filter?: (input: {
							readonly where: SchemaWhereType
						}) => SchemaWhereType
						readonly item?: (input: {
							readonly item: SchemaItemType
						}) => boolean
				  }
			>
		>
	>
}

interface HookFieldOptions {
	readonly hooks?: {
		readonly resolveInput?: (input: {
			readonly value: FieldValueType
		}) => FieldValueType
	}
}

interface HookSchemaOptions {
	readonly hooks?: {
		readonly afterOperation?: Partial<
			Record<
				'create' | 'delete' | 'update',
				(input: { readonly item: SchemaItemType }) => void | Promise<void>
			>
		>
	}
}

interface ValidationFieldOptions {
	readonly validation?: StandardSchema<FieldValueType>
}

interface SoftDeleteSchemaOptions {
	readonly softDelete?: false | 'explicit' | 'replace-delete'
}

interface SoftDeleteSchemaStatics {
	readonly softDelete: (options: {
		readonly id: string
		readonly select?: SchemaSelectType
	}) => Promise<SchemaItemType>
}

interface PasswordSchemaStatics {
	readonly login: (input: {
		readonly password: string
		readonly username: string
	}) => Promise<{ readonly user: SchemaItemType }>
	readonly signUp: (
		input: SchemaCreateInputWith<{
			readonly password: string
			readonly username: string
		}>,
	) => Promise<{ readonly user: SchemaItemType }>
}

interface PasswordApplication {
	readonly runWithSession: <TResult>(
		token: string,
		handler: () => TResult | Promise<TResult>,
	) => Promise<TResult>
}

interface RoleSchemaStatics {
	readonly role: (selector: string | { readonly id: string }) => {
		readonly selector: string
	}
}

interface VectorFieldBuilder {
	/** Declares an optional fixed-dimension vector. */
	readonly vector: (options: { readonly dimensions: number }) => VectorField
}

export declare const accessPlugin: () => PluginDefinition<{
	readonly fieldOptions: AccessFieldOptions
	readonly schemaOptions: { readonly template: AccessSchemaOptions }
}>
export declare const hooksPlugin: () => PluginDefinition<{
	readonly fieldOptions: HookFieldOptions
	readonly schemaOptions: { readonly template: HookSchemaOptions }
}>
export declare const passwordAuthPlugin: () => PluginDefinition<{
	readonly application: PasswordApplication
	readonly schemaStatics: {
		readonly classNames: readonly ['User']
		readonly template: PasswordSchemaStatics
	}
}>
export declare const pgVectorPlugin: () => PluginDefinition<{
	readonly fieldBuilder: VectorFieldBuilder
}>
export declare const rolesPlugin: () => PluginDefinition<{
	readonly schemaFields: {
		readonly classNames: readonly ['Role']
		readonly template: {
			readonly members: SourceRelationField<'User'>
			readonly name: RoleNameField
			readonly roles: SourceRelationField<'Role'>
		}
	}
	readonly schemaStatics: {
		readonly classNames: readonly ['Role']
		readonly template: RoleSchemaStatics
	}
}>
export declare const softDeletePlugin: (options: {
	readonly defaultMode: 'explicit'
}) => PluginDefinition<{
	readonly schemaFields: {
		readonly template: { readonly isDeleted: SoftDeleteField }
	}
	readonly schemaOptions: { readonly template: SoftDeleteSchemaOptions }
	readonly schemaStatics: { readonly template: SoftDeleteSchemaStatics }
}>
export declare const validationPlugin: () => PluginDefinition<{
	readonly fieldOptions: ValidationFieldOptions
}>

export declare const UltimaBase: ApplicationFactory<EmptySourceProjection>
