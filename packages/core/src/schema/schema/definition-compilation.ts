import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import { snapshotCapturedOptionValue } from './captured-options.js'
import { areSchemaDeclarationValuesCompatible } from './declaration-compatibility.js'
import {
	FieldBuilderDeclarationExecutionError,
	resolveCapturedFieldMap,
} from './field-builder.js'
import type { FieldBuilderTargetResolver } from './runtime-field-builder.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import { normalizeSchemaIndexes, type SchemaIndexOptions } from './indexes.js'
import { createInitialSchemaProvenance } from './provenance.js'
import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
} from './reserved-field-names.js'
import { reservedSystemFieldNames, systemFields } from './system-fields.js'
import {
	assertVirtualFieldDefinition,
	getVirtualFieldResolver,
	type GenericVirtualField,
} from './virtual-field.js'
import type {
	PreparedSchemaCompilation,
	SchemaCompiledTargetIdentity,
	SchemaDeclaredFields,
	SchemaDefinition,
	SchemaFields,
	SchemaMetadata,
	SchemaVirtualFields,
} from './definition.js'

/** Reports deferred and incompatible schema declarations without publishing partial metadata. */
/** Explains why a deferred schema cannot expose its final runtime definition. */
export type SchemaCompilationFailureReason =
	| 'callback-threw'
	| 'incompatible-definition'
	| 'invalid-result'
	| 'not-compiled'

/** Reports one deterministic static schema-compilation failure. */
export class SchemaCompilationError extends Error {
	readonly code = 'SCHEMA_COMPILATION_FAILED' as const
	readonly className: string
	readonly reason: SchemaCompilationFailureReason

	constructor(
		reason: SchemaCompilationFailureReason,
		className: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.name = 'SchemaCompilationError'
		this.className = className
		this.reason = reason
		Object.freeze(this)
	}
}

// A versioned global symbol preserves constructor provenance across package copies.
export const schemaDefinitionMarker: symbol = Symbol.for(
	'@ultimabase/core/schema-definition/v1',
)

/** Retains one declaration until an application resolves its deferred fields. */
export interface NormalizedSchemaDeclaration {
	readonly className: string
	readonly fields: Readonly<Record<string, unknown>>
	readonly indexes: readonly SchemaIndexOptions[] | undefined
	readonly options: Readonly<Record<string, unknown>>
}

/** Holds the published metadata; targets exist once an application owns it. */
interface CompiledSchemaRecord {
	readonly definition: SchemaMetadata
	readonly developerFields: SchemaFields
	readonly targets: readonly SchemaCompiledTargetIdentity[] | undefined
}

const schemaDeclarations = new WeakMap<
	SchemaDefinition,
	NormalizedSchemaDeclaration
>()
const compiledSchemaRecords = new WeakMap<
	SchemaDefinition,
	CompiledSchemaRecord
>()

/** Owns the deferred declaration of one schema class. */
export const storeSchemaDeclaration = (
	schema: SchemaDefinition,
	declaration: NormalizedSchemaDeclaration,
): void => {
	schemaDeclarations.set(schema, declaration)
}

/** Publishes a candidate resolved without application-owned field methods. */
export const storeProvisionalSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
): void => {
	compiledSchemaRecords.set(
		prepared.schema,
		immutableRecord({
			definition: prepared.definition,
			developerFields: prepared.developerFields,
			targets: undefined,
		}),
	)
}

/** Reads the published compilation or explains that no application owns it yet. */
export const readCompiledSchemaRecord = (
	schema: SchemaDefinition,
): CompiledSchemaRecord => {
	const record = compiledSchemaRecords.get(schema)

	if (record === undefined) {
		throw new SchemaCompilationError(
			'not-compiled',
			schema.className,
			`Schema ${schema.className} has not been compiled by an application`,
		)
	}

	return record
}

