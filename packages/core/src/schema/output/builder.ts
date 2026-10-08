import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	assertExactPlainObject,
	assertPlainObject,
} from '../../exact-object-validation.js'
import { createCapturedBuilderCallRegistry } from '../captured-builder-call.js'

import type { GenericField } from '../fields/base/contract.js'
import type { FieldBuilderMethodResolver } from '../schema/field-builder-methods.js'
import { snapshotCapturedFieldOptions } from '../schema/captured-options.js'
import { snapshotScalarFieldValue } from '../fields/base/definition.js'
import { bigintField } from '../fields/builtins/bigint.js'
import { binaryField } from '../fields/builtins/binary.js'
import { booleanField } from '../fields/builtins/boolean.js'
import { dateTimeField } from '../fields/builtins/date-time.js'
import { dateField } from '../fields/builtins/date.js'
import { decimalField } from '../fields/builtins/decimal.js'
import { enumField, type EnumValues } from '../fields/builtins/enum.js'
import { floatField } from '../fields/builtins/float.js'
import { intField } from '../fields/builtins/int.js'
import { jsonField } from '../fields/builtins/json.js'
import { stringField } from '../fields/builtins/string.js'
import { timeField } from '../fields/builtins/time.js'
import { uuidField } from '../fields/builtins/uuid.js'
import { validateScalarFieldShape } from '../plans/scalar-shape-validation.js'
import type {
	GenericOutputDescriptor,
	NormalizedOutputValueOptions,
	OutputBuilder,
	OutputFields,
	OutputKind,
} from './contracts.js'
import {
	assertOutputDescriptor,
	createOutputDescriptor,
	snapshotOutputValue,
} from './descriptor.js'

/*
 * Output declarations run in two stages. Schema declaration executes the developer
 * callback once against a capturing builder that records callback-free method calls;
 * application compilation later resolves those calls against the installed plugin
 * methods, producing provenance-checked descriptors.
 */

const outputKinds = [
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
] as const satisfies readonly OutputKind[]

const commonOptionNames = ['description', 'list', 'nullable'] as const

const [createCapturedOutputBuilderCall, isCapturedOutputBuilderCall] =
	createCapturedBuilderCallRegistry<GenericOutputDescriptor>()

/** Identifies a delayed output method whose owning plugin is not installed. */
export class OutputBuilderMethodUnavailableError extends TypeError {}

/** Validates each property name of one output map and maps its values in order. */
const mapOutputFields = <TValue>(
	fields: Readonly<Record<string, unknown>>,
	path: string,
	mapValue: (value: unknown, path: string) => TValue,
): Readonly<Record<string, TValue>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(fields).map(([name, value]) => {
				assertNonEmptyString(name, `${path} property name`)
				return [name, mapValue(value, `${path}.${name}`)]
			}),
		),
	)

const createCapturedOutputBuilder = (path: string): OutputBuilder => {
	const method =
		(methodName: string) =>
		(options?: unknown): GenericOutputDescriptor =>
			createCapturedOutputBuilderCall(
				methodName,
				snapshotCapturedFieldOptions(options),
			)
	// Nested object properties are captured eagerly because they are callbacks too.
	const object = (optionsValue: unknown): GenericOutputDescriptor => {
		assertPlainObject(
			optionsValue,
			`${path}.object options must be a plain object`,
		)

		const { fields: declaration, ...options } = optionsValue
		const fieldsPath = `${path}.object.fields`
		if (typeof declaration !== 'function') {
			throw new TypeError(`${fieldsPath} must be a function`)
		}

		const returned: unknown = (
			declaration as (output: OutputBuilder) => unknown
		)(createCapturedOutputBuilder(fieldsPath))
		assertPlainObject(
			returned,
			`${fieldsPath} must return an output descriptor map`,
		)

		const fields = mapOutputFields(
			returned,
			fieldsPath,
			(descriptor, descriptorPath) => {
				if (!isCapturedOutputBuilderCall(descriptor)) {
					assertOutputDescriptor(descriptor, descriptorPath)
				}
				return descriptor
			},
		)

		return createCapturedOutputBuilderCall(
			'object',
			immutableRecord({
				...(snapshotCapturedFieldOptions(options) as Readonly<
					Record<string, unknown>
				>),
				fields,
			}),
		)
	}
	const known = immutableRecord(
		Object.fromEntries(
			outputKinds.map((kind) => [
				kind,
				kind === 'object' ? object : method(kind),
			]),
		),
	)

	// Any other name is captured as a plugin method and checked during resolution.
	return new Proxy(known, {
		get: (record, property, receiver): unknown =>
			typeof property !== 'string' || Reflect.has(record, property)
				? Reflect.get(record, property, receiver)
				: method(property),
	}) as unknown as OutputBuilder
}

