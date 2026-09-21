import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { bigintField } from '../fields/builtins/bigint.js'
import type { binaryField } from '../fields/builtins/binary.js'
import type { booleanField } from '../fields/builtins/boolean.js'
import type { dateField } from '../fields/builtins/date.js'
import type { dateTimeField } from '../fields/builtins/date-time.js'
import type { decimalField } from '../fields/builtins/decimal.js'
import type { enumField } from '../fields/builtins/enum.js'
import type { floatField } from '../fields/builtins/float.js'
import type { intField } from '../fields/builtins/int.js'
import type { jsonField } from '../fields/builtins/json.js'
import { objectField } from '../fields/builtins/object.js'
import type { NamedPointerFieldBuilderMethod } from '../fields/builtins/pointer.js'
import type { NamedRelationFieldBuilderMethod } from '../fields/builtins/relation.js'
import type { stringField } from '../fields/builtins/string.js'
import type { timeField } from '../fields/builtins/time.js'
import type { uuidField } from '../fields/builtins/uuid.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import type { RequestContext } from '../../runtime/context/request-context.js'
import {
	captureOutputBuilderCallback,
	resolveCapturedOutputDescriptor,
} from '../output/builder.js'
import type { SchemaDeclaredFields, SchemaFields } from './definition.js'
import {
	assertVirtualFieldDefinition,
	createVirtualFieldDefinition,
	normalizeVirtualFieldSelection,
	type GenericVirtualField,
	type VirtualFieldBuilderMethod,
} from './virtual-field.js'
import { systemFields } from './system-fields.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import { snapshotCapturedFieldOptions } from './captured-options.js'
import {
	assertEmbeddedBuiltInFieldOptions,
	type EmbeddedBigintFieldFactory,
	type EmbeddedIntFieldFactory,
} from './embedded-field-options.js'
import type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ScalarFieldBuilderMethods,
} from './field-builder-contract.js'
import type { ObjectFieldBuilderMethod } from './object-field-builder.js'
import {
	createRuntimeFieldBuilder,
	FieldBuilderMethodUnavailableError,
	FieldBuilderTargetUnavailableError,
	invokeFieldFactory,
	type FieldBuilderTargetResolver,
} from './runtime-field-builder.js'

export type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ObjectFieldBuilderOptions,
	SchemaFieldBuilderDeclaration,
} from './field-builder-contract.js'
export {
	FieldBuilderMethodUnavailableError,
	FieldBuilderTargetUnavailableError,
}
export type { FieldBuilderTargetResolver }

type UnknownCallable = (...arguments_: readonly unknown[]) => unknown

const isUnknownCallable = (value: unknown): value is UnknownCallable =>
	typeof value === 'function'

type RuntimeFieldBuilderMethod = (options?: unknown) => GenericField

interface CapturedFieldBuilderCall {
	readonly methodName: string
	readonly options: unknown
}

const capturedFieldBuilderCalls = new WeakSet<object>()

/** Separates developer callback failures from validation of its returned map. */
export class FieldBuilderDeclarationExecutionError extends Error {
	constructor(cause: unknown) {
		super('FieldBuilder declaration threw', { cause })
		this.name = 'FieldBuilderDeclarationExecutionError'
	}
}

const createCapturedFieldBuilderCall = (
	methodName: string,
	options: unknown,
): GenericField | GenericVirtualField => {
	const call = immutableRecord({ methodName, options })

	capturedFieldBuilderCalls.add(call)

	// The public builder method retains its concrete return type while compilation
	// privately replaces this opaque declaration with the plugin's real field.
	return call as unknown as GenericField | GenericVirtualField
}

const isCapturedFieldBuilderCall = (
	value: unknown,
): value is CapturedFieldBuilderCall =>
	typeof value === 'object' &&
	value !== null &&
	capturedFieldBuilderCalls.has(value)

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
				...(snapshotCapturedFieldOptions(options) as Readonly<
					Record<string, unknown>
				>),
				fields,
			}),
		)
	}

	return method as ObjectFieldBuilderMethod
}

const createCapturedVirtualMethod = (
	path: string,
): VirtualFieldBuilderMethod => {
	const method = (optionsValue: unknown): GenericVirtualField => {
		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(`${path}.virtual options must be a plain object`)
		}

		const { output, ...options } = optionsValue
		return createCapturedFieldBuilderCall(
			'virtual',
			immutableRecord({
				...(snapshotCapturedFieldOptions(options) as Readonly<
					Record<string, unknown>
				>),
				output: captureOutputBuilderCallback(output, `${path}.virtual.output`),
			}),
		) as GenericVirtualField
	}

	return method as VirtualFieldBuilderMethod
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
				snapshotCapturedFieldOptions(options),
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
				virtual: createCapturedVirtualMethod(path),
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
			if (
				typeof field === 'object' &&
				field !== null &&
				'kind' in field &&
				field.kind === 'virtual'
			) {
				assertVirtualFieldDefinition(field, `${path}.${name}`)
			} else {
				assertFieldDefinition(field, `${path}.${name}`)
			}
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
	embedded: boolean,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): GenericField => {
	if (embedded) {
		assertEmbeddedBuiltInFieldOptions(call.methodName, call.options, fieldPath)
	}

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

	const pluginMethod = fieldMethods?.get(call.methodName)
	if (
		pluginMethod !== undefined &&
		pluginMethod.contexts[embedded ? 'embedded' : 'stored'] === undefined
	) {
		throw new TypeError(
			`${fieldPath} FieldBuilder method "${call.methodName}" from "${pluginMethod.owner}" does not support the ${embedded ? 'embedded' : 'stored'} context`,
		)
	}

	const builder = createRuntimeFieldBuilder(
		fieldPath,
		embedded,
		fieldMethods,
		resolveTarget,
		executeFieldBuilderCallback,
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
): SchemaDeclaredFields => {
	assertCapturedFieldMap(captured, path)
	const fields: Record<string, GenericField | GenericVirtualField> = {}
	const virtualCalls: [string, CapturedFieldBuilderCall][] = []

	for (const [name, field] of Object.entries(captured)) {
		if (isCapturedFieldBuilderCall(field)) {
			if (!embedded && field.methodName === 'virtual') {
				virtualCalls.push([name, field])
				continue
			}
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
				embedded,
				fieldMethods,
				resolveTarget,
			)
			continue
		}

		fields[name] = field as GenericField | GenericVirtualField
	}

	const persistedFields = immutableRecord({
		...Object.fromEntries(
			Object.entries(fields).filter(([, field]) => field.kind !== 'virtual'),
		),
		...systemFields,
	}) as SchemaFields
	for (const [name, call] of virtualCalls) {
		if (!isPlainRecord(call.options)) {
			throw new TypeError(
				`${path}.${name}.virtual options must be a plain object`,
			)
		}
		const { output, resolve, select, ...options } = call.options
		if (typeof resolve !== 'function') {
			throw new TypeError(`${path}.${name}.virtual.resolve must be a function`)
		}
		fields[name] = createVirtualFieldDefinition(
			resolveCapturedOutputDescriptor(
				output,
				`${path}.${name}.virtual.output`,
				fieldMethods,
			),
			normalizeVirtualFieldSelection(
				select,
				persistedFields,
				`${path}.${name}.virtual.select`,
			),
			resolve as (input: {
				readonly context: RequestContext
				readonly item: Readonly<object>
			}) => unknown,
			immutableRecord(options),
		)
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
): SchemaDeclaredFields =>
	resolveCapturedFieldMap(
		captureFieldBuilderCallback(declaration, path, embedded),
		path,
		embedded,
		fieldMethods,
		resolveTarget,
	)
