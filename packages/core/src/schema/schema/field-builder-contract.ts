import type {
	CompactScalarFieldDefinition,
	DefaultedCompactScalarFieldOptions,
	NonDefaultedCompactScalarFieldOptions,
} from '../fields/base/factory.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldListOption,
	FieldListValue,
	ResolveFieldSourceTemplate,
} from '../fields/base/contract.js'
import type { BigintFieldFactory } from '../fields/builtins/bigint.js'
import type { BinaryFieldFactory } from '../fields/builtins/binary.js'
import type { BooleanFieldFactory } from '../fields/builtins/boolean.js'
import type { DateTimeFieldFactory } from '../fields/builtins/date-time.js'
import type { DateFieldFactory } from '../fields/builtins/date.js'
import type { DecimalFieldFactory } from '../fields/builtins/decimal.js'
import type {
	CompatibleEnumFieldOptions,
	EnumFieldOptions,
	EnumValue,
	EnumValues,
} from '../fields/builtins/enum.js'
import type { FloatFieldFactory } from '../fields/builtins/float.js'
import type { IntFieldFactory } from '../fields/builtins/int.js'
import type { JsonFieldFactory } from '../fields/builtins/json.js'
import type {
	ObjectFieldOptions,
	ObjectFields,
} from '../fields/builtins/object.js'
import type { NamedPointerFieldBuilderMethod } from '../fields/builtins/pointer.js'
import type { NamedRelationFieldBuilderMethod } from '../fields/builtins/relation.js'
import type { StringFieldFactory } from '../fields/builtins/string.js'
import type { TimeFieldFactory } from '../fields/builtins/time.js'
import type { UuidFieldFactory } from '../fields/builtins/uuid.js'
import type { OutputBuilder } from '../output/contracts.js'
import type {
	SchemaTypeInfo,
	SchemaTypeInfoByNameOrBase,
	SchemaTypeInfoSource,
	UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	UltimaBaseGeneratedFieldBuilderMethods,
	UltimaBaseGeneratedVirtualFieldBuilderMethods,
} from '../type-info.js'
import type { SchemaDeclaredFields } from './definition.js'
import type {
	EmbeddedBigintFieldFactory,
	EmbeddedBinaryFieldFactory,
	EmbeddedBooleanFieldFactory,
	EmbeddedDateFieldFactory,
	EmbeddedDateTimeFieldFactory,
	EmbeddedDecimalFieldFactory,
	EmbeddedEnumFieldFactory,
	EmbeddedFloatFieldFactory,
	EmbeddedIntFieldFactory,
	EmbeddedJsonFieldFactory,
	EmbeddedStringFieldFactory,
	EmbeddedTimeFieldFactory,
	EmbeddedUuidFieldFactory,
} from './embedded-field-options.js'
import type {
	EmbeddedObjectFieldBuilderMethod,
	ObjectFieldBuilderMethod,
} from './object-field-builder.js'
import type { VirtualFieldBuilderMethod } from './virtual-field.js'

/** Declares nested fields through the same map-returning shape as a schema. */
export type ObjectFieldBuilderOptions<
	TFields extends ObjectFields = ObjectFields,
> = Omit<ObjectFieldOptions<TFields>, 'fields'> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

type EmptyFieldSourceTemplate = Readonly<Record<never, never>>

/** Lists built-in scalar methods shared by the stored root builder. */
export interface ScalarFieldBuilderMethods<
	TSourceTemplate extends object = EmptyFieldSourceTemplate,
	TEmbeddedBuilder = EmbeddedFieldBuilder,
> {
	/** Declares one UTF-16 string. @example `field.string({ required: true })` */
	readonly string: StringFieldFactory<TSourceTemplate>
	/** Declares one boolean. @example `field.boolean({ default: false })` */
	readonly boolean: BooleanFieldFactory<TSourceTemplate>
	/** Declares one floating-point number. @example `field.float()` */
	readonly float: FloatFieldFactory<TSourceTemplate>
	/** Declares one exact decimal string. @example `field.decimal()` */
	readonly decimal: DecimalFieldFactory<TSourceTemplate>
	/** Declares one UUID string. @example `field.uuid()` */
	readonly uuid: UuidFieldFactory<TSourceTemplate>
	/** Declares one calendar date. @example `field.date()` */
	readonly date: DateFieldFactory<TSourceTemplate>
	/** Declares one timestamp. @example `field.dateTime()` */
	readonly dateTime: DateTimeFieldFactory<TSourceTemplate>
	/** Declares one time of day. @example `field.time()` */
	readonly time: TimeFieldFactory<TSourceTemplate>
	/** Declares immutable binary data. @example `field.binary()` */
	readonly binary: BinaryFieldFactory<TSourceTemplate>
	/** Declares one arbitrary JSON document. @example `field.json()` */
	readonly json: JsonFieldFactory<TSourceTemplate>
	/** Declares one closed string domain. @example `field.enum({ values: ['draft'] })` */
	readonly enum: EnumFieldBuilderMethod<TSourceTemplate>
	/** Declares one structured value. @example `field.object({ fields: () => ({}) })` */
	readonly object: ObjectFieldBuilderMethod<TSourceTemplate, TEmbeddedBuilder>
}

type DefaultedEnumFieldBuilderOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type NonDefaultedEnumFieldBuilderOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

interface EnumFieldBuilderMethod<
	TSourceTemplate extends object = EmptyFieldSourceTemplate,
