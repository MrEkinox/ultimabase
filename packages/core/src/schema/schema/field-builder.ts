import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	bigintField,
	type BigintFieldOptions,
} from '../fields/builtins/bigint.js'
import { binaryField } from '../fields/builtins/binary.js'
import { booleanField } from '../fields/builtins/boolean.js'
import { dateField } from '../fields/builtins/date.js'
import { dateTimeField } from '../fields/builtins/date-time.js'
import { decimalField } from '../fields/builtins/decimal.js'
import { enumField } from '../fields/builtins/enum.js'
import { floatField } from '../fields/builtins/float.js'
import { intField, type IntFieldOptions } from '../fields/builtins/int.js'
import { jsonField } from '../fields/builtins/json.js'
import {
	objectField,
	type ObjectFieldOptions,
	type ObjectFields,
} from '../fields/builtins/object.js'
import {
	pointerField,
	type NamedPointerFieldBuilderMethod,
} from '../fields/builtins/pointer.js'
import {
	relationField,
	type NamedRelationFieldBuilderMethod,
} from '../fields/builtins/relation.js'
import { stringField } from '../fields/builtins/string.js'
import { timeField } from '../fields/builtins/time.js'
import { uuidField } from '../fields/builtins/uuid.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import type { CompactScalarFieldFactory } from '../fields/base/factory.js'
import type { SchemaDefinition, SchemaFields } from './definition.js'
import { createNamedSchemaTarget } from './targets.js'
import type {
	UltimaBaseGeneratedEmbeddedFieldBuilderMethods,
	UltimaBaseGeneratedFieldBuilderMethods,
} from '../type-info.js'
import type {
	FieldBuilderMethodResolver,
	OwnedFieldBuilderMethod,
} from './field-builder-methods.js'
import type { ObjectFieldBuilderMethod } from './object-field-builder.js'

type EmbeddedIntFieldOptions = Omit<IntFieldOptions, 'autoIncrement'> & {
	readonly autoIncrement?: false
}

type EmbeddedBigintFieldOptions = Omit<BigintFieldOptions, 'autoIncrement'> & {
	readonly autoIncrement?: false
}

type EmbeddedIntFieldFactory = CompactScalarFieldFactory<
	'int',
	number,
	EmbeddedIntFieldOptions
>

type EmbeddedBigintFieldFactory = CompactScalarFieldFactory<
	'bigint',
	bigint,
	EmbeddedBigintFieldOptions
>

/** Declares nested fields through the same map-returning shape as a schema. */
export type ObjectFieldBuilderOptions<
	TFields extends ObjectFields = ObjectFields,
> = Omit<ObjectFieldOptions<TFields>, 'fields'> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

interface ScalarFieldBuilderMethods {
	/**
	 * Declares one UTF-16 string.
	 * @example `field.string({ required: true })`
	 */
	readonly string: typeof stringField
	/**
	 * Declares one boolean.
	 * @example `field.boolean({ default: false })`
	 */
	readonly boolean: typeof booleanField
	/**
	 * Declares one floating-point number.
	 * @example `field.float()`
	 */
	readonly float: typeof floatField
	/**
	 * Declares one exact decimal string.
	 * @example `field.decimal()`
	 */
	readonly decimal: typeof decimalField
	/**
	 * Declares one UUID string.
	 * @example `field.uuid()`
	 */
	readonly uuid: typeof uuidField
	/**
	 * Declares one calendar date.
	 * @example `field.date()`
	 */
	readonly date: typeof dateField
	/**
	 * Declares one timestamp.
	 * @example `field.dateTime()`
	 */
	readonly dateTime: typeof dateTimeField
	/**
	 * Declares one time of day.
	 * @example `field.time()`
	 */
	readonly time: typeof timeField
	/**
	 * Declares immutable binary data.
	 * @example `field.binary()`
	 */
	readonly binary: typeof binaryField
	/**
	 * Declares one arbitrary JSON document.
	 * @example `field.json()`
	 */
	readonly json: typeof jsonField
	/**
	 * Declares one closed string domain.
	 * @example `field.enum({ values: ['draft', 'published'] })`
	 */
	readonly enum: typeof enumField
	/**
	 * Declares one embedded structured value.
	 * @example `field.object({ fields: (nested) => ({ label: nested.string() }) })`
	 */
	readonly object: ObjectFieldBuilderMethod
}

