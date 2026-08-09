import {
	immutableRecord,
	isPlainRecord,
	assertNonEmptyString,
} from '@ultimabase/shared'

import {
	bigintField,
	type BigintFieldOptions,
} from '../fields/builtins/bigint.js'
import {
	binaryField,
	type BinaryFieldOptions,
} from '../fields/builtins/binary.js'
import {
	booleanField,
	type BooleanFieldOptions,
} from '../fields/builtins/boolean.js'
import { dateField, type DateFieldOptions } from '../fields/builtins/date.js'
import {
	dateTimeField,
	type DateTimeFieldOptions,
} from '../fields/builtins/date-time.js'
import {
	decimalField,
	type DecimalFieldOptions,
} from '../fields/builtins/decimal.js'
import {
	enumField,
	type EnumFieldBuilderMethod,
} from '../fields/builtins/enum.js'
import { floatField, type FloatFieldOptions } from '../fields/builtins/float.js'
import { intField, type IntFieldOptions } from '../fields/builtins/int.js'
import {
	jsonField,
	type JsonDocument,
	type JsonFieldOptions,
} from '../fields/builtins/json.js'
import {
	objectField,
	type ObjectFieldOptions,
} from '../fields/builtins/object.js'
import {
	pointerField,
	type PointerFieldBuilderMethod,
} from '../fields/builtins/pointer.js'
import {
	relationField,
	type RelationFieldOptions,
	type RelationMappedFieldName,
} from '../fields/builtins/relation.js'
import {
	stringField,
	type StringFieldOptions,
} from '../fields/builtins/string.js'
import { timeField, type TimeFieldOptions } from '../fields/builtins/time.js'
import { uuidField, type UuidFieldOptions } from '../fields/builtins/uuid.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import type {
	CompactScalarFieldBuilderMethod,
	GeneratedCompactScalarFieldBuilderMethod,
} from '../fields/base/factory.js'
import type { SchemaDefinition, SchemaFields } from './definition.js'

type EmbeddedIntFieldOptions = Omit<IntFieldOptions, 'autoIncrement'> & {
	readonly autoIncrement?: false
}

type EmbeddedBigintFieldOptions = Omit<BigintFieldOptions, 'autoIncrement'> & {
	readonly autoIncrement?: false
}

type EmbeddableField<TField extends GenericField> = TField extends {
	readonly kind: 'pointer' | 'relation'
}
	? never
	: TField extends {
				readonly kind: 'int' | 'bigint'
				readonly options: { readonly autoIncrement: true }
		  }
		? never
		: TField

/** Replaces an embedded field map with one restricted nested declaration. */
export type ObjectFieldBuilderOptions = Omit<ObjectFieldOptions, 'fields'> & {
	/** Declares embedded fields with their complete logical path. */
	readonly fields: (field: EmbeddedFieldBuilder) => void
}

interface ScalarFieldBuilderMethods {
	/**
	 * Declares one UTF-16 string.
	 *
	 * @example `field.string('title')`
	 */
	readonly string: CompactScalarFieldBuilderMethod<string, StringFieldOptions>
	/**
	 * Declares one boolean.
	 *
	 * @example `field.boolean('published', { default: false })`
	 */
	readonly boolean: CompactScalarFieldBuilderMethod<
		boolean,
		BooleanFieldOptions
	>
	/**
	 * Declares one floating-point number.
	 *
	 * @example `field.float('score')`
	 */
	readonly float: CompactScalarFieldBuilderMethod<number, FloatFieldOptions>
	/**
	 * Declares one exact decimal string.
	 *
	 * @example `field.decimal('price')`
	 */
	readonly decimal: CompactScalarFieldBuilderMethod<string, DecimalFieldOptions>
	/**
	 * Declares one UUID string.
	 *
	 * @example `field.uuid('externalId')`
	 */
	readonly uuid: CompactScalarFieldBuilderMethod<string, UuidFieldOptions>
	/**
	 * Declares one calendar date.
	 *
	 * @example `field.date('birthday')`
	 */
	readonly date: GeneratedCompactScalarFieldBuilderMethod<
		string,
		DateFieldOptions,
		'autoNow',
		true
	>
	/**
	 * Declares one timestamp.
	 *
	 * @example `field.dateTime('publishedAt')`
	 */
	readonly dateTime: GeneratedCompactScalarFieldBuilderMethod<
		string,
		DateTimeFieldOptions,
		'autoNow',
		true
	>
	/**
	 * Declares one time of day.
	 *
	 * @example `field.time('opensAt')`
	 */
	readonly time: GeneratedCompactScalarFieldBuilderMethod<
		string,
		TimeFieldOptions,
		'autoNow',
		true
	>
	/**
	 * Declares immutable binary data.
	 *
	 * @example `field.binary('content')`
	 */
	readonly binary: CompactScalarFieldBuilderMethod<
		Uint8Array,
		BinaryFieldOptions
	>
	/**
	 * Declares one arbitrary JSON document.
	 *
	 * @example `field.json('metadata')`
	 */
	readonly json: CompactScalarFieldBuilderMethod<JsonDocument, JsonFieldOptions>
	/**
	 * Declares one closed string domain.
	 *
	 * @example `field.enum('status', { values: ['draft', 'published'] })`
	 */
	readonly enum: EnumFieldBuilderMethod
	/**
	 * Declares one embedded structured value.
	 *
	 * @example `field.object('profile', { fields(field) { field.string('name') } })`
	 */
	readonly object: (
		/** Stable logical field name within its containing schema or object. */
		name: string,
		/** Existing object options with a restricted nested declaration. */
		options: ObjectFieldBuilderOptions,
	) => void
}