const assertNoReservedFieldCollision = (
	fields: Readonly<Record<string, unknown>>,
): void => {
	for (const name of reservedSystemFieldNames) {
		if (Object.hasOwn(fields, name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}
	}

	for (const name of Object.keys(fields)) {
		if (isReservedQueryLogicalFieldName(name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}

		if (isReservedSchemaModelFieldName(name)) {
			throw new TypeError(`Reserved schema model field: ${name}`)
		}
	}
}

/** Validates one resolved developer field map and splits its stored fields. */
const assertDeveloperFields = (
	fields: unknown,
	className: string,
): {
	declared: SchemaDeclaredFields
	persisted: SchemaFields
	virtual: SchemaVirtualFields
} => {
	if (!isPlainRecord(fields)) {
		throw new SchemaCompilationError(
			'invalid-result',
			className,
			`Schema ${className} fields declaration must return a plain object`,
		)
	}

	assertNoReservedFieldCollision(fields)

	const declared: [string, GenericField | GenericVirtualField][] = []
	const persisted: [string, GenericField][] = []
	const virtual: [string, GenericVirtualField][] = []

	for (const [name, field] of Object.entries(fields)) {
		const path = `${className}.fields.${name}`

		assertNonEmptyString(name, `${className} schema field name`)
		if (
			typeof field === 'object' &&
			field !== null &&
			'kind' in field &&
			field.kind === 'virtual'
		) {
			assertVirtualFieldDefinition(field, path)
			virtual.push([name, field])
		} else {
			assertFieldDefinition(field, path)
			persisted.push([name, field])
		}
		declared.push([name, field])
	}

	// Entry lists keep every validated name, including `__proto__`, as an own key.
	return {
		declared: immutableRecord(Object.fromEntries(declared)),
		persisted: immutableRecord(Object.fromEntries(persisted)),
		virtual: immutableRecord(Object.fromEntries(virtual)),
	}
}

const coreSchemaOptionKeys = new Set(['className', 'fields', 'indexes'])

/** Detaches direct plugin options while leaving their validation to the application graph. */
export const snapshotUnresolvedSchemaOptions = (
	options: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const unresolved: Record<string, unknown> = {}

	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string') {
			throw new TypeError(`Unknown schema option: ${String(key)}`)
		}

		if (!coreSchemaOptionKeys.has(key)) {
			unresolved[key] = snapshotCapturedOptionValue(options[key])
		}
	}

	return immutableRecord(unresolved)
}

const resolveDeveloperFields = (
	declaration: NormalizedSchemaDeclaration,
	fieldMethods: FieldBuilderMethodResolver | undefined,
	resolveTarget: FieldBuilderTargetResolver | undefined,
): unknown => {
	try {
		return resolveCapturedFieldMap(
			declaration.fields,
			`${declaration.className}.fields`,
			false,
			fieldMethods,
			resolveTarget,
		)
	} catch (cause: unknown) {
		throw new SchemaCompilationError(
			'callback-threw',
			declaration.className,
			`Schema ${declaration.className} fields declaration could not be resolved`,
			{
				cause:
					cause instanceof FieldBuilderDeclarationExecutionError
						? cause.cause
						: cause,
			},
		)
	}
}

/** Resolves one application-local candidate without publishing partial metadata. */
export const prepareSchemaCompilation = (
	schema: SchemaDefinition,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): PreparedSchemaCompilation => {
	const declaration = schemaDeclarations.get(schema)

	if (declaration === undefined) {
		throw new TypeError('schema must be a class created by App.Schema.define')
	}

	const { className, options } = declaration
	const { declared, persisted, virtual } = assertDeveloperFields(
		resolveDeveloperFields(declaration, fieldMethods, resolveTarget),
		className,
	)
	const fields = immutableRecord({ ...declared, ...systemFields })
	const indexes = normalizeSchemaIndexes(persisted, declaration.indexes)

	return immutableRecord({
		definition: immutableRecord({
			...options,
			className,
			fields,
			indexes,
			persistedFields: immutableRecord({ ...persisted, ...systemFields }),
			provenance: createInitialSchemaProvenance(
				className,
				Object.keys(declared),
				fields,
				indexes,
				Object.keys(options),
			),
			virtualFields: virtual,
		}),
		developerFields: persisted,
		schema,
	})
}

const assertCompatibleCompilation = (
	existing: CompiledSchemaRecord,
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	const canonicalTargets = existing.targets ?? []
	const compatible =
		Object.entries(existing.definition.virtualFields).every(([name, field]) => {
			const candidate = prepared.definition.virtualFields[name]
			return (
				candidate !== undefined &&
				getVirtualFieldResolver(candidate) === getVirtualFieldResolver(field)
			)
		}) &&
		areSchemaDeclarationValuesCompatible(
			existing.definition,
			prepared.definition,
		) &&
		canonicalTargets.length === targets.length &&
		canonicalTargets.every((target, index) => {
			const candidate = targets[index]
			return (
				candidate?.target === target.target &&
				areSchemaDeclarationValuesCompatible(
					target.fieldPath,
					candidate.fieldPath,
				)
			)
		})

	if (!compatible) {
		throw new SchemaCompilationError(
			'incompatible-definition',
			prepared.schema.className,
			`Schema ${prepared.schema.className} compiled differently in another application`,
		)
	}
}

/** Checks compatibility without publishing any candidate in the application graph. */
export const validateSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	const existing = compiledSchemaRecords.get(prepared.schema)

	// A schema published by another application must compile identically here.
	if (existing?.targets !== undefined) {
		assertCompatibleCompilation(existing, prepared, targets)
	}
}

/** @internal Publishes a candidate after the registry validates the complete graph. */
export const finalizeSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	if (compiledSchemaRecords.get(prepared.schema)?.targets !== undefined) return

	compiledSchemaRecords.set(
		prepared.schema,
		immutableRecord({
			definition: prepared.definition,
			developerFields: prepared.developerFields,
			targets: immutableArray(
				targets.map((target) =>
					immutableRecord({
						fieldPath: immutableArray(target.fieldPath),
						target: target.target,
					}),
				),
			),
		}),
	)
}
