import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

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
import { pointerField } from '../fields/builtins/pointer.js'
import { relationField } from '../fields/builtins/relation.js'
import { stringField } from '../fields/builtins/string.js'
import { timeField } from '../fields/builtins/time.js'
import { uuidField } from '../fields/builtins/uuid.js'
import type { CapturedBuilderCall } from '../captured-builder-call.js'
import type { SchemaDefinition } from './definition.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import { createNamedSchemaTarget } from './targets.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Identifies the one expected failure when an application omitted a used field plugin. */
export class FieldBuilderMethodUnavailableError extends TypeError {}

/** Defers named relationship materialization until an application registry exists. */
export class FieldBuilderTargetUnavailableError extends TypeError {}

/** Resolves one declared target name against the current application registry. */
export type FieldBuilderTargetResolver = (
	className: string,
) => SchemaDefinition | undefined

type UnknownCallable = (...arguments_: readonly unknown[]) => unknown

export const isUnknownCallable = (value: unknown): value is UnknownCallable =>
	typeof value === 'function'

/** Methods that only exist on the stored root builder, never inside objects. */
export const isRelationshipMethod = (methodName: string): boolean =>
	methodName === 'pointer' || methodName === 'relation'

/** Built-in value factories replayed identically in stored and embedded maps. */
const valueFieldFactories: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	['bigint', bigintField],
	['binary', binaryField],
	['boolean', booleanField],
	['date', dateField],
	['dateTime', dateTimeField],
	['decimal', decimalField],
	['enum', enumField],
	['float', floatField],
	['int', intField],
	['json', jsonField],
	['string', stringField],
	['time', timeField],
	['uuid', uuidField],
])

// Common names from other libraries, mapped to the built-in methods they mean.
const builtInMethodAliases: ReadonlyMap<string, readonly string[]> = new Map([
	['array', ['json']],
	['bool', ['boolean']],
	['datetime', ['dateTime']],
	['double', ['float']],
	['integer', ['int']],
	['number', ['int', 'float', 'decimal']],
	['object', ['object']],
	['text', ['string']],
	['timestamp', ['dateTime']],
])

/** Suggests built-in methods a developer most likely meant, if any. */
const suggestBuiltInMethods = (
	methodName: string,
	embedded: boolean,
): readonly string[] => {
	const available = [
		...valueFieldFactories.keys(),
		'object',
		...(embedded ? [] : ['pointer', 'relation']),
	]
	const lowerName = methodName.toLowerCase()
	const suggestions = [
		...(builtInMethodAliases.get(lowerName) ?? []),
		...available.filter(
			(name) => name !== methodName && name.toLowerCase() === lowerName,
		),
	]
	return [...new Set(suggestions)].filter((name) => available.includes(name))
}

/** Calls one factory and proves it returned a field definition. */
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

/** Replaces a pointer/relation target name with the registry-resolved target. */
const resolveNamedTargetOptions = (
	options: unknown,
	path: string,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): Readonly<Record<string, unknown>> => {
	assertPlainObject(
		options,
		`${path} relationship options must be a plain object`,
	)

	const { target, ...rest } = options

	// A thunk already designates its exact schema; the target graph validates it.
	if (typeof target === 'function') return options

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

/**
 * Replays one captured plugin or built-in call (anything but `object` and
 * `virtual`) against the methods the application declared.
 */
export const replayFieldBuilderMethod = (
	{ methodName, options }: CapturedBuilderCall,
	path: string,
	embedded: boolean,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): GenericField => {
	const methodPath = `${path}.${methodName}`
	const context = embedded ? 'embedded' : 'stored'
	const pluginMethod = fieldMethods?.get(methodName)
	if (pluginMethod !== undefined) {
		const implementation = pluginMethod.contexts[context]
		if (implementation === undefined) {
			throw new TypeError(
				`${path} FieldBuilder method "${methodName}" from "${pluginMethod.owner}" does not support the ${context} context`,
			)
		}

		const field = invokeFieldFactory(
			implementation.factory,
			options,
			methodPath,
		)
		if (field.kind !== implementation.fieldKind) {
			throw new TypeError(
				`${path} FieldBuilder method "${methodName}" from "${pluginMethod.owner}" returned kind "${field.kind}" instead of "${implementation.fieldKind}"`,
			)
		}
		return field
	}

	if (!embedded && isRelationshipMethod(methodName)) {
		return invokeFieldFactory(
			methodName === 'pointer' ? pointerField : relationField,
			resolveNamedTargetOptions(options, path, resolveTarget),
			methodPath,
		)
	}

	const factory = valueFieldFactories.get(methodName)
	if (factory === undefined) {
		const suggestions = suggestBuiltInMethods(methodName, embedded)
		const hint =
			suggestions.length === 0
				? ''
				: `. Did you mean ${suggestions.map((name) => `field.${name}()`).join(' or ')}?`
		throw new FieldBuilderMethodUnavailableError(
			`${path} FieldBuilder method "${methodName}" is unavailable; configure the plugin that declares it${hint}`,
		)
	}

	return invokeFieldFactory(factory, options, methodPath)
}