/** Provides top-level factories while the returned object owns field names. */
export interface FieldBuilder
	extends ScalarFieldBuilderMethods, UltimaBaseGeneratedFieldBuilderMethods {
	/**
	 * Declares one integer number.
	 * @example `field.int({ default: 0 })`
	 */
	readonly int: typeof intField
	/**
	 * Declares one arbitrary-precision integer.
	 * @example `field.bigint()`
	 */
	readonly bigint: typeof bigintField
	/**
	 * Declares one typed pointer to another schema.
	 * @example `field.pointer({ target: "User" })`
	 */
	readonly pointer: NamedPointerFieldBuilderMethod
	/**
	 * Declares one inverse to-many relationship.
	 * @example `field.relation({ target: "Post", mappedBy: 'author' })`
	 */
	readonly relation: NamedRelationFieldBuilderMethod
}

/** Provides only value-field factories accepted inside an embedded object. */
export interface EmbeddedFieldBuilder
	extends
		ScalarFieldBuilderMethods,
		UltimaBaseGeneratedEmbeddedFieldBuilderMethods {
	/**
	 * Declares one embedded integer number.
	 * @example `field.int()`
	 */
	readonly int: EmbeddedIntFieldFactory
	/**
	 * Declares one embedded arbitrary-precision integer.
	 * @example `field.bigint()`
	 */
	readonly bigint: EmbeddedBigintFieldFactory
}

/** Names the canonical map-returning schema field declaration. */
export type SchemaFieldBuilderDeclaration<
	TFields extends SchemaFields = SchemaFields,
> = (field: FieldBuilder) => TFields

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

type RuntimeFieldBuilderMethod = (options?: unknown) => GenericField

interface CapturedFieldBuilderCall {
	readonly methodName: string
	readonly options: unknown
}

const capturedFieldBuilderCalls = new WeakSet<object>()

/** Identifies the one expected failure when an application omitted a used field plugin. */
export class FieldBuilderMethodUnavailableError extends TypeError {}

/** Defers named relationship materialization until an application registry exists. */
export class FieldBuilderTargetUnavailableError extends TypeError {}

/** Resolves one declared target name against the current application registry. */
export type FieldBuilderTargetResolver = (
	className: string,
) => SchemaDefinition | undefined

/** Separates developer callback failures from validation of its returned map. */
export class FieldBuilderDeclarationExecutionError extends Error {
	constructor(cause: unknown) {
		super('FieldBuilder declaration threw', { cause })
		this.name = 'FieldBuilderDeclarationExecutionError'
	}
}

/** Detaches delayed plugin options from caller-owned plain data. */
export const snapshotCapturedOptionValue = (value: unknown): unknown => {
	if (isUnknownArray(value)) {
		return immutableArray(value.map(snapshotCapturedOptionValue))
	}

	if (value instanceof Date) {
		return Object.freeze(new Date(value.getTime()))
	}

	if (value instanceof RegExp) {
		return Object.freeze(new RegExp(value.source, value.flags))
	}

	if (!isPlainRecord(value)) {
		return value
	}

	const snapshot: Record<string, unknown> = {}

	for (const [key, nestedValue] of Object.entries(value)) {
		snapshot[key] = snapshotCapturedOptionValue(nestedValue)
	}

	return immutableRecord(snapshot)
}

const createCapturedFieldBuilderCall = (
	methodName: string,
	options: unknown,
): GenericField => {
	const call = immutableRecord({ methodName, options })

	capturedFieldBuilderCalls.add(call)

	// The public builder method retains its concrete return type while compilation
	// privately replaces this opaque declaration with the plugin's real field.
	return call as unknown as GenericField
}

const isCapturedFieldBuilderCall = (
	value: unknown,
): value is CapturedFieldBuilderCall =>
	typeof value === 'object' &&
	value !== null &&
	capturedFieldBuilderCalls.has(value)

const createRuntimeBuilder = <TBuilder extends object>(
	builder: TBuilder,
	pluginMethods: Readonly<Record<string, RuntimeFieldBuilderMethod>>,
	path: string,
	embedded: boolean,
): TBuilder => {
	const target = immutableRecord({ ...builder, ...pluginMethods })

	return new Proxy(target, {
		get: (record, property, receiver): unknown => {
			if (typeof property !== 'string' || Reflect.has(record, property)) {
				return Reflect.get(record, property, receiver)
			}

			if (embedded && (property === 'pointer' || property === 'relation')) {
				return undefined
			}

			return (): never => {
				throw new FieldBuilderMethodUnavailableError(
					`${path} FieldBuilder method "${property}" is unavailable; configure the plugin that declares it`,
				)
			}
		},
	})
}