interface NormalizedOutputOptionsInput {
	readonly options: Readonly<Record<string, unknown>>
	readonly common: NormalizedOutputValueOptions
}

const normalizeOutputOptions = (
	value: unknown,
	path: string,
	specificOptionNames: readonly string[] = [],
): NormalizedOutputOptionsInput => {
	const options = value === undefined ? immutableRecord({}) : value
	assertExactPlainObject(
		options,
		new Set<string>([...commonOptionNames, ...specificOptionNames]),
		`${path} options must be a plain object`,
		`${path} does not support output option `,
	)

	const { description, list = false, nullable = true } = options
	if (typeof nullable !== 'boolean') {
		throw new TypeError(`${path}.nullable must be a boolean`)
	}
	if (typeof list !== 'boolean') {
		throw new TypeError(`${path}.list must be a boolean`)
	}
	if (description !== undefined && typeof description !== 'string') {
		throw new TypeError(`${path}.description must be a string`)
	}

	return {
		options,
		common: immutableRecord({
			...(description === undefined ? {} : { description }),
			list,
			nullable,
		}),
	}
}

/** Reuses the stored field's snapshot and shape rules for one scalar output. */
const createScalarOutput = (
	kind: string,
	options: NormalizedOutputValueOptions,
	field: GenericField,
): GenericOutputDescriptor =>
	createOutputDescriptor(kind, options, (value: unknown, path: string) => {
		const snapshot: unknown = snapshotScalarFieldValue(field, value, path)
		const [issue] = validateScalarFieldShape(field, snapshot, [])
		if (issue !== undefined) {
			throw new TypeError(`${path}: ${issue.message}`)
		}

		return snapshot
	})

/** Creates the stored field behind one scalar output without representation options. */
const createSimpleScalarField = (kind: string): GenericField | undefined => {
	switch (kind) {
		case 'bigint':
			return bigintField()
		case 'binary':
			return binaryField()
		case 'boolean':
			return booleanField()
		case 'date':
			return dateField()
		case 'float':
			return floatField()
		case 'int':
			return intField()
		case 'json':
			return jsonField()
		case 'string':
			return stringField()
		case 'uuid':
			return uuidField()
		default:
			return undefined
	}
}

const snapshotObjectElement =
	(fields: OutputFields) =>
	(value: unknown, path: string): Readonly<Record<string, unknown>> => {
		assertPlainObject(value, `${path} must be a plain object`)

		for (const key of Object.keys(value)) {
			if (!Object.hasOwn(fields, key)) {
				throw new TypeError(`${path}.${key} is not a declared output property`)
			}
		}

		const entries: [string, unknown][] = []
		for (const [name, descriptor] of Object.entries(fields)) {
			if (!Object.hasOwn(value, name)) {
				throw new TypeError(`${path}.${name} is required`)
			}

			entries.push([
				name,
				snapshotOutputValue(descriptor, value[name], `${path}.${name}`),
			])
		}

		return immutableRecord(Object.fromEntries(entries))
	}