> {
	<
		const TValues extends EnumValues,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedEnumFieldBuilderOptions<TValues, TRequired, TList, TImmutable>,
			TExtensionOptions,
			EnumValue<TValues>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<EnumValue<TValues>, TList>,
					TRequired extends true
						? FieldListValue<EnumValue<TValues>, TList>
						: FieldListValue<EnumValue<TValues>, TList> | null
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		'enum',
		EnumValue<TValues>,
		EnumFieldOptions<TValues> & TExtensionOptions,
		TRequired,
		TList,
		TImmutable,
		true
	>
	<
		const TValues extends EnumValues,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			NonDefaultedEnumFieldBuilderOptions<
				TValues,
				TRequired,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			EnumValue<TValues>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<EnumValue<TValues>, TList>,
					TRequired extends true
						? FieldListValue<EnumValue<TValues>, TList>
						: FieldListValue<EnumValue<TValues>, TList> | null
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		'enum',
		EnumValue<TValues>,
		EnumFieldOptions<TValues> & TExtensionOptions,
		TRequired,
		TList,
		TImmutable,
		false
	>
}

/** Provides top-level factories while the returned object owns field names. */
export type FieldBuilder<
	TSchema extends SchemaTypeInfoSource = SchemaTypeInfo,
	TStoredSourceTemplate extends object = EmptyFieldSourceTemplate,
	TEmbeddedSourceTemplate extends object = EmptyFieldSourceTemplate,
	TVirtualSourceTemplate extends object = EmptyFieldSourceTemplate,
	TStoredPluginMethods extends object = UltimaBaseGeneratedFieldBuilderMethods,
	TEmbeddedPluginMethods extends object =
		UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	TVirtualPluginMethods extends object =
		UltimaBaseGeneratedVirtualFieldBuilderMethods,
	TOutputBuilder = OutputBuilder,
> = ScalarFieldBuilderMethods<
	TStoredSourceTemplate,
	EmbeddedFieldBuilder<TEmbeddedSourceTemplate, TEmbeddedPluginMethods>
> &
	TStoredPluginMethods & {
		/** Declares one integer number. @example `field.int({ default: 0 })` */
		readonly int: IntFieldFactory<TStoredSourceTemplate>
		/** Declares one arbitrary-precision integer. @example `field.bigint()` */
		readonly bigint: BigintFieldFactory<TStoredSourceTemplate>
		/** Declares one typed pointer. @example `field.pointer({ target: "User" })` */
		readonly pointer: NamedPointerFieldBuilderMethod<TStoredSourceTemplate>
		/** Declares one to-many relationship. @example `field.relation({ target: "Post" })` */
		readonly relation: NamedRelationFieldBuilderMethod
		/** Declares one output-only field resolved from persisted dependencies. @example `field.virtual({ output, select: { id: true }, resolve })` */
		readonly virtual: VirtualFieldBuilderMethod<
			TSchema,
			TVirtualSourceTemplate,
			TOutputBuilder,
			TVirtualPluginMethods
		>
	}

/** Provides only value-field factories accepted inside an embedded object. */
export type EmbeddedFieldBuilder<
	TSourceTemplate extends object = EmptyFieldSourceTemplate,
	TPluginMethods extends object =
		UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
> = TPluginMethods & {
	/** Declares one embedded UTF-16 string. @example `field.string()` */
	readonly string: EmbeddedStringFieldFactory<TSourceTemplate>
	/** Declares one embedded boolean. @example `field.boolean()` */
	readonly boolean: EmbeddedBooleanFieldFactory<TSourceTemplate>
	/** Declares one embedded floating-point number. @example `field.float()` */
	readonly float: EmbeddedFloatFieldFactory<TSourceTemplate>
	/** Declares one embedded exact decimal string. @example `field.decimal()` */
	readonly decimal: EmbeddedDecimalFieldFactory<TSourceTemplate>
	/** Declares one embedded UUID string. @example `field.uuid()` */
	readonly uuid: EmbeddedUuidFieldFactory<TSourceTemplate>
	/** Declares one embedded calendar date. @example `field.date()` */
	readonly date: EmbeddedDateFieldFactory<TSourceTemplate>
	/** Declares one embedded timestamp. @example `field.dateTime()` */
	readonly dateTime: EmbeddedDateTimeFieldFactory<TSourceTemplate>
	/** Declares one embedded time of day. @example `field.time()` */
	readonly time: EmbeddedTimeFieldFactory<TSourceTemplate>
	/** Declares one embedded immutable binary value. @example `field.binary()` */
	readonly binary: EmbeddedBinaryFieldFactory<TSourceTemplate>
	/** Declares one embedded JSON document. @example `field.json()` */
	readonly json: EmbeddedJsonFieldFactory<TSourceTemplate>
	/** Declares one embedded enum. @example `field.enum({ values: ['draft'] })` */
	readonly enum: EmbeddedEnumFieldFactory<TSourceTemplate>
	/** Declares one recursively embedded object. @example `field.object({ fields: () => ({}) })` */
	readonly object: EmbeddedObjectFieldBuilderMethod<
		TSourceTemplate,
		EmbeddedFieldBuilder<TSourceTemplate, TPluginMethods>
	>
	/** Declares one embedded integer number. @example `field.int()` */
	readonly int: EmbeddedIntFieldFactory<TSourceTemplate>
	/** Declares one embedded arbitrary-precision integer. @example `field.bigint()` */
	readonly bigint: EmbeddedBigintFieldFactory<TSourceTemplate>
}

/** Names the canonical map-returning schema field declaration. */
export type SchemaFieldBuilderDeclaration<
	TFields extends SchemaDeclaredFields = SchemaDeclaredFields,
	TClassName extends string = string,
> = (field: FieldBuilder<SchemaTypeInfoByNameOrBase<TClassName>>) => TFields
