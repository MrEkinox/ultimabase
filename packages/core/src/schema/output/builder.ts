import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
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

const commonOptionNames = ['description', 'list', 'nullable'] as const

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
	if (!isPlainRecord(options)) {
		throw new TypeError(`${path} options must be a plain object`)
	}

	const allowed = new Set<string>([
		...commonOptionNames,
		...specificOptionNames,
	])
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !allowed.has(key)) {
			throw new TypeError(
				`${path} does not support output option ${String(key)}`,
			)
		}
	}

	const nullable: unknown = Reflect.get(options, 'nullable')
	if (nullable !== undefined && typeof nullable !== 'boolean') {
		throw new TypeError(`${path}.nullable must be a boolean`)
	}

	const list: unknown = Reflect.get(options, 'list')
	if (list !== undefined && typeof list !== 'boolean') {
		throw new TypeError(`${path}.list must be a boolean`)
	}

	const description: unknown = Reflect.get(options, 'description')
	if (description !== undefined && typeof description !== 'string') {
		throw new TypeError(`${path}.description must be a string`)
	}

	return {
		options,
		common: immutableRecord({
			...(description === undefined ? {} : { description }),
			list: list ?? false,
			nullable: nullable ?? true,
		}),
	}
}

const createScalarSnapshot =
	(field: GenericField) =>
	(value: unknown, path: string): unknown => {
		const snapshot: unknown = snapshotScalarFieldValue(field, value, path)
		const [issue] = validateScalarFieldShape(field, snapshot, [])
		if (issue !== undefined) {
			throw new TypeError(`${path}: ${issue.message}`)
		}

		return snapshot
	}

const createScalarOutput = (
	kind: Exclude<OutputKind, 'enum' | 'object'>,
	options: NormalizedOutputValueOptions,
	field: GenericField,
): GenericOutputDescriptor =>
	createOutputDescriptor(kind, options, createScalarSnapshot(field))

const createSimpleScalarMethod =
	(
		kind: Exclude<
			OutputKind,
			'dateTime' | 'decimal' | 'enum' | 'object' | 'time'
		>,
		field: GenericField,
		path: string,
	) =>
	(options?: unknown): GenericOutputDescriptor => {
		const normalized = normalizeOutputOptions(options, `${path}.${kind}`)

		return createScalarOutput(kind, normalized.common, field)
	}