const createCapturedObjectMethod = (path: string): ObjectFieldBuilderMethod => {
	const method = (optionsValue: unknown): GenericField => {
		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(`${path}.object options must be a plain object`)
		}

		const { fields: declaration, ...options } = optionsValue
		const fields = captureFieldBuilderCallback(
			declaration,
			`${path}.object.fields`,
			true,
		)

		return createCapturedFieldBuilderCall(
			'object',
			immutableRecord({
				...(snapshotCapturedOptionValue(options) as Readonly<
					Record<string, unknown>
				>),
				fields,
			}),
		)
	}

	return method as ObjectFieldBuilderMethod
}

const createCapturedFieldBuilder = (
	path: string,
	embedded: boolean,
): FieldBuilder | EmbeddedFieldBuilder => {
	const method =
		(methodName: string): RuntimeFieldBuilderMethod =>
		(options) =>
			createCapturedFieldBuilderCall(
				methodName,
				snapshotCapturedOptionValue(options),
			)
	const scalarMethods: ScalarFieldBuilderMethods = {
		binary: method('binary') as typeof binaryField,
		boolean: method('boolean') as typeof booleanField,
		date: method('date') as typeof dateField,
		dateTime: method('dateTime') as typeof dateTimeField,
		decimal: method('decimal') as typeof decimalField,
		enum: method('enum') as typeof enumField,
		float: method('float') as typeof floatField,
		json: method('json') as typeof jsonField,
		object: createCapturedObjectMethod(path),
		string: method('string') as typeof stringField,
		time: method('time') as typeof timeField,
		uuid: method('uuid') as typeof uuidField,
	}
	const known = embedded
		? {
				...scalarMethods,
				bigint: method('bigint') as EmbeddedBigintFieldFactory,
				int: method('int') as EmbeddedIntFieldFactory,
			}
		: {
				...scalarMethods,
				bigint: method('bigint') as typeof bigintField,
				int: method('int') as typeof intField,
				pointer: method('pointer') as NamedPointerFieldBuilderMethod,
				relation: method('relation') as NamedRelationFieldBuilderMethod,
			}

	return new Proxy(immutableRecord(known), {
		get: (record, property, receiver): unknown => {
			if (typeof property !== 'string' || Reflect.has(record, property)) {
				return Reflect.get(record, property, receiver)
			}

			if (embedded && (property === 'pointer' || property === 'relation')) {
				return undefined
			}

			return method(property)
		},
	})
}

const createPluginMethods = (
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
): Readonly<Record<string, RuntimeFieldBuilderMethod>> => {
	const methods: Record<string, RuntimeFieldBuilderMethod> = {}

	for (const method of fieldMethods?.values() ?? []) {
		methods[method.name] = (options): GenericField =>
			invokePluginFieldFactory(method, options, path)
	}

	return immutableRecord(methods)
}

const invokePluginFieldFactory = (
	method: OwnedFieldBuilderMethod,
	options: unknown,
	path: string,
): GenericField => {
	const field = invokeFieldFactory(
		method.factory,
		options,
		`${path}.${method.name}`,
	)

	if (field.kind !== method.fieldKind) {
		throw new TypeError(
			`${path} FieldBuilder method "${method.name}" from "${method.owner}" returned kind "${field.kind}" instead of "${method.fieldKind}"`,
		)
	}

	return field
}

const createObjectMethod = (
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
): ObjectFieldBuilderMethod => {
	const method = (optionsValue: unknown): GenericField => {
		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(`${path}.object options must be a plain object`)
		}

		const { fields: declaration, ...options } = optionsValue
		const fields = executeFieldBuilderCallback(
			declaration,
			`${path}.object.fields`,
			true,
			fieldMethods,
		)

		return objectField({ ...options, fields })
	}

	return method as ObjectFieldBuilderMethod
}