/** Resolves one captured core or plugin method call with its captured options. */
const resolveOutputCall = (
	methodName: string,
	value: unknown,
	path: string,
	fieldMethods: FieldBuilderMethodResolver | undefined,
): GenericOutputDescriptor => {
	const methodPath = `${path}.${methodName}`

	if (methodName === 'decimal') {
		const { common, options } = normalizeOutputOptions(value, methodPath, [
			'precision',
			'scale',
		])
		const field = decimalField({
			...(options.precision === undefined
				? {}
				: { precision: options.precision as number }),
			...(options.scale === undefined
				? {}
				: { scale: options.scale as number }),
		})
		const descriptorOptions = immutableRecord({
			...common,
			...(field.options.precision === undefined
				? {}
				: { precision: field.options.precision }),
			...(field.options.scale === undefined
				? {}
				: { scale: field.options.scale }),
		})

		return createScalarOutput('decimal', descriptorOptions, field)
	}

	if (methodName === 'dateTime' || methodName === 'time') {
		const { common, options } = normalizeOutputOptions(value, methodPath, [
			'timezone',
		])
		const { timezone } = options
		const fieldOptions =
			timezone === undefined ? {} : { timezone: timezone as boolean }
		const field =
			methodName === 'dateTime'
				? dateTimeField(fieldOptions)
				: timeField(fieldOptions)
		const descriptorOptions = immutableRecord({
			...common,
			timezone: timezone ?? methodName === 'dateTime',
		})

		return createScalarOutput(methodName, descriptorOptions, field)
	}

	if (methodName === 'enum') {
		const { common, options } = normalizeOutputOptions(value, methodPath, [
			'typeName',
			'values',
		])
		const field = enumField({
			...(options.typeName === undefined
				? {}
				: { typeName: options.typeName as string }),
			values: options.values as EnumValues,
		})
		const declaredValues = field.options.values
		const acceptedValues = Array.isArray(declaredValues)
			? declaredValues
			: Object.values(declaredValues)
		const descriptorOptions = immutableRecord({
			...common,
			...(field.options.typeName === undefined
				? {}
				: { typeName: field.options.typeName }),
			values: declaredValues,
		})

		return createOutputDescriptor(
			'enum',
			descriptorOptions,
			(element: unknown, elementPath: string): string => {
				if (typeof element !== 'string' || !acceptedValues.includes(element)) {
					throw new TypeError(`${elementPath} must be a declared enum value`)
				}

				return element
			},
		)
	}

	if (methodName === 'object') {
		const { common, options } = normalizeOutputOptions(value, methodPath, [
			'fields',
			'typeName',
		])
		const { typeName } = options
		if (
			typeName !== undefined &&
			(typeof typeName !== 'string' || typeName.length === 0)
		) {
			throw new TypeError(`${path}.object.typeName must be a non-empty string`)
		}
		const fields = resolveCapturedOutputFields(
			options.fields,
			`${path}.fields`,
			fieldMethods,
		)
		const descriptorOptions = immutableRecord({
			...common,
			fields,
			...(typeName === undefined ? {} : { typeName }),
		})

		return createOutputDescriptor(
			'object',
			descriptorOptions,
			snapshotObjectElement(fields),
		)
	}

	const simpleField = createSimpleScalarField(methodName)
	if (simpleField !== undefined) {
		const { common } = normalizeOutputOptions(value, methodPath)
		return createScalarOutput(methodName, common, simpleField)
	}

	const method = fieldMethods?.get(methodName)
	if (method === undefined) {
		throw new TypeError(
			`${path} OutputBuilder method "${methodName}" is unavailable; configure the plugin that declares it`,
		)
	}

	const implementation = method.contexts.output
	if (implementation === undefined) {
		throw new TypeError(
			`${path} OutputBuilder method "${methodName}" from "${method.owner}" does not support the output context`,
		)
	}

	const returned: unknown = (
		implementation.factory as (options: unknown) => unknown
	)(value)
	assertOutputDescriptor(returned, methodPath)
	if (returned.kind !== implementation.fieldKind) {
		throw new TypeError(
			`${path} OutputBuilder method "${methodName}" from "${method.owner}" returned kind "${returned.kind}" instead of "${implementation.fieldKind}"`,
		)
	}
	return returned
}

const resolveCapturedOutputFields = (
	captured: unknown,
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
): OutputFields => {
	assertPlainObject(captured, `${path} must be an output descriptor map`)

	return mapOutputFields(captured, path, (descriptor, descriptorPath) =>
		resolveCapturedOutputDescriptor(descriptor, descriptorPath, fieldMethods),
	)
}

/** Resolves one callback-free captured output declaration for an application. */
export const resolveCapturedOutputDescriptor = (
	captured: unknown,
	path: string,
	fieldMethods?: FieldBuilderMethodResolver,
): GenericOutputDescriptor => {
	if (!isCapturedOutputBuilderCall(captured)) {
		assertOutputDescriptor(captured, path)
		return captured
	}

	try {
		return resolveOutputCall(
			captured.methodName,
			captured.options,
			path,
			fieldMethods,
		)
	} catch (cause: unknown) {
		// Missing plugin methods, including nested ones, surface as one recognizable class.
		if (
			cause instanceof TypeError &&
			cause.message.includes('is unavailable; configure the plugin')
		) {
			throw new OutputBuilderMethodUnavailableError(cause.message, { cause })
		}
		throw cause
	}
}

/** Executes an output callback exactly once and retains only captured declarations. */
export const captureOutputBuilderCallback = (
	declaration: unknown,
	path: string,
): unknown => {
	if (typeof declaration !== 'function') {
		throw new TypeError(`${path} must be an output callback`)
	}

	return (declaration as (output: OutputBuilder) => unknown)(
		createCapturedOutputBuilder(path),
	)
}
