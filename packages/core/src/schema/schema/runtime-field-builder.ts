import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import { bigintField } from '../fields/builtins/bigint.js'
import { binaryField } from '../fields/builtins/binary.js'
import { booleanField } from '../fields/builtins/boolean.js'
import { dateField } from '../fields/builtins/date.js'
import { dateTimeField } from '../fields/builtins/date-time.js'
import { decimalField } from '../fields/builtins/decimal.js'
import { enumField } from '../fields/builtins/enum.js'
import { floatField } from '../fields/builtins/float.js'
import { intField } from '../fields/builtins/int.js'
import { jsonField } from '../fields/builtins/json.js'
import { objectField } from '../fields/builtins/object.js'
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
import type { SchemaDeclaredFields, SchemaDefinition } from './definition.js'
import type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ScalarFieldBuilderMethods,
} from './field-builder-contract.js'
import type {
	FieldBuilderMethodContextDefinition,
	FieldBuilderMethodResolver,
	OwnedFieldBuilderMethod,
} from './field-builder-methods.js'
import type { FieldDeclarationContext } from './field-contexts.js'
import type { ObjectFieldBuilderMethod } from './object-field-builder.js'
import { createNamedSchemaTarget } from './targets.js'

type UnknownCallable = (...arguments_: readonly unknown[]) => unknown
type RuntimeFieldBuilderMethod = (options?: unknown) => GenericField
type ExecuteEmbeddedFields = (
	declaration: unknown,
	path: string,
	embedded: boolean,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
) => SchemaDeclaredFields

/** Identifies the one expected failure when an application omitted a used field plugin. */
export class FieldBuilderMethodUnavailableError extends TypeError {}

/** Defers named relationship materialization until an application registry exists. */
export class FieldBuilderTargetUnavailableError extends TypeError {}

/** Resolves one declared target name against the current application registry. */
export type FieldBuilderTargetResolver = (
	className: string,
) => SchemaDefinition | undefined

const isUnknownCallable = (value: unknown): value is UnknownCallable =>
	typeof value === 'function'

export const invokeFieldFactory = (
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

const invokePluginFieldFactory = (
	method: OwnedFieldBuilderMethod,
	implementation: FieldBuilderMethodContextDefinition,
	options: unknown,
	path: string,
): GenericField => {
	const field = invokeFieldFactory(
		implementation.factory,
		options,
		`${path}.${method.name}`,
	)

	if (field.kind !== implementation.fieldKind) {
		throw new TypeError(
			`${path} FieldBuilder method "${method.name}" from "${method.owner}" returned kind "${field.kind}" instead of "${implementation.fieldKind}"`,
		)
	}

	return field
}

const createPluginMethods = (
	path: string,
	context: Exclude<FieldDeclarationContext, 'output'>,
	fieldMethods?: FieldBuilderMethodResolver,
): Readonly<Record<string, RuntimeFieldBuilderMethod>> => {
	const methods: Record<string, RuntimeFieldBuilderMethod> = {}

	for (const method of fieldMethods?.values() ?? []) {
		const implementation = method.contexts[context]
		if (implementation === undefined) continue
		methods[method.name] = (options): GenericField =>
			invokePluginFieldFactory(method, implementation, options, path)
	}

	return immutableRecord(methods)
}

const createObjectMethod = (
	path: string,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
	executeEmbeddedFields: ExecuteEmbeddedFields,
): ObjectFieldBuilderMethod => {
	const method = (optionsValue: unknown): GenericField => {
		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(`${path}.object options must be a plain object`)
		}

		const { fields: declaration, ...options } = optionsValue
		const fields = executeEmbeddedFields(
			declaration,
			`${path}.object.fields`,
			true,
			fieldMethods,
			resolveTarget,
		)

		return objectField({ ...options, fields })
	}

	return method as ObjectFieldBuilderMethod
}

/** Builds the concrete field surface used while captured declarations compile. */
export const createRuntimeFieldBuilder = (
	path: string,
	embedded: boolean,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
	executeEmbeddedFields: ExecuteEmbeddedFields,
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
		object: createObjectMethod(
			path,
			fieldMethods,
			resolveTarget,
			executeEmbeddedFields,
		),
		string: stringField,
		time: timeField,
		uuid: uuidField,
	}
	const context = embedded ? 'embedded' : 'stored'
	const pluginMethods = createPluginMethods(path, context, fieldMethods)

	if (embedded) {
		return createRuntimeBuilder<EmbeddedFieldBuilder>(
			{ ...scalarMethods, bigint: bigintField, int: intField },
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
			virtual: () => {
				throw new TypeError(
					`${path}.virtual is available only through captured schema declarations`,
				)
			},
		},
		pluginMethods,
		path,
		false,
	)
}
