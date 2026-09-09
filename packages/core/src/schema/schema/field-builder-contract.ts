import type { bigintField } from '../fields/builtins/bigint.js'
import type { binaryField } from '../fields/builtins/binary.js'
import type { booleanField } from '../fields/builtins/boolean.js'
import type { dateTimeField } from '../fields/builtins/date-time.js'
import type { dateField } from '../fields/builtins/date.js'
import type { decimalField } from '../fields/builtins/decimal.js'
import type { enumField } from '../fields/builtins/enum.js'
import type { floatField } from '../fields/builtins/float.js'
import type { intField } from '../fields/builtins/int.js'
import type { jsonField } from '../fields/builtins/json.js'
import type {
	ObjectFieldOptions,
	ObjectFields,
} from '../fields/builtins/object.js'
import type { NamedPointerFieldBuilderMethod } from '../fields/builtins/pointer.js'
import type { NamedRelationFieldBuilderMethod } from '../fields/builtins/relation.js'
import type { stringField } from '../fields/builtins/string.js'
import type { timeField } from '../fields/builtins/time.js'
import type { uuidField } from '../fields/builtins/uuid.js'
import type {
	UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	UltimaBaseGeneratedFieldBuilderMethods,
} from '../type-info.js'
import type { SchemaFields } from './definition.js'
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

/** Declares nested fields through the same map-returning shape as a schema. */
export type ObjectFieldBuilderOptions<
	TFields extends ObjectFields = ObjectFields,
> = Omit<ObjectFieldOptions<TFields>, 'fields'> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

/** Lists built-in scalar methods shared by the stored root builder. */
export interface ScalarFieldBuilderMethods {
	/** Declares one UTF-16 string. @example `field.string({ required: true })` */
	readonly string: typeof stringField
	/** Declares one boolean. @example `field.boolean({ default: false })` */
	readonly boolean: typeof booleanField
	/** Declares one floating-point number. @example `field.float()` */
	readonly float: typeof floatField
	/** Declares one exact decimal string. @example `field.decimal()` */
	readonly decimal: typeof decimalField
	/** Declares one UUID string. @example `field.uuid()` */
	readonly uuid: typeof uuidField
	/** Declares one calendar date. @example `field.date()` */
	readonly date: typeof dateField
	/** Declares one timestamp. @example `field.dateTime()` */
	readonly dateTime: typeof dateTimeField
	/** Declares one time of day. @example `field.time()` */
	readonly time: typeof timeField
	/** Declares immutable binary data. @example `field.binary()` */
	readonly binary: typeof binaryField
	/** Declares one arbitrary JSON document. @example `field.json()` */
	readonly json: typeof jsonField
	/** Declares one closed string domain. @example `field.enum({ values: ['draft'] })` */
	readonly enum: typeof enumField
	/** Declares one structured value. @example `field.object({ fields: () => ({}) })` */
	readonly object: ObjectFieldBuilderMethod
}

/** Provides top-level factories while the returned object owns field names. */
export interface FieldBuilder
	extends ScalarFieldBuilderMethods, UltimaBaseGeneratedFieldBuilderMethods {
	/** Declares one integer number. @example `field.int({ default: 0 })` */
	readonly int: typeof intField
	/** Declares one arbitrary-precision integer. @example `field.bigint()` */
	readonly bigint: typeof bigintField
	/** Declares one typed pointer. @example `field.pointer({ target: "User" })` */
	readonly pointer: NamedPointerFieldBuilderMethod
	/** Declares one to-many relationship. @example `field.relation({ target: "Post" })` */
	readonly relation: NamedRelationFieldBuilderMethod
}

/** Provides only value-field factories accepted inside an embedded object. */
export interface EmbeddedFieldBuilder extends UltimaBaseGeneratedEmbeddedFieldBuilderMethods {
	/** Declares one embedded UTF-16 string. @example `field.string()` */
	readonly string: EmbeddedStringFieldFactory
	/** Declares one embedded boolean. @example `field.boolean()` */
	readonly boolean: EmbeddedBooleanFieldFactory
	/** Declares one embedded floating-point number. @example `field.float()` */
	readonly float: EmbeddedFloatFieldFactory
	/** Declares one embedded exact decimal string. @example `field.decimal()` */
	readonly decimal: EmbeddedDecimalFieldFactory
	/** Declares one embedded UUID string. @example `field.uuid()` */
	readonly uuid: EmbeddedUuidFieldFactory
	/** Declares one embedded calendar date. @example `field.date()` */
	readonly date: EmbeddedDateFieldFactory
	/** Declares one embedded timestamp. @example `field.dateTime()` */
	readonly dateTime: EmbeddedDateTimeFieldFactory
	/** Declares one embedded time of day. @example `field.time()` */
	readonly time: EmbeddedTimeFieldFactory
	/** Declares one embedded immutable binary value. @example `field.binary()` */
	readonly binary: EmbeddedBinaryFieldFactory
	/** Declares one embedded JSON document. @example `field.json()` */
	readonly json: EmbeddedJsonFieldFactory
	/** Declares one embedded enum. @example `field.enum({ values: ['draft'] })` */
	readonly enum: EmbeddedEnumFieldFactory
	/** Declares one recursively embedded object. @example `field.object({ fields: () => ({}) })` */
	readonly object: EmbeddedObjectFieldBuilderMethod
	/** Declares one embedded integer number. @example `field.int()` */
	readonly int: EmbeddedIntFieldFactory
	/** Declares one embedded arbitrary-precision integer. @example `field.bigint()` */
	readonly bigint: EmbeddedBigintFieldFactory
}

/** Names the canonical map-returning schema field declaration. */
export type SchemaFieldBuilderDeclaration<
	TFields extends SchemaFields = SchemaFields,
> = (field: FieldBuilder) => TFields