const snapshotObjectElement =
	(fields: OutputFields) =>
	(value: unknown, path: string): Readonly<Record<string, unknown>> => {
		if (!isPlainRecord(value)) {
			throw new TypeError(`${path} must be a plain object`)
		}

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

const resolveOutputFields = (
	declaration: unknown,
	path: string,
): OutputFields => {
	if (typeof declaration !== 'function') {
		throw new TypeError(`${path} must be a function`)
	}

	const resolveFields = declaration as (output: OutputBuilder) => unknown
	const fields: unknown = resolveFields(createOutputBuilder(path))
	if (!isPlainRecord(fields)) {
		throw new TypeError(`${path} must return an output descriptor map`)
	}

	const entries: [string, GenericOutputDescriptor][] = []
	for (const [name, descriptor] of Object.entries(fields)) {
		assertNonEmptyString(name, `${path} property name`)
		assertOutputDescriptor(descriptor, `${path}.${name}`)
		entries.push([name, descriptor])
	}

	return immutableRecord(Object.fromEntries(entries))
}

const createOutputBuilder = (path: string): OutputBuilder => {
	const decimal = (options?: unknown): GenericOutputDescriptor => {
		const normalized = normalizeOutputOptions(options, `${path}.decimal`, [
			'precision',
			'scale',
		])
		const precision: unknown = Reflect.get(normalized.options, 'precision')
		const scale: unknown = Reflect.get(normalized.options, 'scale')
		const field = decimalField({
			...(precision === undefined ? {} : { precision: precision as number }),
			...(scale === undefined ? {} : { scale: scale as number }),
		})
		const descriptorOptions = immutableRecord({
			...normalized.common,
			...(field.options.precision === undefined
				? {}
				: { precision: field.options.precision }),
			...(field.options.scale === undefined
				? {}
				: { scale: field.options.scale }),
		})

		return createScalarOutput('decimal', descriptorOptions, field)
	}

	const temporal = (
		kind: 'dateTime' | 'time',
		options?: unknown,
	): GenericOutputDescriptor => {
		const normalized = normalizeOutputOptions(options, `${path}.${kind}`, [
			'timezone',
		])
		const timezone: unknown = Reflect.get(normalized.options, 'timezone')
		const fieldOptions =
			timezone === undefined ? {} : { timezone: timezone as boolean }
		const field =
			kind === 'dateTime'
				? dateTimeField(fieldOptions)
				: timeField(fieldOptions)
		const descriptorOptions = immutableRecord({
			...normalized.common,
			timezone: timezone ?? kind === 'dateTime',
		})

		return createScalarOutput(kind, descriptorOptions, field)
	}

	const enumOutput = (options: unknown): GenericOutputDescriptor => {
		const normalized = normalizeOutputOptions(options, `${path}.enum`, [
			'typeName',
			'values',
		])
		const values: unknown = Reflect.get(normalized.options, 'values')
		const typeName: unknown = Reflect.get(normalized.options, 'typeName')
		const field = enumField({
			...(typeName === undefined ? {} : { typeName: typeName as string }),
			values: values as EnumValues,
		})
		const declaredValues = field.options.values
		const acceptedValues = Array.isArray(declaredValues)
			? declaredValues
			: Object.values(declaredValues)
		const snapshotEnum = (value: unknown, valuePath: string): string => {
			if (typeof value !== 'string' || !acceptedValues.includes(value)) {
				throw new TypeError(`${valuePath} must be a declared enum value`)
			}

			return value
		}
		const descriptorOptions = immutableRecord({
			...normalized.common,
			...(field.options.typeName === undefined
				? {}
				: { typeName: field.options.typeName }),
			values: declaredValues,
		})

		return createOutputDescriptor('enum', descriptorOptions, snapshotEnum)
	}

	const object = (options: unknown): GenericOutputDescriptor => {
		const normalized = normalizeOutputOptions(options, `${path}.object`, [
			'fields',
			'typeName',
		])
		const typeName: unknown = Reflect.get(normalized.options, 'typeName')
		if (
			typeName !== undefined &&
			(typeof typeName !== 'string' || typeName.length === 0)
		) {
			throw new TypeError(`${path}.object.typeName must be a non-empty string`)
		}
		const fields = resolveOutputFields(
			Reflect.get(normalized.options, 'fields'),
			`${path}.object.fields`,
		)
		const descriptorOptions = immutableRecord({
			...normalized.common,
			fields,
			...(typeName === undefined ? {} : { typeName }),
		})

		return createOutputDescriptor(
			'object',
			descriptorOptions,
			snapshotObjectElement(fields),
		)
	}

	const builder = immutableRecord({
		bigint: createSimpleScalarMethod('bigint', bigintField(), path),
		binary: createSimpleScalarMethod('binary', binaryField(), path),
		boolean: createSimpleScalarMethod('boolean', booleanField(), path),
		date: createSimpleScalarMethod('date', dateField(), path),
		dateTime: (options?: unknown) => temporal('dateTime', options),
		decimal,
		enum: enumOutput,
		float: createSimpleScalarMethod('float', floatField(), path),
		int: createSimpleScalarMethod('int', intField(), path),
		json: createSimpleScalarMethod('json', jsonField(), path),
		object,
		string: createSimpleScalarMethod('string', stringField(), path),
		time: (options?: unknown) => temporal('time', options),
		uuid: createSimpleScalarMethod('uuid', uuidField(), path),
	})

	return builder as unknown as OutputBuilder
}

/** @internal Resolves one output callback exactly once for virtual compilation. */
export const resolveOutputBuilder = <
	const TOutput extends GenericOutputDescriptor,
>(
	declaration: (output: OutputBuilder) => TOutput,
	path: string,
): TOutput => {
	if (typeof declaration !== 'function') {
		throw new TypeError(`${path} must be an output callback`)
	}

	const descriptor = declaration(createOutputBuilder(path))
	assertOutputDescriptor(descriptor, path)

	return descriptor
}