const createFieldBuilder = (
	path: string,
	embedded: boolean,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): FieldBuilder | EmbeddedFieldBuilder => {
	const scalarMethods: ScalarFieldBuilderMethods = {
		binary: binaryField,
		boolean: booleanField,
		date: dateField,
		dateTime: dateTimeField,
		decimal: decimalField,
		enum: enumField,
		float: floatField,
		json: jsonField,
		object: createObjectMethod(path, fieldMethods),
		string: stringField,
		time: timeField,
		uuid: uuidField,
	}
	const pluginMethods = createPluginMethods(path, fieldMethods)

	if (embedded) {
		return createRuntimeBuilder<EmbeddedFieldBuilder>(
			{
				...scalarMethods,
				bigint: bigintField as EmbeddedBigintFieldFactory,
				int: intField as EmbeddedIntFieldFactory,
			},
			pluginMethods,
			path,
			true,
		)
	}

	const namedTargetOptions = (
		options: unknown,
	): Readonly<Record<string, unknown>> => {
		if (!isPlainRecord(options)) {
			throw new TypeError(`${path} relationship options must be a plain object`)
		}

		const { target, ...rest } = options

		assertNonEmptyString(target, `${path} target`)

		if (resolveTarget === undefined) {
			throw new FieldBuilderTargetUnavailableError(
				`${path} target requires an application schema registry`,
			)
		}

		return immutableRecord({
			...rest,
			target: createNamedSchemaTarget(target, resolveTarget(target)),
		})
	}
	const namedPointer = ((options: unknown): GenericField =>
		invokeFieldFactory(
			pointerField,
			namedTargetOptions(options),
			`${path}.pointer`,
		)) as NamedPointerFieldBuilderMethod
	const namedRelation = ((options: unknown): GenericField =>
		invokeFieldFactory(
			relationField,
			namedTargetOptions(options),
			`${path}.relation`,
		)) as NamedRelationFieldBuilderMethod

	return createRuntimeBuilder<FieldBuilder>(
		{
			...scalarMethods,
			bigint: bigintField,
			int: intField,
			pointer: namedPointer,
			relation: namedRelation,
		},
		pluginMethods,
		path,
		false,
	)
}

const assertCapturedFieldMap: (
	value: unknown,
	path: string,
) => asserts value is Readonly<Record<string, unknown>> = (value, path) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must return a field map`)
	}

	for (const [name, field] of Object.entries(value)) {
		assertNonEmptyString(name, `${path} field name`)

		if (!isCapturedFieldBuilderCall(field)) {
			assertFieldDefinition(field, `${path}.${name}`)
		}
	}
}

/** Executes one declaration exactly once and snapshots its unresolved field calls. */
export const captureFieldBuilderCallback = (
	declaration: unknown,
	path: string,
	embedded = false,
): Readonly<Record<string, unknown>> => {
	if (!isUnknownCallable(declaration)) {
		throw new TypeError(`${path} must be a function`)
	}

	let returned: unknown

	try {
		returned = declaration(createCapturedFieldBuilder(path, embedded))
	} catch (cause: unknown) {
		throw new FieldBuilderDeclarationExecutionError(cause)
	}

	assertCapturedFieldMap(returned, path)

	return immutableRecord(returned)
}

const resolveCapturedFieldBuilderCall = (
	call: CapturedFieldBuilderCall,
	fieldPath: string,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): GenericField => {
	if (call.methodName === 'object') {
		if (!isPlainRecord(call.options)) {
			throw new TypeError(`${fieldPath}.object options must be a plain object`)
		}

		const { fields: capturedFields, ...options } = call.options
		const fields = resolveCapturedFieldMap(
			capturedFields,
			`${fieldPath}.object.fields`,
			true,
			fieldMethods,
			resolveTarget,
		)

		return invokeFieldFactory(
			objectField,
			{ ...options, fields },
			`${fieldPath}.object`,
		)
	}

	const builder = createFieldBuilder(
		fieldPath,
		false,
		fieldMethods,
		resolveTarget,
	)
	const factory = Reflect.get(builder, call.methodName) as unknown

	return invokeFieldFactory(
		factory,
		call.options,
		`${fieldPath}.${call.methodName}`,
	)
}

/** Materializes one captured map after the application has declared plugin methods. */
export const resolveCapturedFieldMap = (
	captured: unknown,
	path: string,
	embedded = false,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): SchemaFields => {
	assertCapturedFieldMap(captured, path)
	const fields: Record<string, GenericField> = {}

	for (const [name, field] of Object.entries(captured)) {
		if (isCapturedFieldBuilderCall(field)) {
			if (
				embedded &&
				(field.methodName === 'pointer' || field.methodName === 'relation')
			) {
				throw new TypeError(
					`${path}.${name} cannot be a pointer or relation inside objectField`,
				)
			}

			fields[name] = resolveCapturedFieldBuilderCall(
				field,
				`${path}.${name}`,
				fieldMethods,
				resolveTarget,
			)
			continue
		}

		fields[name] = field as GenericField
	}

	return immutableRecord(fields)
}

/** Executes and materializes one declaration for lower-level compatibility callers. */
export const executeFieldBuilderCallback = (
	declaration: unknown,
	path: string,
	embedded = false,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): SchemaFields =>
	resolveCapturedFieldMap(
		captureFieldBuilderCallback(declaration, path, embedded),
		path,
		embedded,
		fieldMethods,
		resolveTarget,
	)

/** Executes the canonical map-returning schema declaration. */
export const executeSchemaFieldsCallback = (
	declaration: unknown,
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): SchemaFields =>
	executeFieldBuilderCallback(
		declaration,
		path,
		false,
		fieldMethods,
		resolveTarget,
	)
