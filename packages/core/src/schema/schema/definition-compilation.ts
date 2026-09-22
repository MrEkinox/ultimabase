import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	assertNonEmptyString,
} from '@ultimabase/shared'
import { assertFieldDefinition } from '../fields/base/definition.js'
import {
	assertVirtualFieldDefinition,
	getVirtualFieldResolver,
} from './virtual-field.js'
import { normalizeSchemaIndexes } from './indexes.js'
import { systemFields, reservedSystemFieldNames } from './system-fields.js'
import {
	FieldBuilderDeclarationExecutionError,
	resolveCapturedFieldMap,
	type FieldBuilderTargetResolver,
} from './field-builder.js'
import { snapshotCapturedOptionValue } from './captured-options.js'
import { areSchemaDeclarationValuesCompatible } from './declaration-compatibility.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
} from './reserved-field-names.js'
import { createInitialSchemaProvenance } from './provenance.js'
import { SchemaCompilationError } from './definition-error.js'
import {
	getSchemaDeclaration,
	getCompiledSchemaRecord,
	storeCompiledSchemaRecord,
	type CompiledSchemaRecord,
	type NormalizedSchemaDeclaration,
} from './definition-state.js'
import type {
	PreparedSchemaCompilation,
	SchemaCompiledTargetIdentity,
	SchemaDeclaredFields,
	SchemaDefinition,
	SchemaFields,
	SchemaVirtualFields,
} from './definition.js'

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

const assertSchemaFields: (
	fields: unknown,
	className: string,
) => asserts fields is SchemaDeclaredFields = (fields, className) => {
	if (!isPlainRecord(fields)) {
		throw new SchemaCompilationError(
			'invalid-result',
			className,
			`Schema ${className} fields declaration must return a plain object`,
		)
	}

	assertNoReservedFieldCollision(fields)

	for (const [name, field] of Object.entries(fields)) {
		assertNonEmptyString(name, `${className} schema field name`)
		if (
			typeof field === 'object' &&
			field !== null &&
			'kind' in field &&
			field.kind === 'virtual'
		) {
			assertVirtualFieldDefinition(field, `${className}.fields.${name}`)
		} else {
			assertFieldDefinition(field, `${className}.fields.${name}`)
		}
	}
}

const compileSchemaRecord = (
	declaration: NormalizedSchemaDeclaration,
	developerFieldsInput: unknown,
): CompiledSchemaRecord => {
	assertSchemaFields(developerFieldsInput, declaration.className)
	const developerFields = immutableRecord(developerFieldsInput)
	const declaredFields = developerFields
	const persistedDeveloperFields = immutableRecord(
		Object.fromEntries(
			Object.entries(developerFields).filter(
				([, field]) => field.kind !== 'virtual',
			),
		),
	) as SchemaFields
	const virtualFields = immutableRecord(
		Object.fromEntries(
			Object.entries(developerFields).filter(
				([, field]) => field.kind === 'virtual',
			),
		),
	) as SchemaVirtualFields
	const fields = immutableRecord({
		...declaredFields,
		...systemFields,
	})
	const persistedFields = immutableRecord({
		...persistedDeveloperFields,
		...systemFields,
	})
	const indexes = normalizeSchemaIndexes(
		persistedDeveloperFields,
		declaration.indexes,
	)
	const provenance = createInitialSchemaProvenance(
		declaration.className,
		Object.keys(declaredFields),
		fields,
		indexes,
		Object.keys(declaration.options),
	)
	const definition = immutableRecord({
		...declaration.options,
		className: declaration.className,
		constraints: immutableArray([]),
		fields,
		indexes,
		persistedFields,
		provenance,
		virtualFields,
	})

	return immutableRecord({
		definition,
		developerFields: persistedDeveloperFields,
		targets: undefined,
	})
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

const executeSchemaFieldDeclaration = (
	declaration: NormalizedSchemaDeclaration,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
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

const assertCompatibleTargets = (
	className: string,
	canonical: readonly SchemaCompiledTargetIdentity[],
	candidate: readonly SchemaCompiledTargetIdentity[],
): void => {
	const compatible =
		canonical.length === candidate.length &&
		canonical.every((target, index) => {
			const candidateTarget = candidate[index]

			if (candidateTarget === undefined) {
				return false
			}

			return (
				target.target === candidateTarget.target &&
				areSchemaDeclarationValuesCompatible(
					target.fieldPath,
					candidateTarget.fieldPath,
				)
			)
		})

	if (!compatible) {
		throw new SchemaCompilationError(
			'incompatible-definition',
			className,
			`Schema ${className} compiled differently in another application`,
		)
	}
}

/** Resolves one application-local candidate without publishing partial metadata. */
export const prepareSchemaCompilation = (
	schema: SchemaDefinition,
	fieldMethods?: FieldBuilderMethodResolver,
	resolveTarget?: FieldBuilderTargetResolver,
): PreparedSchemaCompilation => {
	const declaration = getSchemaDeclaration(schema)

	if (declaration === undefined) {
		throw new TypeError('schema must be a class created by Schema.define')
	}

	const candidate = compileSchemaRecord(
		declaration,
		executeSchemaFieldDeclaration(declaration, fieldMethods, resolveTarget),
	)

	return immutableRecord({
		definition: candidate.definition,
		developerFields: candidate.developerFields,
		schema,
	})
}

/** Publishes one candidate only after the complete application graph validates. */
export const validateSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	const existingRecord = getCompiledSchemaRecord(prepared.schema)
	const resolverCompatible =
		existingRecord?.targets === undefined ||
		Object.entries(existingRecord.definition.virtualFields).every(
			([name, field]) => {
				const candidate = prepared.definition.virtualFields[name]
				return (
					candidate !== undefined &&
					getVirtualFieldResolver(candidate) === getVirtualFieldResolver(field)
				)
			},
		)

	if (
		existingRecord?.targets !== undefined &&
		(!resolverCompatible ||
			!areSchemaDeclarationValuesCompatible(
				existingRecord.definition,
				prepared.definition,
			))
	) {
		throw new SchemaCompilationError(
			'incompatible-definition',
			prepared.schema.className,
			`Schema ${prepared.schema.className} compiled differently in another application`,
		)
	}

	if (existingRecord?.targets !== undefined) {
		assertCompatibleTargets(
			prepared.schema.className,
			existingRecord.targets,
			targets,
		)
	}
}

/** Publishes one candidate only after the complete application graph validates. */
export const finalizeSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	validateSchemaCompilation(prepared, targets)
	const existingRecord = getCompiledSchemaRecord(prepared.schema)
	const immutableTargets = immutableArray(
		targets.map((target) =>
			immutableRecord({
				fieldPath: immutableArray(target.fieldPath),
				target: target.target,
			}),
		),
	)

	if (existingRecord?.targets === undefined) {
		storeCompiledSchemaRecord(
			prepared.schema,
			immutableRecord({
				definition: prepared.definition,
				developerFields: prepared.developerFields,
				targets: immutableTargets,
			}),
		)
		return
	}
}