/** Collects top-level Core fields during application static compilation. */
export interface FieldBuilder extends ScalarFieldBuilderMethods {
	/**
	 * Declares one safe integer.
	 *
	 * @example `field.int('views', { default: 0 })`
	 */
	readonly int: GeneratedCompactScalarFieldBuilderMethod<
		number,
		IntFieldOptions,
		'autoIncrement',
		false
	>
	/**
	 * Declares one native bigint.
	 *
	 * @example `field.bigint('sequence')`
	 */
	readonly bigint: GeneratedCompactScalarFieldBuilderMethod<
		bigint,
		BigintFieldOptions,
		'autoIncrement',
		false
	>
	/**
	 * Declares one exact lazy reference.
	 *
	 * @example `field.pointer('author', { target: () => User })`
	 */
	readonly pointer: PointerFieldBuilderMethod
	/**
	 * Declares one independently queryable to-many relationship.
	 *
	 * @example `field.relation('posts', { target: () => Post })`
	 */
	readonly relation: <
		const TTarget extends SchemaDefinition,
		const TMappedBy extends RelationMappedFieldName<TTarget> | undefined =
			undefined,
	>(
		/** Stable logical field name within the containing schema. */
		name: string,
		/** Declares the exact lazy target and relation behavior. */
		options: RelationFieldOptions<TTarget, TMappedBy>,
	) => void
	/**
	 * Adds one prebuilt low-level field definition.
	 *
	 * @example `field.add('slug', reusableSlugField)`
	 */
	readonly add: (
		/** Stable logical field name within the containing schema. */
		name: string,
		/** Immutable definition returned by a low-level field factory. */
		field: GenericField,
	) => void
}

/** Collects only value fields supported inside one embedded object. */
export interface EmbeddedFieldBuilder extends ScalarFieldBuilderMethods {
	/**
	 * Declares an embedded integer without database-generated sequences.
	 *
	 * @example `field.int('count')`
	 */
	readonly int: CompactScalarFieldBuilderMethod<number, EmbeddedIntFieldOptions>
	/**
	 * Declares an embedded bigint without database-generated sequences.
	 *
	 * @example `field.bigint('count')`
	 */
	readonly bigint: CompactScalarFieldBuilderMethod<
		bigint,
		EmbeddedBigintFieldOptions
	>
	/**
	 * Adds one prebuilt value field after enforcing embedded-field restrictions.
	 *
	 * @example `field.add('slug', reusableSlugField)`
	 */
	readonly add: <const TField extends GenericField>(
		/** Stable logical field name within the containing object. */
		name: string,
		/** Prebuilt value field accepted by embedded-object restrictions. */
		field: EmbeddableField<TField>,
	) => void
}

/** Names the canonical Nexus-style schema field callback. */
export type SchemaFieldBuilderDeclaration = (field: FieldBuilder) => void

type UnknownCallable = (...arguments_: readonly unknown[]) => unknown

const isUnknownCallable = (value: unknown): value is UnknownCallable =>
	typeof value === 'function'

const invokeFieldFactory = (
	factory: unknown,
	options: unknown,
	path: string,
): GenericField => {
	if (!isUnknownCallable(factory)) {
		throw new TypeError(`${path} field factory must be a function`)
	}

	const field = factory(options)

	assertFieldDefinition(field, path)

	return field
}

interface FieldCollector {
	readonly builder: FieldBuilder | EmbeddedFieldBuilder
	readonly size: () => number
	readonly snapshot: () => SchemaFields
}

