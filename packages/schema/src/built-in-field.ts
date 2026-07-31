import type { BigintField } from './bigint-field.js'
import type { BinaryField } from './binary-field.js'
import type { BooleanField } from './boolean-field.js'
import type { DateField } from './date-field.js'
import type { DateTimeField } from './date-time-field.js'
import type { DecimalField } from './decimal-field.js'
import type { EnumField } from './enum-field.js'
import type { FloatField } from './float-field.js'
import type { IntField } from './int-field.js'
import type { JsonField } from './json-field.js'
import type { ObjectField } from './object-field.js'
import type { StringField } from './string-field.js'
import type { IdSystemField } from './system-field.js'
import type { TimeField } from './time-field.js'
import type { UuidField } from './uuid-field.js'

/**
 * Keeps the framework-owned field union consistent across planners and snapshots.
 */
export type BuiltInField =
	| BigintField
	| BinaryField
	| BooleanField
	| DateField
	| DateTimeField
	| DecimalField
	| EnumField
	| FloatField
	| IdSystemField
	| IntField
	| JsonField
	| ObjectField
	| StringField
	| TimeField
	| UuidField

/**
 * Separates native field behavior from namespaced plugin-owned definitions.
 */
export const isBuiltInField = (field: {
	readonly kind: string
}): field is BuiltInField =>
	field.kind === 'bigint' ||
	field.kind === 'binary' ||
	field.kind === 'boolean' ||
	field.kind === 'date' ||
	field.kind === 'dateTime' ||
	field.kind === 'decimal' ||
	field.kind === 'enum' ||
	field.kind === 'float' ||
	field.kind === 'int' ||
	field.kind === 'json' ||
	field.kind === 'object' ||
	field.kind === 'string' ||
	field.kind === 'time' ||
	field.kind === 'uuid'
