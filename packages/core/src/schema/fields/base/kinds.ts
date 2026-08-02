import { assertNonEmptyString } from '@ultimabase/shared'

import type { IdSystemField } from '../../schema/system-fields.js'
import type { BigintField } from '../builtins/bigint.js'
import type { BinaryField } from '../builtins/binary.js'
import type { BooleanField } from '../builtins/boolean.js'
import type { DateTimeField } from '../builtins/date-time.js'
import type { DateField } from '../builtins/date.js'
import type { DecimalField } from '../builtins/decimal.js'
import type { EnumField } from '../builtins/enum.js'
import type { FloatField } from '../builtins/float.js'
import type { IntField } from '../builtins/int.js'
import type { JsonField } from '../builtins/json.js'
import type { ObjectField } from '../builtins/object.js'
import type { StringField } from '../builtins/string.js'
import type { TimeField } from '../builtins/time.js'
import type { UuidField } from '../builtins/uuid.js'

/**
 * Lists framework-owned scalar kinds once for guards and plugin reservations.
 */
export const builtInFieldKinds = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'string',
	'time',
	'uuid',
] as const

export type BuiltInFieldKind = (typeof builtInFieldKinds)[number]

export type ReservedFieldKind = BuiltInFieldKind | 'array' | 'plugin'

/** Rejects framework-reserved or non-namespaced kinds at public type boundaries. */
export type AvailablePluginFieldKind<TKind extends string> =
	TKind extends ReservedFieldKind
		? never
		: TKind extends `${infer TNamespace}.${infer TName}`
			? TNamespace extends ''
				? never
				: TName extends ''
					? never
					: TKind
			: never

/** Keeps the framework-owned field union consistent across planners and snapshots. */
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

const builtInFieldKindSet: ReadonlySet<string> = new Set(builtInFieldKinds)

/** Keeps kind discrimination independent from concrete field option types. */
export const isBuiltInFieldKind = (kind: string): kind is BuiltInFieldKind =>
	builtInFieldKindSet.has(kind)

/** Separates native field behavior from namespaced plugin-owned definitions. */
export const isBuiltInField = (field: {
	readonly kind: string
}): field is BuiltInField => isBuiltInFieldKind(field.kind)

/** Enforces the collision-resistant identifier shared by every field plugin. */
export const assertPluginFieldKind = (kind: unknown, path: string): string => {
	assertNonEmptyString(kind, path)

	const separator = kind.indexOf('.')

	if (
		separator <= 0 ||
		separator === kind.length - 1 ||
		kind.trim() !== kind ||
		/\s/u.test(kind)
	) {
		throw new TypeError(`${path} must use a namespaced identifier`)
	}

	return kind
}