const createFieldCollector = (
	rootPath: string,
	embedded: boolean,
): FieldCollector => {
	const fields = new Map<string, GenericField>()
	const declareField = (nameValue: unknown, field: unknown): void => {
		assertNonEmptyString(nameValue, `${rootPath} field name`)
		const path = `${rootPath}.${nameValue}`

		if (fields.has(nameValue)) {
			throw new TypeError(`Duplicate field declaration: ${path}`)
		}

		assertFieldDefinition(field, path)
		fields.set(nameValue, field)
	}
	const fromFactory = (
		name: string,
		factory: unknown,
		options: unknown,
	): void => {
		const path = `${rootPath}.${name}`

		declareField(name, invokeFieldFactory(factory, options, path))
	}
	const add = (name: string, field: GenericField): void => {
		declareField(name, field)
	}
	const object = (name: string, optionsValue: unknown): void => {
		const path = `${rootPath}.${name}`

		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(`${path} options must be a plain object`)
		}

		const { fields: declaration, ...options } = optionsValue

		if (typeof declaration !== 'function') {
			throw new TypeError(`${path}.fields must be a function`)
		}

		const nestedFields = executeFieldBuilderCallback(
			declaration,
			`${path}.fields`,
			true,
		)

		fromFactory(name, objectField, { ...options, fields: nestedFields })
	}
	const enumMethod: EnumFieldBuilderMethod = (
		name,
		options,
		...invalidOptions: readonly never[]
	) => {
		void invalidOptions
		fromFactory(name, enumField, options)
	}
	const scalarMethods: ScalarFieldBuilderMethods = {
		binary: (name, options) => {
			fromFactory(name, binaryField, options)
		},
		boolean: (name, options) => {
			fromFactory(name, booleanField, options)
		},
		date: (name, options) => {
			fromFactory(name, dateField, options)
		},
		dateTime: (name, options) => {
			fromFactory(name, dateTimeField, options)
		},
		decimal: (name, options) => {
			fromFactory(name, decimalField, options)
		},
		enum: enumMethod,
		float: (name, options) => {
			fromFactory(name, floatField, options)
		},
		json: (name, options) => {
			fromFactory(name, jsonField, options)
		},
		object,
		string: (name, options) => {
			fromFactory(name, stringField, options)
		},
		time: (name, options) => {
			fromFactory(name, timeField, options)
		},
		uuid: (name, options) => {
			fromFactory(name, uuidField, options)
		},
	}

	if (embedded) {
		const builder: EmbeddedFieldBuilder = immutableRecord({
			...scalarMethods,
			add,
			bigint: (name, options) => {
				fromFactory(name, bigintField, options)
			},
			int: (name, options) => {
				fromFactory(name, intField, options)
			},
		})

		return {
			builder,
			size: () => fields.size,
			snapshot: () => immutableRecord(Object.fromEntries(fields)),
		}
	}

	const pointer: PointerFieldBuilderMethod = (
		name,
		options,
		...invalidOptions: readonly never[]
	) => {
		void invalidOptions
		fromFactory(name, pointerField, options)
	}
	const relation: FieldBuilder['relation'] = (name, options) => {
		fromFactory(name, relationField, options)
	}
	const builder: FieldBuilder = immutableRecord({
		...scalarMethods,
		add,
		bigint: (name, options) => {
			fromFactory(name, bigintField, options)
		},
		int: (name, options) => {
			fromFactory(name, intField, options)
		},
		pointer,
		relation,
	})

	return {
		builder,
		size: () => fields.size,
		snapshot: () => immutableRecord(Object.fromEntries(fields)),
	}
}

/** Executes one root or nested builder callback and snapshots its collected map. */
export const executeFieldBuilderCallback = (
	declaration: unknown,
	path: string,
	embedded = false,
): SchemaFields => {
	if (!isUnknownCallable(declaration)) {
		throw new TypeError(`${path} must be a function`)
	}

	const collector = createFieldCollector(path, embedded)
	const returned = declaration(collector.builder)

	if (returned !== undefined) {
		throw new TypeError(`${path} must not return a value`)
	}

	return collector.snapshot()
}

/** Executes either the migration callback or the canonical builder declaration. */
export const executeSchemaFieldsCallback = (
	declaration: unknown,
	path: string,
): unknown => {
	if (!isUnknownCallable(declaration)) {
		throw new TypeError(`${path} must be a function`)
	}

	const collector = createFieldCollector(path, false)
	const returned = declaration(collector.builder)

	if (returned === undefined) {
		return collector.snapshot()
	}

	if (collector.size() > 0) {
		throw new TypeError(
			`${path} cannot combine FieldBuilder methods with a returned field map`,
		)
	}

	return returned
}
