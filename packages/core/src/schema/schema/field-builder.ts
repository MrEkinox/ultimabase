import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import { builtInFieldKinds } from '../fields/base/kinds.js'
import { objectField } from '../fields/builtins/object.js'
import {
	createCapturedBuilderCallRegistry,
	type CapturedBuilderCall,
} from '../captured-builder-call.js'
import {
	captureOutputBuilderCallback,
	resolveCapturedOutputDescriptor,
} from '../output/builder.js'
import {
	snapshotCapturedFieldOptions,
	snapshotCapturedFieldRecord,
} from './captured-options.js'
import type { SchemaDeclaredFields, SchemaFields } from './definition.js'
import { assertEmbeddedBuiltInFieldOptions } from './embedded-field-options.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import {
	invokeFieldFactory,
	isRelationshipMethod,
	isUnknownCallable,
	replayFieldBuilderMethod,
	type FieldBuilderTargetResolver,
} from './runtime-field-builder.js'
import { systemFields } from './system-fields.js'
import {
	assertVirtualFieldDefinition,
	createVirtualFieldDefinition,
	readVirtualFieldResolverBinding,
	normalizeVirtualFieldSelection,
	type GenericVirtualField,
} from './virtual-field.js'
import { assertPlainObject } from '../../exact-object-validation.js'

export type {
	EmbeddedFieldBuilder,
	FieldBuilder,
	ObjectFieldBuilderOptions,
	SchemaFieldBuilderDeclaration,
} from './field-builder-contract.js'

/*
 * A schema `fields` callback runs exactly once, against a capturing builder:
 * every method call returns an opaque captured call holding its snapshotted
 * options. Compilation later replays those calls once the application has
 * declared its plugin methods and schema registry, so the same declaration can
 * be compiled by several applications without executing developer code again.
 */

/** Separates developer callback failures from validation of its returned map. */
export class FieldBuilderDeclarationExecutionError extends Error {
	constructor(cause: unknown) {
		super('FieldBuilder declaration threw', { cause })
		this.name = 'FieldBuilderDeclarationExecutionError'
	}
}

type FieldMapEntry = CapturedBuilderCall | GenericField | GenericVirtualField

const [createCapturedFieldBuilderCall, isCapturedFieldBuilderCall] =
	createCapturedBuilderCallRegistry<CapturedBuilderCall>()

/**
 * Captures `object` or `virtual`, whose callback option (`fields`, `output`)
 * must itself run now and be captured, while the other options are snapshotted.
 */
const captureCallbackMethod =
	(path: string, methodName: 'object' | 'virtual') =>
	(optionsValue: unknown): CapturedBuilderCall => {
		if (!isPlainRecord(optionsValue)) {
			throw new TypeError(
				`${path}.${methodName} options must be a plain object`,
			)
		}

		const key = methodName === 'object' ? 'fields' : 'output'
		const { [key]: callback, ...options } = optionsValue
		const callbackPath = `${path}.${methodName}.${key}`
		const captured =
			methodName === 'object'
				? captureFieldBuilderCallback(callback, callbackPath, true)
				: captureOutputBuilderCallback(callback, callbackPath)

		return createCapturedFieldBuilderCall(
			methodName,
			immutableRecord({
				...snapshotCapturedFieldRecord(options),
				[key]: captured,
			}),
		)
	}

/**
 * Creates the capturing builder handed to a developer callback. Known built-in
 * methods are own properties; any other name is captured as a plugin method
 * whose availability is only decided at replay time.
 */
const createCapturedFieldBuilder = (
	path: string,
	embedded: boolean,
): object => {
	const capture =
		(methodName: string) =>
		(options?: unknown): CapturedBuilderCall =>
			createCapturedFieldBuilderCall(
				methodName,
				snapshotCapturedFieldOptions(options),
			)
	const methods: Record<string, unknown> = {}

	for (const methodName of builtInFieldKinds) {
		if (!embedded || !isRelationshipMethod(methodName)) {
			methods[methodName] = capture(methodName)
		}
	}
	methods.object = captureCallbackMethod(path, 'object')
	if (!embedded) {
		methods.virtual = captureCallbackMethod(path, 'virtual')
	}

	return new Proxy(immutableRecord(methods), {
		get: (record, property, receiver): unknown => {
			if (typeof property !== 'string' || Reflect.has(record, property)) {
				return Reflect.get(record, property, receiver)
			}

			return embedded && isRelationshipMethod(property)
				? undefined
				: capture(property)
		},
	})
}

const readFieldMapEntry = (field: unknown, path: string): FieldMapEntry => {
	if (isCapturedFieldBuilderCall(field)) {
		return field
	}

	if (
		typeof field === 'object' &&
		field !== null &&
		'kind' in field &&
		field.kind === 'virtual'
	) {
		assertVirtualFieldDefinition(field, path)
		return field
	}

	assertFieldDefinition(field, path)
	return field
}

/** Validates a returned map: captured calls or already-built definitions only. */
const readFieldMap = (
	value: unknown,
	path: string,
): Readonly<Record<string, FieldMapEntry>> => {
	assertPlainObject(value, `${path} must return a field map`)

	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, field]) => {
				assertNonEmptyString(name, `${path} field name`)
				return [name, readFieldMapEntry(field, `${path}.${name}`)]
			}),
		),
	)
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

	const fields = readFieldMap(returned, path)
	if (!embedded) assertNoFieldRelationWhere(fields, path)
	return fields
}

// Relation filters moved to the final `.with` (ADR-0328); point there.
const assertNoFieldRelationWhere = (
	fields: Readonly<Record<string, FieldMapEntry>>,
	path: string,
): void => {
	for (const [name, field] of Object.entries(fields)) {
		if (
			isCapturedFieldBuilderCall(field) &&
			field.methodName === 'relation' &&
			isPlainRecord(field.options) &&
			Object.hasOwn(field.options, 'where')
		) {
			throw new TypeError(
				`${path}.${name} cannot declare where: declare relation filters in .with({ relations: { ${name}: { where } } })`,
			)
		}
	}
}

/** Checks that one captured field map entry declares a relation. */
export const isDeclaredRelationField = (field: unknown): boolean =>
	isCapturedFieldBuilderCall(field)
		? field.methodName === 'relation'
		: typeof field === 'object' &&
			field !== null &&
			'kind' in field &&
			field.kind === 'relation'

/** Replays one captured non-virtual call; `object` recurses into its captured map. */
const resolveCapturedFieldBuilderCall = (
	call: CapturedBuilderCall,
	path: string,
	embedded: boolean,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): GenericField => {
	const { methodName, options } = call
	const methodPath = `${path}.${methodName}`

	if (embedded) {
		assertEmbeddedBuiltInFieldOptions(methodName, options, path)
	}

	if (methodName === 'object') {
		assertPlainObject(options, `${methodPath} options must be a plain object`)

		const { fields: capturedFields, ...objectOptions } = options
		const fields = resolveCapturedFieldMap(
			capturedFields,
			`${methodPath}.fields`,
			true,
			fieldMethods,
			resolveTarget,
		)

		return invokeFieldFactory(
			objectField,
			{ ...objectOptions, fields },
			methodPath,
		)
	}

	return replayFieldBuilderMethod(
		call,
		path,
		embedded,
		fieldMethods,
		resolveTarget,
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
	// Entries keep every declared name, including `__proto__`, as an own key.
	const fields: [string, GenericField | GenericVirtualField][] = []
	const virtualCalls: [string, CapturedBuilderCall][] = []

	for (const [name, field] of Object.entries(readFieldMap(captured, path))) {
		if (!isCapturedFieldBuilderCall(field)) {
			fields.push([name, field])
		} else if (!embedded && field.methodName === 'virtual') {
			// Virtual fields select persisted dependencies, so they resolve last.
			virtualCalls.push([name, field])
		} else if (embedded && isRelationshipMethod(field.methodName)) {
			throw new TypeError(
				`${path}.${name} cannot be a pointer or relation inside objectField`,
			)
		} else {
			fields.push([
				name,
				resolveCapturedFieldBuilderCall(
					field,
					`${path}.${name}`,
					embedded,
					fieldMethods,
					resolveTarget,
				),
			])
		}
	}

	const persistedFields: SchemaFields = immutableRecord({
		...Object.fromEntries(
			fields.filter(
				(entry): entry is [string, GenericField] => entry[1].kind !== 'virtual',
			),
		),
		...systemFields,
	})
	for (const [name, call] of virtualCalls) {
		const virtualPath = `${path}.${name}.virtual`
		assertPlainObject(
			call.options,
			`${virtualPath} options must be a plain object`,
		)
		const { output, resolve, resolveMany, select, ...options } = call.options
		const resolver = readVirtualFieldResolverBinding(
			resolve,
			resolveMany,
			virtualPath,
		)
		fields.push([
			name,
			createVirtualFieldDefinition(
				resolveCapturedOutputDescriptor(
					output,
					`${virtualPath}.output`,
					fieldMethods,
				),
				normalizeVirtualFieldSelection(
					select,
					persistedFields,
					`${virtualPath}.select`,
				),
				resolver,
				immutableRecord(options),
			),
		])
	}

	return immutableRecord(Object.fromEntries(fields))
}
