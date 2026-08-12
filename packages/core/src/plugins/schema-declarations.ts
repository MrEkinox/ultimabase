import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import { snapshotJsonValue } from '../schema/fields/builtins/json.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import {
	defineExtensions,
	type SchemaExtension,
} from '../schema/extensions/definition.js'
import {
	assertFieldDefinition,
	getDeclaredFieldOptionsContract,
	replaceDeclaredFieldOptions,
} from '../schema/fields/base/definition.js'
import { isCoreFieldOptionKey } from '../schema/fields/base/options.js'
import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import { areSchemaDeclarationValuesCompatible } from '../schema/schema/definition.js'
import type {
	SchemaIndexDefinition,
	SchemaIndexOptions,
} from '../schema/schema/indexes.js'
import {
	isSchemaConstraintDefinition,
	type SchemaConstraintDefinition,
} from '../schema/schema/constraints.js'
import { normalizeContributedSchemaIndex } from '../schema/schema/indexes.js'
import { reservedSystemFieldNames } from '../schema/schema/system-fields.js'
import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
} from '../schema/schema/reserved-field-names.js'
import { snapshotCapturedOptionValue } from '../schema/schema/field-builder.js'
import type {
	CapabilityConsumerValue,
	CapabilityRequirement,
	CapabilityToken,
	PluginCapabilityReader,
} from './capabilities.js'
import { assertCapabilityRequirement } from './capabilities.js'
import type { ApplicationCapabilityHost } from './capability-host.js'
import {
	applicationSchemaContributionOwner,
	coreSchemaContributionOwner,
	createSchemaContributionProvenance,
	type ApplicationSchemaContributionOwner,
	type PluginSchemaContributionOwner,
	type SchemaCompilationProvenance,
	type SchemaContributionProvenance,
	type SchemaContributionOwner,
	type SchemaContributionOwnerReference,
	type SchemaOptionProvenance,
} from '../schema/schema/provenance.js'

/** Gives Typegen one inert named type reference without running generation here. */
export interface SchemaOptionTypegenDescriptor {
	readonly module: string
	readonly type: string
}

type RequirementConsumerValue<TRequirement> =
	TRequirement extends CapabilityRequirement<infer TToken, infer TOptional>
		? TOptional extends true
			? CapabilityConsumerValue<TToken> | undefined
			: CapabilityConsumerValue<TToken>
		: never

type SchemaOptionRuntimeRequirement = CapabilityRequirement<
	CapabilityToken,
	boolean,
	string,
	'materialization'
>

/** Describes optional Runtime compilation owned by an application capability. */
export interface SchemaOptionRuntimeCompilationContext<
	TValue extends JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	/** Reads the exact application capability declared by the option owner. */
	readonly capability: RequirementConsumerValue<TRequirement>
	/** Identifies the final application-local schema occurrence. */
	readonly className: string
	/** Identifies the field for field-scoped options only. */
	readonly fieldName?: string
	/** Names the direct schema or field option. */
	readonly optionName: string
	/** Gives diagnostics one stable path into the final logical graph. */
	readonly path: string
	/** Explains both the option contract owner and the final value contributor. */
	readonly provenance: SchemaOptionProvenance
	/** Distinguishes direct schema options from direct field options. */
	readonly scope: 'field' | 'schema'
	/** Carries the normalized immutable option snapshot. */
	readonly value: TValue
}

/** Describes optional Runtime compilation owned by an application capability. */
export interface SchemaOptionRuntimeCompiler<
	TValue extends JsonValue = JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly requirement: TRequirement
	readonly compile: (
		context: SchemaOptionRuntimeCompilationContext<TValue, TRequirement>,
	) => undefined
}

/** Defines one direct schema or field option owned by an installed plugin. */
export interface SchemaOptionDefinition<
	TValue extends JsonValue = JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly normalize: (value: unknown, path: string) => TValue
	readonly protocolVersion: number
	readonly runtime?: SchemaOptionRuntimeCompiler<TValue, TRequirement>
	readonly typegen: SchemaOptionTypegenDescriptor
}

const schemaOptionDefinitions = new WeakSet<object>()
const optionDefinitionKeys = new Set([
	'normalize',
	'protocolVersion',
	'runtime',
	'typegen',
])
const optionTypegenKeys = new Set(['module', 'type'])
const optionRuntimeKeys = new Set(['compile', 'requirement'])

const assertKnownKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} key: ${String(unknownKey)}`)
	}
}

const normalizeTypegenDescriptor = (
	value: unknown,
): SchemaOptionTypegenDescriptor => {
	if (!isPlainRecord(value)) {
		throw new TypeError('Schema option typegen must be a plain object')
	}

	assertKnownKeys(value, optionTypegenKeys, 'schema option typegen')
	assertNonEmptyString(value.module, 'Schema option typegen.module')
	assertNonEmptyString(value.type, 'Schema option typegen.type')

	if (value.module.trim() !== value.module || /\s/u.test(value.module)) {
		throw new TypeError(
			'Schema option typegen.module must be a stable module specifier',
		)
	}

	if (!/^[$A-Z_a-z][$\w]*$/u.test(value.type)) {
		throw new TypeError(
			'Schema option typegen.type must be a TypeScript export identifier',
		)
	}

	return immutableRecord({ module: value.module, type: value.type })
}

/** Creates one nominal option definition shared by schema and field namespaces. */
export const defineSchemaOption = <
	const TValue extends JsonValue,
	const TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
>(
	definition: SchemaOptionDefinition<TValue, TRequirement>,
): SchemaOptionDefinition => {
	if (!isPlainRecord(definition)) {
		throw new TypeError('Schema option definition must be a plain object')
	}

	assertKnownKeys(definition, optionDefinitionKeys, 'schema option definition')

	if (
		!Number.isSafeInteger(definition.protocolVersion) ||
		definition.protocolVersion < 1
	) {
		throw new RangeError(
			'Schema option protocolVersion must be a positive safe integer',
		)
	}

	if (typeof definition.normalize !== 'function') {
		throw new TypeError('Schema option normalize must be a function')
	}

	const runtime = definition.runtime
	if (runtime !== undefined) {
		if (!isPlainRecord(runtime)) {
			throw new TypeError('Schema option runtime must be a plain object')
		}
		assertKnownKeys(runtime, optionRuntimeKeys, 'schema option runtime')
		if (typeof runtime.compile !== 'function') {
			throw new TypeError('Schema option runtime.compile must be a function')
		}
		const untrustedRequirement: unknown = runtime.requirement
		assertCapabilityRequirement(
			untrustedRequirement,
			'Schema option runtime.requirement',
		)
		if (untrustedRequirement.token.lifetime !== 'application') {
			throw new TypeError(
				'Schema option runtime.requirement must target an application capability',
			)
		}
		if (untrustedRequirement.phase !== 'materialization') {
			throw new TypeError(
				'Schema option runtime.requirement must use the materialization phase',
			)
		}
	}

	const normalized: SchemaOptionDefinition = immutableRecord({
		normalize: definition.normalize,
		protocolVersion: definition.protocolVersion,
		...(runtime === undefined
			? {}
			: {
					runtime: immutableRecord({
						compile: (
							context: SchemaOptionRuntimeCompilationContext<JsonValue>,
						): undefined => {
							const contextSnapshot = immutableRecord({
								...context,
								capability:
									context.capability as RequirementConsumerValue<TRequirement>,
								value: context.value as TValue,
							})
							const compile: (input: typeof contextSnapshot) => unknown =
								runtime.compile
							const result = compile(contextSnapshot)
							if (result !== undefined) {
								throw new TypeError(
									'Schema option Runtime compiler must return undefined',
								)
							}
							return undefined
						},
						requirement: runtime.requirement,
					}),
				}),
		typegen: normalizeTypegenDescriptor(definition.typegen),
	})

	schemaOptionDefinitions.add(normalized)

	return normalized
}

/** Selects schemas through callback-free facts from the prior logical graph. */
export interface SchemaSelectorOptions {
	readonly className?: string
	readonly field?: Readonly<{ readonly kind?: string; readonly name: string }>
	readonly option?: Readonly<{
		readonly equals: JsonValue
		readonly name: string
		readonly path?: readonly string[]
	}>
	readonly owner?: SchemaContributionOwnerReference
}

/** Represents one immutable selection resolved once before its owner's patches. */
export interface SchemaSelection {
	readonly selector: SchemaSelectorOptions
}

const schemaSelections = new WeakSet<object>()

/** Adds one plugin-owned field to every frozen target schema. */
export interface AddSchemaFieldOperation {
	readonly contributionId: string
	readonly field: GenericField
	readonly kind: 'field:add'
	readonly name: string
}

/** Adds one plugin-owned index to every frozen target schema. */
export interface AddSchemaIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexOptions
	readonly kind: 'index:add'
}

/** Pins a transform to the exact prior owner, contribution, and logical shape. */
export interface ExistingSchemaContributionTarget<TExpected> {
	readonly contributionId: string
	readonly expected: TExpected
	readonly owner: SchemaContributionOwnerReference
}

/** Replaces one ordinary field without changing the schema identity. */
export interface ReplaceSchemaFieldOperation {
	readonly contributionId: string
	readonly field: GenericField
	readonly kind: 'field:replace'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<GenericField>
}

/** Renames one ordinary field while retaining explicit migration intent for later bridges. */
export interface RenameSchemaFieldOperation {
	readonly contributionId: string
	readonly from: string
	readonly kind: 'field:rename'
	readonly target: ExistingSchemaContributionTarget<GenericField>
	readonly to: string
}

/** Removes one ordinary logical field without implying physical data deletion. */
export interface RemoveSchemaFieldOperation {
	readonly contributionId: string
	readonly kind: 'field:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<GenericField>
}

/** Adds or exactly replaces one plugin-defined direct schema option value. */
export interface SetSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:set'
	readonly name: string
	readonly target?: ExistingSchemaContributionTarget<JsonValue>
	readonly value: unknown
}

/** Removes one exact plugin-defined direct schema option value. */
export interface RemoveSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<JsonValue>
}

/** Adds or exactly replaces one plugin-defined direct field option value. */
export interface SetSchemaFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:set'
	readonly name: string
	readonly target?: ExistingSchemaContributionTarget<JsonValue>
	readonly value: unknown
}

/** Removes one exact plugin-defined direct field option value. */
export interface RemoveSchemaFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<JsonValue>
}

/** Replaces one exact normalized schema index. */
export interface ReplaceSchemaIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexOptions
	readonly kind: 'index:replace'
	readonly target: ExistingSchemaContributionTarget<SchemaIndexDefinition>
}

/** Removes one exact normalized schema index. */
export interface RemoveSchemaIndexOperation {
	readonly contributionId: string
	readonly kind: 'index:remove'
	readonly target: ExistingSchemaContributionTarget<SchemaIndexDefinition>
}

/** Adds one ordered schema extension and its declared fields. */
export interface AddSchemaExtensionOperation {
	readonly contributionId: string
	readonly extension: SchemaExtension<string, object>
	readonly kind: 'extension:add'
}

/** Replaces one exact ordered schema extension. */
export interface ReplaceSchemaExtensionOperation {
	readonly contributionId: string
	readonly extension: SchemaExtension<string, object>
	readonly kind: 'extension:replace'
	readonly target: ExistingSchemaContributionTarget<
		SchemaExtension<string, object>
	>
}

/** Removes one exact ordered schema extension without inferring storage cleanup. */
export interface RemoveSchemaExtensionOperation {
	readonly contributionId: string
	readonly kind: 'extension:remove'
	readonly target: ExistingSchemaContributionTarget<
		SchemaExtension<string, object>
	>
}

/** Adds one portable versioned schema constraint. */
export interface AddSchemaConstraintOperation {
	readonly constraint: SchemaConstraintDefinition
	readonly contributionId: string
	readonly kind: 'constraint:add'
}

/** Replaces one exact portable schema constraint. */
export interface ReplaceSchemaConstraintOperation {
	readonly constraint: SchemaConstraintDefinition
	readonly contributionId: string
	readonly kind: 'constraint:replace'
	readonly target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>
}

/** Removes one exact logical constraint without physical cleanup. */
export interface RemoveSchemaConstraintOperation {
	readonly contributionId: string
	readonly kind: 'constraint:remove'
	readonly target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>
}

/** Lists the callback-free patch operations implemented by the logical compiler. */
export type SchemaPatchOperation =
	| AddSchemaConstraintOperation
	| AddSchemaExtensionOperation
	| AddSchemaFieldOperation
	| AddSchemaIndexOperation
	| RemoveSchemaFieldOptionOperation
	| RemoveSchemaConstraintOperation
	| RemoveSchemaFieldOperation
	| RemoveSchemaExtensionOperation
	| RemoveSchemaIndexOperation
	| RemoveSchemaOptionOperation
	| RenameSchemaFieldOperation
	| ReplaceSchemaFieldOperation
	| ReplaceSchemaConstraintOperation
	| ReplaceSchemaExtensionOperation
	| ReplaceSchemaIndexOperation
	| SetSchemaFieldOptionOperation
	| SetSchemaOptionOperation

const schemaPatchOperations = new WeakSet<object>()

/** Declares one immutable field addition for use with `schemas.patch()`. */
export const addSchemaField = (
	options: Omit<AddSchemaFieldOperation, 'kind'>,
): AddSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field addition must be a plain object')
	}

	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)

	const operation = immutableRecord({ ...options, kind: 'field:add' as const })
	schemaPatchOperations.add(operation)

	return operation
}

/** Declares one immutable index addition for use with `schemas.patch()`. */
export const addSchemaIndex = (
	options: Omit<AddSchemaIndexOperation, 'kind' | 'index'> & {
		readonly fields: readonly [string, string, ...string[]]
		readonly unique?: boolean
	},
): AddSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index addition must be a plain object')
	}

	assertNonEmptyString(options.contributionId, 'Schema index contributionId')
	const index = immutableRecord({
		fields: immutableArray(options.fields),
		...(options.unique === undefined ? {} : { unique: options.unique }),
	})
	const operation = immutableRecord({
		contributionId: options.contributionId,
		index,
		kind: 'index:add' as const,
	})
	schemaPatchOperations.add(operation)

	return operation
}

const normalizeOwnerReference = (
	owner: unknown,
	path: string,
): SchemaContributionOwnerReference => {
	const untrustedOwner: unknown = owner
	if (!isPlainRecord(untrustedOwner)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	if (untrustedOwner.kind === 'application') {
		assertKnownKeys(untrustedOwner, new Set(['kind']), path)
		return applicationSchemaContributionOwner
	}

	if (untrustedOwner.kind === 'core') {
		assertKnownKeys(untrustedOwner, new Set(['kind']), path)
		return coreSchemaContributionOwner
	}

	if (untrustedOwner.kind !== 'plugin') {
		throw new TypeError(`${path}.kind must be application, core, or plugin`)
	}

	assertKnownKeys(
		untrustedOwner,
		new Set(['instanceId', 'kind', 'pluginId']),
		path,
	)
	assertNonEmptyString(untrustedOwner.pluginId, `${path}.pluginId`)
	if (untrustedOwner.instanceId !== undefined) {
		assertNonEmptyString(untrustedOwner.instanceId, `${path}.instanceId`)
	}

	return immutableRecord({
		kind: 'plugin',
		pluginId: untrustedOwner.pluginId,
		...(untrustedOwner.instanceId === undefined
			? {}
			: { instanceId: untrustedOwner.instanceId }),
	})
}

const normalizeFieldTarget = (
	target: ExistingSchemaContributionTarget<GenericField>,
	path: string,
): ExistingSchemaContributionTarget<GenericField> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	assertFieldDefinition(untrustedTarget.expected, `${path}.expected`)

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: untrustedTarget.expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const normalizeJsonTarget = (
	target: ExistingSchemaContributionTarget<JsonValue>,
	path: string,
): ExistingSchemaContributionTarget<JsonValue> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: snapshotJsonValue(untrustedTarget.expected, `${path}.expected`),
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const normalizeIndexTarget = (
	target: ExistingSchemaContributionTarget<SchemaIndexDefinition>,
	path: string,
): ExistingSchemaContributionTarget<SchemaIndexDefinition> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	if (!isPlainRecord(untrustedTarget.expected)) {
		throw new TypeError(`${path}.expected must be a plain object`)
	}
	const expectedFields = untrustedTarget.expected.fields
	if (!isUnknownArray(expectedFields) || expectedFields.length === 0) {
		throw new TypeError(`${path}.expected.fields must be a non-empty list`)
	}
	const fields = expectedFields.map((field, index) => {
		assertNonEmptyString(field, `${path}.expected.fields[${String(index)}]`)
		return field
	})
	if (typeof untrustedTarget.expected.unique !== 'boolean') {
		throw new TypeError(`${path}.expected.unique must be a boolean`)
	}

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: immutableRecord({
			fields: immutableArray(fields) as readonly [string, ...string[]],
			unique: untrustedTarget.expected.unique,
		}),
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineFieldTransform = <
	TOperation extends
		| RemoveSchemaFieldOperation
		| RenameSchemaFieldOperation
		| ReplaceSchemaFieldOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

/** Declares one exact ordinary field replacement. */
export const replaceSchemaField = (
	options: Omit<ReplaceSchemaFieldOperation, 'kind'>,
): ReplaceSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field replacement must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')
	assertFieldDefinition(options.field, `Schema field ${options.name}`)

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field:replace',
			name: options.name,
			target: normalizeFieldTarget(options.target, 'Schema field target'),
		}),
	)
}

/** Declares one exact ordinary field rename. */
export const renameSchemaField = (
	options: Omit<RenameSchemaFieldOperation, 'kind'>,
): RenameSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field rename must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.from, 'Schema field source name')
	assertNonEmptyString(options.to, 'Schema field target name')

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			from: options.from,
			kind: 'field:rename',
			target: normalizeFieldTarget(options.target, 'Schema field target'),
			to: options.to,
		}),
	)
}

/** Declares one exact ordinary field removal from the logical graph. */
export const removeSchemaField = (
	options: Omit<RemoveSchemaFieldOperation, 'kind'>,
): RemoveSchemaFieldOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema field contributionId')
	assertNonEmptyString(options.name, 'Schema field name')

	return defineFieldTransform(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'field:remove',
			name: options.name,
			target: normalizeFieldTarget(options.target, 'Schema field target'),
		}),
	)
}

const defineOptionOperation = <
	TOperation extends
		| RemoveSchemaFieldOptionOperation
		| RemoveSchemaOptionOperation
		| SetSchemaFieldOptionOperation
		| SetSchemaOptionOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

/** Declares one direct schema option addition or exact replacement. */
export const setSchemaOption = (
	options: Omit<SetSchemaOptionOperation, 'kind'>,
): SetSchemaOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema option patch must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'schema-option:set',
			name: options.name,
			...(options.target === undefined
				? {}
				: {
						target: normalizeJsonTarget(options.target, 'Schema option target'),
					}),
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

/** Declares one exact direct schema option removal. */
export const removeSchemaOption = (
	options: Omit<RemoveSchemaOptionOperation, 'kind'>,
): RemoveSchemaOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema option removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema option contributionId')
	assertNonEmptyString(options.name, 'Schema option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'schema-option:remove',
			name: options.name,
			target: normalizeJsonTarget(options.target, 'Schema option target'),
		}),
	)
}

/** Declares one direct field option addition or exact replacement. */
export const setSchemaFieldOption = (
	options: Omit<SetSchemaFieldOptionOperation, 'kind'>,
): SetSchemaFieldOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field option patch must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema field option contributionId',
	)
	assertNonEmptyString(options.field, 'Schema field option field')
	assertNonEmptyString(options.name, 'Schema field option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field-option:set',
			name: options.name,
			...(options.target === undefined
				? {}
				: {
						target: normalizeJsonTarget(
							options.target,
							'Schema field option target',
						),
					}),
			value: snapshotCapturedOptionValue(options.value),
		}),
	)
}

/** Declares one exact direct field option removal. */
export const removeSchemaFieldOption = (
	options: Omit<RemoveSchemaFieldOptionOperation, 'kind'>,
): RemoveSchemaFieldOptionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema field option removal must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema field option contributionId',
	)
	assertNonEmptyString(options.field, 'Schema field option field')
	assertNonEmptyString(options.name, 'Schema field option name')

	return defineOptionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			field: options.field,
			kind: 'field-option:remove',
			name: options.name,
			target: normalizeJsonTarget(options.target, 'Schema field option target'),
		}),
	)
}

const defineIndexTransform = <
	TOperation extends ReplaceSchemaIndexOperation | RemoveSchemaIndexOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

/** Declares one exact composite index replacement. */
export const replaceSchemaIndex = (
	options: Omit<ReplaceSchemaIndexOperation, 'kind' | 'index'> & {
		readonly fields: readonly [string, string, ...string[]]
		readonly unique?: boolean
	},
): ReplaceSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index replacement must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema index contributionId')

	return defineIndexTransform(
		immutableRecord({
			contributionId: options.contributionId,
			index: immutableRecord({
				fields: immutableArray(options.fields),
				...(options.unique === undefined ? {} : { unique: options.unique }),
			}),
			kind: 'index:replace',
			target: normalizeIndexTarget(options.target, 'Schema index target'),
		}),
	)
}

/** Declares one exact normalized index removal. */
export const removeSchemaIndex = (
	options: Omit<RemoveSchemaIndexOperation, 'kind'>,
): RemoveSchemaIndexOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema index removal must be a plain object')
	}
	assertNonEmptyString(options.contributionId, 'Schema index contributionId')

	return defineIndexTransform(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'index:remove',
			target: normalizeIndexTarget(options.target, 'Schema index target'),
		}),
	)
}

const normalizeSchemaExtensionTarget = (
	target: ExistingSchemaContributionTarget<SchemaExtension<string, object>>,
	path: string,
): ExistingSchemaContributionTarget<SchemaExtension<string, object>> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	const untrustedExpected: unknown = untrustedTarget.expected
	if (
		!isPlainRecord(untrustedExpected) ||
		untrustedExpected.scope !== 'schema'
	) {
		throw new TypeError(`${path}.expected must be a schema extension`)
	}
	const [expected] = defineExtensions([
		untrustedExpected as unknown as SchemaExtension<string, object>,
	])

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineExtensionOperation = <
	TOperation extends
		| AddSchemaExtensionOperation
		| RemoveSchemaExtensionOperation
		| ReplaceSchemaExtensionOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

/** Declares one ordered schema extension addition. */
export const addSchemaExtension = (
	options: Omit<AddSchemaExtensionOperation, 'kind'>,
): AddSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension addition must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)
	const untrustedExtension: unknown = options.extension
	if (
		!isPlainRecord(untrustedExtension) ||
		untrustedExtension.scope !== 'schema'
	) {
		throw new TypeError('Schema extension addition requires a schema extension')
	}
	const [extension] = defineExtensions([
		untrustedExtension as unknown as SchemaExtension<string, object>,
	])

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			extension,
			kind: 'extension:add',
		}),
	)
}

/** Declares one exact ordered schema extension replacement. */
export const replaceSchemaExtension = (
	options: Omit<ReplaceSchemaExtensionOperation, 'kind'>,
): ReplaceSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension replacement must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)
	const untrustedExtension: unknown = options.extension
	if (
		!isPlainRecord(untrustedExtension) ||
		untrustedExtension.scope !== 'schema'
	) {
		throw new TypeError(
			'Schema extension replacement requires a schema extension',
		)
	}
	const [extension] = defineExtensions([
		untrustedExtension as unknown as SchemaExtension<string, object>,
	])

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			extension,
			kind: 'extension:replace',
			target: normalizeSchemaExtensionTarget(
				options.target,
				'Schema extension target',
			),
		}),
	)
}

/** Declares one exact ordered schema extension removal. */
export const removeSchemaExtension = (
	options: Omit<RemoveSchemaExtensionOperation, 'kind'>,
): RemoveSchemaExtensionOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema extension removal must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema extension contributionId',
	)

	return defineExtensionOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'extension:remove',
			target: normalizeSchemaExtensionTarget(
				options.target,
				'Schema extension target',
			),
		}),
	)
}

const normalizeSchemaConstraintTarget = (
	target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>,
	path: string,
): ExistingSchemaContributionTarget<SchemaConstraintDefinition> => {
	const untrustedTarget: unknown = target
	if (!isPlainRecord(untrustedTarget)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(
		untrustedTarget,
		new Set(['contributionId', 'expected', 'owner']),
		path,
	)
	assertNonEmptyString(untrustedTarget.contributionId, `${path}.contributionId`)
	if (
		!isPlainRecord(untrustedTarget.expected) ||
		!isSchemaConstraintDefinition(untrustedTarget.expected)
	) {
		throw new TypeError(
			`${path}.expected must be created by defineSchemaConstraint`,
		)
	}

	return immutableRecord({
		contributionId: untrustedTarget.contributionId,
		expected: untrustedTarget.expected,
		owner: normalizeOwnerReference(untrustedTarget.owner, `${path}.owner`),
	})
}

const defineConstraintOperation = <
	TOperation extends
		| AddSchemaConstraintOperation
		| RemoveSchemaConstraintOperation
		| ReplaceSchemaConstraintOperation,
>(
	operation: TOperation,
): TOperation => {
	schemaPatchOperations.add(operation)
	return operation
}

/** Declares one portable schema constraint addition. */
export const addSchemaConstraint = (
	options: Omit<AddSchemaConstraintOperation, 'kind'>,
): AddSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint addition must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema constraint contributionId',
	)
	if (!isSchemaConstraintDefinition(options.constraint)) {
		throw new TypeError(
			'Schema constraint must be created by defineSchemaConstraint',
		)
	}

	return defineConstraintOperation(
		immutableRecord({
			constraint: options.constraint,
			contributionId: options.contributionId,
			kind: 'constraint:add',
		}),
	)
}

/** Declares one exact portable schema constraint replacement. */
export const replaceSchemaConstraint = (
	options: Omit<ReplaceSchemaConstraintOperation, 'kind'>,
): ReplaceSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint replacement must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema constraint contributionId',
	)
	if (!isSchemaConstraintDefinition(options.constraint)) {
		throw new TypeError(
			'Schema constraint must be created by defineSchemaConstraint',
		)
	}

	return defineConstraintOperation(
		immutableRecord({
			constraint: options.constraint,
			contributionId: options.contributionId,
			kind: 'constraint:replace',
			target: normalizeSchemaConstraintTarget(
				options.target,
				'Schema constraint target',
			),
		}),
	)
}

/** Declares one exact portable schema constraint removal. */
export const removeSchemaConstraint = (
	options: Omit<RemoveSchemaConstraintOperation, 'kind'>,
): RemoveSchemaConstraintOperation => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Schema constraint removal must be a plain object')
	}
	assertNonEmptyString(
		options.contributionId,
		'Schema constraint contributionId',
	)

	return defineConstraintOperation(
		immutableRecord({
			contributionId: options.contributionId,
			kind: 'constraint:remove',
			target: normalizeSchemaConstraintTarget(
				options.target,
				'Schema constraint target',
			),
		}),
	)
}

/** Registers schemas, direct option namespaces, selectors, and immutable patches. */
export interface PluginSchemaDeclarationRegistrar {
	add(options: {
		readonly contributionId: string
		readonly schema: SchemaDefinition
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
	}): void
	defineOptions(options: {
		readonly contributionId: string
		readonly field?: Readonly<Record<string, SchemaOptionDefinition>>
		readonly schema?: Readonly<Record<string, SchemaOptionDefinition>>
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
	}): void
	patch(options: {
		readonly operations: readonly SchemaPatchOperation[]
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
		readonly targets: SchemaSelection
	}): void
	select(selector: SchemaSelectorOptions): SchemaSelection
}

interface OwnedOptionDefinition {
	readonly contributionId: string
	readonly definition: SchemaOptionDefinition
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

interface OptionDefinitionIndex {
	readonly field: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
	readonly schema: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
}

type ResolvedFieldOptions = WeakMap<
	object,
	Map<PluginSchemaContributionOwner | undefined, GenericField>
>

export interface PluginDeclarationFailureDiagnostic {
	readonly contributionId?: string
	readonly instanceId?: string
	readonly owners?: readonly string[]
	readonly path?: string
	readonly pluginId?: string
}

class PluginDeclarationDiagnosticError extends TypeError {
	readonly diagnostic: PluginDeclarationFailureDiagnostic

	constructor(
		message: string,
		diagnostic: PluginDeclarationFailureDiagnostic,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.name = 'PluginDeclarationDiagnosticError'
		this.diagnostic = immutableRecord(diagnostic)
	}
}

const pluginDeclarationDiagnostic = (
	owner: PluginSchemaContributionOwner,
	path: string,
	contributionId?: string,
): PluginDeclarationFailureDiagnostic =>
	immutableRecord({
		...(contributionId === undefined ? {} : { contributionId }),
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		path,
		pluginId: owner.pluginId,
	})

export const attachPluginDeclarationDiagnostic = (
	cause: unknown,
	owner: PluginSchemaContributionOwner,
	path: string,
	contributionId?: string,
): PluginDeclarationDiagnosticError => {
	if (cause instanceof PluginDeclarationDiagnosticError) return cause

	return new PluginDeclarationDiagnosticError(
		cause instanceof Error
			? cause.message
			: 'Unknown plugin declaration failure',
		pluginDeclarationDiagnostic(owner, path, contributionId),
		{ cause },
	)
}

const samePluginOwner = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId && left.instanceId === right.instanceId

const resolveOptionDefinition = (
	definitions: ReadonlyMap<string, readonly OwnedOptionDefinition[]>,
	name: string,
	path: string,
	preferredOwner?: PluginSchemaContributionOwner,
): OwnedOptionDefinition | undefined => {
	const candidates = definitions.get(name) ?? []
	if (candidates.length === 0) return undefined
	if (candidates.length === 1) return candidates[0]

	if (preferredOwner !== undefined) {
		const owned = candidates.filter((candidate) =>
			samePluginOwner(candidate.owner, preferredOwner),
		)
		if (owned.length === 1) return owned[0]
	}

	const owners = immutableArray(
		candidates.map(({ owner }) =>
			owner.instanceId === undefined
				? owner.pluginId
				: `${owner.pluginId}#${owner.instanceId}`,
		),
	)
	throw new PluginDeclarationDiagnosticError(
		`Ambiguous ${candidates[0]?.scope ?? 'plugin'} option owner for "${name}": ${owners.join(' and ')}`,
		immutableRecord({ owners, path }),
	)
}

interface PendingSchemaOptionRuntimeCompilation {
	readonly context: Omit<
		SchemaOptionRuntimeCompilationContext<JsonValue>,
		'capability'
	>
	readonly owner: PluginSchemaContributionOwner
	readonly runtime: SchemaOptionRuntimeCompiler
}

interface OwnedSchemaAddition {
	readonly contributionId: string
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

interface OwnedSchemaPatch {
	readonly operations: readonly SchemaPatchOperation[]
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly targets: SchemaSelection
}

interface SchemaDeclarationBatch {
	readonly additions: readonly OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly canTransform: boolean
	readonly options: readonly OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: readonly OwnedSchemaPatch[]
}

interface MutableSchemaDeclarationBatch {
	readonly additions: OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly canTransform: boolean
	readonly options: OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: OwnedSchemaPatch[]
}

const emptyStaticOptions: Readonly<Record<string, JsonValue>> = immutableRecord(
	{},
)

const snapshotStaticOptions = (
	options: Readonly<Record<string, JsonValue>> | undefined,
	path: string,
): Readonly<Record<string, JsonValue>> => {
	if (options === undefined) return emptyStaticOptions

	const snapshot = snapshotJsonValue(options, path)
	if (!isPlainRecord(snapshot)) {
		throw new TypeError(`${path} must be a JSON object`)
	}

	return snapshot
}

const normalizeSelector = (
	selector: SchemaSelectorOptions,
): SchemaSelectorOptions => {
	const untrustedSelector: unknown = selector
	if (!isPlainRecord(untrustedSelector)) {
		throw new TypeError('Schema selector must be a plain object')
	}

	assertKnownKeys(
		untrustedSelector,
		new Set(['className', 'field', 'option', 'owner']),
		'schema selector',
	)

	const className = untrustedSelector.className
	if (className !== undefined) {
		assertNonEmptyString(className, 'Schema selector className')
	}

	const fieldInput = untrustedSelector.field
	let field: SchemaSelectorOptions['field']
	if (fieldInput !== undefined) {
		if (!isPlainRecord(fieldInput)) {
			throw new TypeError('Schema selector field must be a plain object')
		}
		assertKnownKeys(
			fieldInput,
			new Set(['kind', 'name']),
			'schema selector field',
		)
		assertNonEmptyString(fieldInput.name, 'Schema selector field.name')
		if (fieldInput.kind !== undefined) {
			assertNonEmptyString(fieldInput.kind, 'Schema selector field.kind')
		}
		field = immutableRecord({
			name: fieldInput.name,
			...(fieldInput.kind === undefined ? {} : { kind: fieldInput.kind }),
		})
	}

	const optionInput = untrustedSelector.option
	let option: SchemaSelectorOptions['option']
	if (optionInput !== undefined) {
		if (!isPlainRecord(optionInput)) {
			throw new TypeError('Schema selector option must be a plain object')
		}
		assertKnownKeys(
			optionInput,
			new Set(['equals', 'name', 'path']),
			'schema selector option',
		)
		assertNonEmptyString(optionInput.name, 'Schema selector option.name')
		if (optionInput.path !== undefined && !isUnknownArray(optionInput.path)) {
			throw new TypeError('Schema selector option.path must be a list')
		}
		const path = optionInput.path
		const normalizedPath =
			path === undefined
				? undefined
				: immutableArray(
						path.map((segment, index) => {
							assertNonEmptyString(
								segment,
								`Schema selector option.path[${String(index)}]`,
							)
							return segment
						}),
					)
		option = immutableRecord({
			equals: snapshotJsonValue(
				optionInput.equals,
				'Schema selector option.equals',
			),
			name: optionInput.name,
			...(normalizedPath === undefined ? {} : { path: normalizedPath }),
		})
	}

	const ownerInput = untrustedSelector.owner
	let owner: SchemaContributionOwnerReference | undefined
	if (ownerInput !== undefined) {
		if (!isPlainRecord(ownerInput)) {
			throw new TypeError('Schema selector owner must be a plain object')
		}
		if (ownerInput.kind === 'application') {
			assertKnownKeys(ownerInput, new Set(['kind']), 'schema selector owner')
			owner = applicationOwner
		} else if (ownerInput.kind === 'plugin') {
			assertKnownKeys(
				ownerInput,
				new Set(['instanceId', 'kind', 'pluginId']),
				'schema selector owner',
			)
			assertNonEmptyString(
				ownerInput.pluginId,
				'Schema selector owner.pluginId',
			)
			if (ownerInput.instanceId !== undefined) {
				assertNonEmptyString(
					ownerInput.instanceId,
					'Schema selector owner.instanceId',
				)
			}
			owner = immutableRecord({
				kind: 'plugin',
				pluginId: ownerInput.pluginId,
				...(ownerInput.instanceId === undefined
					? {}
					: { instanceId: ownerInput.instanceId }),
			})
		} else {
			throw new TypeError(
				'Schema selector owner.kind must be application or plugin',
			)
		}
	}

	return immutableRecord({
		...(className === undefined ? {} : { className }),
		...(field === undefined ? {} : { field }),
		...(option === undefined ? {} : { option }),
		...(owner === undefined ? {} : { owner }),
	})
}

const applicationOwner: ApplicationSchemaContributionOwner =
	applicationSchemaContributionOwner

const readDeclaredRuntimeCapability = (
	reader: PluginCapabilityReader,
	requirement: SchemaOptionRuntimeRequirement,
): unknown =>
	requirement.optional
		? reader.get(
				requirement as CapabilityRequirement<
					CapabilityToken,
					true,
					string,
					'materialization'
				>,
			)
		: reader.get(
				requirement as CapabilityRequirement<
					CapabilityToken,
					false,
					string,
					'materialization'
				>,
			)

/** Collects owner-bound declarations and compiles them after every callback succeeds. */
export class SchemaDeclarationRegistry {
	readonly #batches: SchemaDeclarationBatch[] = []
	#closed = false
	#runtimeCompilations:
		readonly PendingSchemaOptionRuntimeCompilation[] | undefined
	#runtimeCompilationState: 'failed' | 'idle' | 'running' | 'succeeded' = 'idle'
	#compiledProvenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined

	beginPluginDeclaration(
		owner: PluginSchemaContributionOwner,
		privileges: Readonly<{
			declare: boolean
			requirements: readonly CapabilityRequirement[]
			transform: boolean
		}>,
	): Readonly<{
		close(): void
		commit(): void
		registrar: PluginSchemaDeclarationRegistrar
	}> {
		if (this.#closed) {
			throw new TypeError('Schema declaration registry is already closed')
		}

		const batch: MutableSchemaDeclarationBatch = {
			additions: [],
			canDeclare: privileges.declare,
			canTransform: privileges.transform,
			options: [],
			owner,
			patches: [],
		}
		let open = true
		const assertOpen = (): void => {
			if (!open) {
				throw new TypeError(
					'Plugin schema declaration facade is already closed',
				)
			}
		}
		const assertDeclare = (): void => {
			assertOpen()
			if (!batch.canDeclare) {
				throw new TypeError('schema:declare is required for this declaration')
			}
		}
		const registrar: PluginSchemaDeclarationRegistrar = immutableRecord({
			add: (options): void => {
				assertDeclare()
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema addition must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'Schema addition contributionId',
				)
				batch.additions.push(
					immutableRecord({
						contributionId: options.contributionId,
						owner,
						schema: options.schema,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'Schema addition staticOptions',
						),
					}),
				)
			},
			defineOptions: (options): void => {
				assertDeclare()
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema option namespace must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'Schema option namespace contributionId',
				)
				const staticOptions = snapshotStaticOptions(
					options.staticOptions,
					'Schema option namespace staticOptions',
				)
				for (const scope of ['schema', 'field'] as const) {
					const definitions = options[scope]
					if (definitions === undefined) continue
					if (!isPlainRecord(definitions)) {
						throw new TypeError(
							`Schema option namespace ${scope} must be a plain object`,
						)
					}
					for (const [name, definition] of Object.entries(definitions)) {
						assertNonEmptyString(name, `Schema ${scope} option name`)
						if (!schemaOptionDefinitions.has(definition)) {
							throw new TypeError(
								`Schema ${scope} option ${name} must be created by defineSchemaOption`,
							)
						}
						if (
							definition.runtime !== undefined &&
							!privileges.requirements.some(
								(requirement) =>
									requirement === definition.runtime?.requirement,
							)
						) {
							throw new TypeError(
								`Schema ${scope} option ${name} uses an undeclared Runtime capability requirement`,
							)
						}
						batch.options.push(
							immutableRecord({
								contributionId: `${options.contributionId}:${scope}:${name}`,
								definition,
								name,
								owner,
								scope,
								staticOptions,
							}),
						)
					}
				}
			},
			patch: (options): void => {
				assertOpen()
				if (!batch.canDeclare && !batch.canTransform) {
					throw new TypeError(
						'schema:declare or schema:transform is required for patches',
					)
				}
				if (!isPlainRecord(options)) {
					throw new TypeError('Schema patch must be a plain object')
				}
				if (!schemaSelections.has(options.targets)) {
					throw new TypeError(
						'Schema patch targets must be created by schemas.select',
					)
				}
				if (!isUnknownArray(options.operations)) {
					throw new TypeError('Schema patch operations must be a list')
				}
				for (const operation of options.operations) {
					if (!schemaPatchOperations.has(operation)) {
						throw new TypeError(
							'Schema patch operation must be created by a Core patch factory',
						)
					}
					const requiresTransform =
						operation.kind === 'field:replace' ||
						operation.kind === 'field:rename' ||
						operation.kind === 'field:remove' ||
						operation.kind === 'index:replace' ||
						operation.kind === 'index:remove' ||
						operation.kind === 'extension:replace' ||
						operation.kind === 'extension:remove' ||
						operation.kind === 'constraint:replace' ||
						operation.kind === 'constraint:remove' ||
						operation.kind === 'schema-option:remove' ||
						operation.kind === 'field-option:remove' ||
						(operation.kind === 'schema-option:set' &&
							operation.target !== undefined) ||
						(operation.kind === 'field-option:set' &&
							operation.target !== undefined)
					if (requiresTransform && !batch.canTransform) {
						throw new TypeError(
							'schema:transform is required for replacement, rename, or removal',
						)
					}
					if (!requiresTransform && !batch.canDeclare) {
						throw new TypeError('schema:declare is required for additions')
					}
				}
				batch.patches.push(
					immutableRecord({
						operations: immutableArray(options.operations),
						owner,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'Schema patch staticOptions',
						),
						targets: options.targets,
					}),
				)
			},
			select: (selector): SchemaSelection => {
				assertOpen()
				const selection = immutableRecord({
					selector: normalizeSelector(selector),
				})
				schemaSelections.add(selection)
				return selection
			},
		})

		return immutableRecord({
			close: (): void => {
				open = false
			},
			commit: (): void => {
				assertOpen()
				this.#batches.push(
					immutableRecord({
						...batch,
						additions: immutableArray(batch.additions),
						options: immutableArray(batch.options),
						patches: immutableArray(batch.patches),
					}),
				)
			},
			registrar,
		})
	}

	close(): void {
		this.#closed = true
	}

	schemaAdditions(): readonly SchemaDefinition[] {
		if (!this.#closed) {
			throw new TypeError('Schema declaration registry is not closed')
		}

		const contributionIds = new Map<
			string,
			readonly PluginSchemaContributionOwner[]
		>()
		const schemas: SchemaDefinition[] = []
		for (const batch of this.#batches) {
			for (const addition of batch.additions) {
				const prior = contributionIds.get(addition.contributionId) ?? []
				if (prior.some((owner) => samePluginOwner(owner, addition.owner))) {
					throw new PluginDeclarationDiagnosticError(
						`Duplicate schema contributionId: ${addition.contributionId}`,
						pluginDeclarationDiagnostic(
							addition.owner,
							addition.schema.className,
							addition.contributionId,
						),
					)
				}
				contributionIds.set(addition.contributionId, [...prior, addition.owner])
				schemas.push(addition.schema)
			}
		}

		return immutableArray(schemas)
	}

	compile(
		prepared: readonly PreparedSchemaCompilation[],
	): readonly PreparedSchemaCompilation[] {
		if (!this.#closed) {
			throw new TypeError('Schema declaration registry is not closed')
		}

		const optionDefinitions = this.#collectOptionDefinitions()
		const resolvedFields: ResolvedFieldOptions = new WeakMap()
		const additionsBySchema = new Map<SchemaDefinition, OwnedSchemaAddition>()
		for (const batch of this.#batches) {
			for (const addition of batch.additions) {
				additionsBySchema.set(addition.schema, addition)
			}
		}
		let candidates = prepared.map((candidate) => {
			const addition = additionsBySchema.get(candidate.schema)
			try {
				const resolved = resolveCandidateOptions(
					candidate,
					optionDefinitions,
					resolvedFields,
					addition?.owner,
				)
				return attachInitialContributionProvenance(
					resolved,
					addition,
					optionDefinitions,
				)
			} catch (cause: unknown) {
				if (addition === undefined) throw cause
				throw attachPluginDeclarationDiagnostic(
					cause,
					addition.owner,
					candidate.schema.className,
					addition.contributionId,
				)
			}
		})
		const addedSchemas = new Set(
			this.#batches.flatMap((batch) =>
				batch.additions.map(({ schema }) => schema),
			),
		)
		const visibleSchemas = new Set(
			candidates
				.filter(({ schema }) => !addedSchemas.has(schema))
				.map(({ schema }) => schema),
		)
		const owners = new Map<SchemaDefinition, SchemaContributionOwner>()
		for (const candidate of candidates) {
			if (!addedSchemas.has(candidate.schema)) {
				owners.set(candidate.schema, applicationOwner)
			}
		}

		for (const batch of this.#batches) {
			const frozenTargets = new Map<
				SchemaSelection,
				readonly SchemaDefinition[]
			>()
			for (const patch of batch.patches) {
				if (!frozenTargets.has(patch.targets)) {
					frozenTargets.set(
						patch.targets,
						immutableArray(
							candidates
								.filter((candidate) => {
									if (!visibleSchemas.has(candidate.schema)) return false
									try {
										return matchesSelector(
											candidate,
											owners.get(candidate.schema) ?? applicationOwner,
											patch.targets.selector,
										)
									} catch (cause: unknown) {
										throw attachPluginDeclarationDiagnostic(
											cause,
											patch.owner,
											candidate.schema.className,
											patch.operations.length === 1
												? patch.operations[0]?.contributionId
												: undefined,
										)
									}
								})
								.map(({ schema }) => schema),
						),
					)
				}
			}

			const additions = new Set(batch.additions.map(({ schema }) => schema))
			for (const schema of additions) {
				owners.set(schema, batch.owner)
				visibleSchemas.add(schema)
			}

			for (const patch of batch.patches) {
				const targets = frozenTargets.get(patch.targets) ?? []
				candidates = candidates.map((candidate) => {
					if (!targets.includes(candidate.schema)) return candidate
					try {
						return applyPatch(
							candidate,
							patch,
							optionDefinitions,
							resolvedFields,
						)
					} catch (cause: unknown) {
						throw attachPluginDeclarationDiagnostic(
							cause,
							patch.owner,
							candidate.schema.className,
							patch.operations.length === 1
								? patch.operations[0]?.contributionId
								: undefined,
						)
					}
				})
			}
		}

		this.#runtimeCompilations = this.#collectRuntimeCompilations(candidates)
		this.#compiledProvenance = new Map(
			candidates.map((candidate) => [
				candidate.schema.className,
				candidate.definition.provenance,
			]),
		)

		return immutableArray(candidates)
	}

	diagnoseFailure(error: unknown): PluginDeclarationFailureDiagnostic {
		if (error instanceof PluginDeclarationDiagnosticError) {
			return error.diagnostic
		}

		const className =
			isPlainRecord(error) && typeof error.className === 'string'
				? error.className
				: undefined
		if (className === undefined) return immutableRecord({})

		const provenance = this.#compiledProvenance?.get(className)
		const latestPatch = provenance?.patches.at(-1)?.provenance
		const source =
			latestPatch ??
			(provenance?.schema.owner.kind === 'plugin'
				? provenance.schema
				: undefined)
		if (source?.owner.kind === 'plugin') {
			return pluginDeclarationDiagnostic(
				source.owner,
				className,
				source.contributionId,
			)
		}

		for (const batch of this.#batches) {
			const addition = batch.additions.find(
				(candidate) => candidate.schema.className === className,
			)
			if (addition !== undefined) {
				return pluginDeclarationDiagnostic(
					addition.owner,
					className,
					addition.contributionId,
				)
			}
		}

		return immutableRecord({ path: className })
	}

	/** Executes used Runtime option compilers after capabilities exist and before setup. */
	runRuntimeCompilers(capabilities: ApplicationCapabilityHost): void {
		if (!this.#closed || this.#runtimeCompilations === undefined) {
			throw new TypeError(
				'Schema Runtime option compilers require completed static compilation',
			)
		}
		if (this.#runtimeCompilationState === 'succeeded') return
		if (this.#runtimeCompilationState !== 'idle') {
			throw new TypeError('Schema Runtime option compilation is unavailable')
		}

		this.#runtimeCompilationState = 'running'
		try {
			for (const compilation of this.#runtimeCompilations) {
				try {
					const capability = readDeclaredRuntimeCapability(
						capabilities.forPlugin(compilation.owner),
						compilation.runtime.requirement,
					)
					const context = immutableRecord({
						...compilation.context,
						capability,
					})
					const compile: (input: typeof context) => unknown =
						compilation.runtime.compile
					const result = compile(context)
					if (result !== undefined) {
						throw new TypeError(
							'Schema option Runtime compiler must return undefined',
						)
					}
				} catch (cause: unknown) {
					throw attachPluginDeclarationDiagnostic(
						cause,
						compilation.owner,
						compilation.context.path,
						compilation.context.provenance.definition.contributionId,
					)
				}
			}
			this.#runtimeCompilationState = 'succeeded'
		} catch (error: unknown) {
			this.#runtimeCompilationState = 'failed'
			throw error
		}
	}

	#collectRuntimeCompilations(
		candidates: readonly PreparedSchemaCompilation[],
	): readonly PendingSchemaOptionRuntimeCompilation[] {
		const compilations: PendingSchemaOptionRuntimeCompilation[] = []

		// Descriptor declaration order preserves plugin dependency and registration order.
		for (const batch of this.#batches) {
			for (const option of batch.options) {
				const runtime = option.definition.runtime
				if (runtime === undefined) continue

				for (const candidate of candidates) {
					if (option.scope === 'schema') {
						if (!Object.hasOwn(candidate.definition, option.name)) continue
						const provenance =
							candidate.definition.provenance.options[option.name]
						if (provenance === undefined) {
							throw new TypeError(
								`Missing schema option provenance: ${candidate.schema.className}.${option.name}`,
							)
						}
						if (
							!sameOwner(provenance.definition.owner, option.owner) ||
							provenance.definition.contributionId !== option.contributionId
						) {
							continue
						}
						const path = `${candidate.schema.className}.${option.name}`
						compilations.push(
							immutableRecord({
								context: immutableRecord({
									className: candidate.schema.className,
									optionName: option.name,
									path,
									provenance,
									scope: 'schema',
									// Static normalization already proved and snapshotted JsonValue.
									value: Reflect.get(
										candidate.definition,
										option.name,
									) as JsonValue,
								}),
								owner: option.owner,
								runtime,
							}),
						)
						continue
					}

					for (const [fieldName, field] of Object.entries(
						candidate.definition.fields,
					)) {
						if (!Object.hasOwn(field.options, option.name)) continue
						const provenance =
							candidate.definition.provenance.fieldOptions[fieldName]?.[
								option.name
							]
						if (provenance === undefined) {
							throw new TypeError(
								`Missing field option provenance: ${candidate.schema.className}.fields.${fieldName}.options.${option.name}`,
							)
						}
						if (
							!sameOwner(provenance.definition.owner, option.owner) ||
							provenance.definition.contributionId !== option.contributionId
						) {
							continue
						}
						const path = `${candidate.schema.className}.fields.${fieldName}.options.${option.name}`
						compilations.push(
							immutableRecord({
								context: immutableRecord({
									className: candidate.schema.className,
									fieldName,
									optionName: option.name,
									path,
									provenance,
									scope: 'field',
									// Static normalization already proved and snapshotted JsonValue.
									value: Reflect.get(field.options, option.name) as JsonValue,
								}),
								owner: option.owner,
								runtime,
							}),
						)
					}
				}
			}
		}

		return immutableArray(compilations)
	}

	#collectOptionDefinitions(): OptionDefinitionIndex {
		const field = new Map<string, readonly OwnedOptionDefinition[]>()
		const schema = new Map<string, readonly OwnedOptionDefinition[]>()

		for (const batch of this.#batches) {
			for (const option of batch.options) {
				if (
					(option.scope === 'schema' && coreSchemaKeys.has(option.name)) ||
					(option.scope === 'field' && isCoreFieldOptionKey(option.name))
				) {
					const cause = new TypeError(
						`Plugin option collides with Core-owned ${option.scope} option: ${option.name}`,
					)
					throw attachPluginDeclarationDiagnostic(
						cause,
						option.owner,
						`${option.scope}.options.${option.name}`,
						option.contributionId,
					)
				}
				const target = option.scope === 'field' ? field : schema
				target.set(option.name, [...(target.get(option.name) ?? []), option])
			}
		}

		return immutableRecord({ field, schema })
	}
}

const coreSchemaKeys = new Set([
	'className',
	'constraints',
	'extensions',
	'fields',
	'indexes',
	'provenance',
])

const normalizeOwnedOptionValue = (
	option: OwnedOptionDefinition,
	value: unknown,
	path: string,
): JsonValue => {
	let normalized: JsonValue

	try {
		normalized = option.definition.normalize(value, path)
	} catch (cause: unknown) {
		throw attachPluginDeclarationDiagnostic(
			new TypeError(
				`${path} is invalid for option owner ${option.owner.pluginId}`,
				{ cause },
			),
			option.owner,
			path,
			option.contributionId,
		)
	}

	return snapshotJsonValue(normalized, path)
}

const resolveFieldOptions = (
	field: GenericField,
	definitions: ReadonlyMap<string, readonly OwnedOptionDefinition[]>,
	path: string,
	resolvedFields: ResolvedFieldOptions,
	preferredOwner?: PluginSchemaContributionOwner,
): GenericField => {
	const existing = resolvedFields.get(field)?.get(preferredOwner)
	if (existing !== undefined) return existing

	const contract = getDeclaredFieldOptionsContract(field)
	const options: Record<string, unknown> = {}
	let changed = false

	for (const [key, value] of Object.entries(field.options)) {
		const descriptor = resolveOptionDefinition(
			definitions,
			key,
			`${path}.options.${key}`,
			preferredOwner,
		)
		const coreOwnsKey = contract?.optionKeys.includes(key) === true

		if (descriptor !== undefined && coreOwnsKey) {
			throw new TypeError(
				`Field option "${key}" from ${descriptor.owner.pluginId} conflicts with Core field ${field.kind}`,
			)
		}

		if (descriptor !== undefined) {
			changed = true
			options[key] = normalizeOwnedOptionValue(
				descriptor,
				value,
				`${path}.options.${key}`,
			)
			continue
		}

		if (contract !== undefined && !coreOwnsKey) {
			throw new TypeError(`Unknown ${field.kind} field option: ${key}`)
		}

		options[key] = value
	}

	if (field.kind === 'object' && isPlainRecord(options.fields)) {
		const nestedFields = immutableRecord(
			Object.fromEntries(
				Object.entries(options.fields).map(([name, nested]) => {
					assertFieldDefinition(nested, `${path}.options.fields.${name}`)
					return [
						name,
						resolveFieldOptions(
							nested,
							definitions,
							`${path}.options.fields.${name}`,
							resolvedFields,
							preferredOwner,
						),
					]
				}),
			),
		)
		if (
			Object.entries(options.fields).some(
				([name, nested]) => nestedFields[name] !== nested,
			)
		) {
			changed = true
			options.fields = nestedFields
		}
	}

	const resolved = changed
		? replaceDeclaredFieldOptions(field, immutableRecord(options))
		: field
	const ownerResolutions =
		resolvedFields.get(field) ??
		new Map<PluginSchemaContributionOwner | undefined, GenericField>()
	ownerResolutions.set(preferredOwner, resolved)
	resolvedFields.set(field, ownerResolutions)

	return resolved
}

const resolveCandidateOptions = (
	candidate: PreparedSchemaCompilation,
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
	preferredOwner?: PluginSchemaContributionOwner,
): PreparedSchemaCompilation => {
	const schemaOptions: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(candidate.definition)) {
		if (coreSchemaKeys.has(key)) continue

		const descriptor = resolveOptionDefinition(
			definitions.schema,
			key,
			`${candidate.schema.className}.${key}`,
			preferredOwner,
		)
		if (descriptor === undefined) {
			throw new TypeError(`Unknown schema option: ${key}`)
		}

		schemaOptions[key] = normalizeOwnedOptionValue(
			descriptor,
			value,
			`${candidate.schema.className}.${key}`,
		)
	}

	const fields = immutableRecord(
		Object.fromEntries(
			Object.entries(candidate.definition.fields).map(([name, field]) => [
				name,
				resolveFieldOptions(
					field,
					definitions.field,
					`${candidate.schema.className}.fields.${name}`,
					resolvedFields,
					preferredOwner,
				),
			]),
		),
	) as typeof candidate.definition.fields
	const developerFields = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.developerFields).map((name) => [
				name,
				fields[name],
			]),
		),
	) as typeof candidate.developerFields

	return immutableRecord({
		definition: immutableRecord({
			...schemaOptions,
			className: candidate.definition.className,
			constraints: candidate.definition.constraints,
			fields,
			indexes: candidate.definition.indexes,
			extensions: candidate.definition.extensions,
			provenance: candidate.definition.provenance,
		}),
		developerFields,
		schema: candidate.schema,
	})
}

const attachInitialContributionProvenance = (
	candidate: PreparedSchemaCompilation,
	addition: OwnedSchemaAddition | undefined,
	definitions: OptionDefinitionIndex,
): PreparedSchemaCompilation => {
	const original = candidate.definition.provenance

	if (addition === undefined) {
		const fieldOptions = immutableRecord(
			Object.fromEntries(
				Object.entries(original.fieldOptions).map(
					([fieldName, optionProvenance]) => [
						fieldName,
						immutableRecord(
							Object.fromEntries(
								Object.entries(optionProvenance).map(
									([optionName, provenance]) => {
										const descriptor = resolveOptionDefinition(
											definitions.field,
											optionName,
											`${candidate.schema.className}.fields.${fieldName}.options.${optionName}`,
										)

										return [
											optionName,
											descriptor === undefined
												? provenance
												: immutableRecord({
														...provenance,
														definition: createSchemaContributionProvenance(
															descriptor.owner,
															descriptor.contributionId,
															descriptor.staticOptions,
															descriptor.definition.protocolVersion,
														),
													}),
										]
									},
								),
							),
						),
					],
				),
			),
		)
		const options = immutableRecord(
			Object.fromEntries(
				Object.entries(original.options).map(([name, provenance]) => {
					const descriptor = resolveOptionDefinition(
						definitions.schema,
						name,
						`${candidate.schema.className}.${name}`,
					)

					return [
						name,
						descriptor === undefined
							? provenance
							: immutableRecord({
									...provenance,
									definition: createSchemaContributionProvenance(
										descriptor.owner,
										descriptor.contributionId,
										descriptor.staticOptions,
										descriptor.definition.protocolVersion,
									),
								}),
					]
				}),
			),
		)
		const provenance = immutableRecord({
			...original,
			fieldOptions,
			options,
		})

		return immutableRecord({
			...candidate,
			definition:
				provenance === original
					? candidate.definition
					: immutableRecord({ ...candidate.definition, provenance }),
		})
	}

	const sourceOwner = addition.owner
	const sourceStaticOptions = addition.staticOptions
	const sourceId = addition.contributionId
	const requireProvenance = (
		value: SchemaContributionProvenance | undefined,
		path: string,
	): SchemaContributionProvenance => {
		if (value === undefined) {
			throw new TypeError(`Missing schema provenance: ${path}`)
		}
		return value
	}
	const fields: SchemaCompilationProvenance['fields'] = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.definition.fields).map((name) => {
				const originalField = requireProvenance(
					original.fields[name],
					`${candidate.schema.className}.fields.${name}`,
				)
				const isCore = originalField.owner.kind === 'core'
				return [
					name,
					isCore
						? originalField
						: createSchemaContributionProvenance(
								sourceOwner,
								`${sourceId}:field:${name}`,
								sourceStaticOptions,
							),
				]
			}),
		),
	)
	const fieldOptions: SchemaCompilationProvenance['fieldOptions'] =
		immutableRecord(
			Object.fromEntries(
				Object.entries(candidate.definition.fields).map(
					([fieldName, field]) => {
						const fieldOwner = requireProvenance(
							fields[fieldName] ?? original.fields[fieldName],
							`${candidate.schema.className}.fields.${fieldName}`,
						)
						return [
							fieldName,
							immutableRecord(
								Object.fromEntries(
									Object.keys(field.options).map((optionName) => {
										const descriptor = resolveOptionDefinition(
											definitions.field,
											optionName,
											`${candidate.schema.className}.fields.${fieldName}.options.${optionName}`,
											addition.owner,
										)
										const prior = original.fieldOptions[fieldName]?.[optionName]
										return [
											optionName,
											immutableRecord({
												definition:
													descriptor === undefined
														? (prior?.definition ?? fieldOwner)
														: createSchemaContributionProvenance(
																descriptor.owner,
																descriptor.contributionId,
																descriptor.staticOptions,
																descriptor.definition.protocolVersion,
															),
												value: createSchemaContributionProvenance(
													fieldOwner.owner,
													`${fieldOwner.contributionId}:option:${optionName}`,
													sourceStaticOptions,
												),
											}),
										]
									}),
								),
							),
						]
					},
				),
			),
		)
	const options: SchemaCompilationProvenance['options'] = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.definition)
				.filter((name) => !coreSchemaKeys.has(name))
				.map((name) => {
					const descriptor = resolveOptionDefinition(
						definitions.schema,
						name,
						`${candidate.schema.className}.${name}`,
						addition.owner,
					)
					if (descriptor === undefined) {
						throw new TypeError(`Unknown schema option: ${name}`)
					}
					return [
						name,
						immutableRecord({
							definition: createSchemaContributionProvenance(
								descriptor.owner,
								descriptor.contributionId,
								descriptor.staticOptions,
								descriptor.definition.protocolVersion,
							),
							value: createSchemaContributionProvenance(
								sourceOwner,
								`${sourceId}:option:${name}`,
								sourceStaticOptions,
							),
						}),
					]
				}),
		),
	)
	const provenance: SchemaCompilationProvenance = immutableRecord({
		constraints: immutableArray(
			candidate.definition.constraints.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						sourceOwner,
						`${sourceId}:constraint:${String(index)}`,
						sourceStaticOptions,
					),
				}),
			),
		),
		extensions: immutableArray(
			candidate.definition.extensions.map(({ name }, index) =>
				immutableRecord({
					name,
					provenance: createSchemaContributionProvenance(
						sourceOwner,
						`${sourceId}:extension:${String(index)}:${name}`,
						sourceStaticOptions,
					),
				}),
			),
		),
		fieldOptions,
		fields,
		indexes: immutableArray(
			candidate.definition.indexes.map((definition, index) =>
				immutableRecord({
					definition,
					provenance: createSchemaContributionProvenance(
						sourceOwner,
						`${sourceId}:index:${String(index)}`,
						sourceStaticOptions,
					),
				}),
			),
		),
		options,
		patches: original.patches,
		schema: createSchemaContributionProvenance(
			sourceOwner,
			sourceId,
			sourceStaticOptions,
		),
	})

	return immutableRecord({
		...candidate,
		definition: immutableRecord({ ...candidate.definition, provenance }),
	})
}

const sameOwner = (
	owner: SchemaContributionOwner,
	reference: SchemaContributionOwnerReference,
): boolean => {
	if (owner.kind !== reference.kind) return false
	if (owner.kind !== 'plugin') return true

	return (
		reference.kind === 'plugin' &&
		owner.pluginId === reference.pluginId &&
		owner.instanceId === reference.instanceId
	)
}

const readOptionPath = (value: unknown, path: readonly string[]): unknown => {
	let current = value
	for (const segment of path) {
		if (!isPlainRecord(current) || !Object.hasOwn(current, segment)) {
			return undefined
		}
		current = current[segment]
	}
	return current
}

const readPlainRecordValue = (
	value: object,
	key: string,
	path: string,
): unknown => {
	const untrustedValue: unknown = value
	if (!isPlainRecord(untrustedValue)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	return untrustedValue[key]
}

const matchesSelector = (
	candidate: PreparedSchemaCompilation,
	owner: SchemaContributionOwner,
	selector: SchemaSelectorOptions,
): boolean => {
	if (
		selector.className !== undefined &&
		candidate.schema.className !== selector.className
	) {
		return false
	}

	if (selector.owner !== undefined && !sameOwner(owner, selector.owner)) {
		return false
	}

	if (selector.field !== undefined) {
		const field = candidate.definition.fields[selector.field.name]
		if (
			field === undefined ||
			(selector.field.kind !== undefined && field.kind !== selector.field.kind)
		) {
			return false
		}
	}

	if (selector.option !== undefined) {
		const value = readPlainRecordValue(
			candidate.definition,
			selector.option.name,
			candidate.schema.className,
		)
		const selected = readOptionPath(value, selector.option.path ?? [])
		if (
			!areSchemaDeclarationValuesCompatible(selected, selector.option.equals)
		) {
			return false
		}
	}

	return true
}

const assertExactFieldTransformTarget = (
	actual: GenericField,
	provenance: SchemaContributionProvenance | undefined,
	target: ExistingSchemaContributionTarget<GenericField>,
	path: string,
): SchemaContributionProvenance => {
	if (provenance === undefined) {
		throw new TypeError(`Missing schema contribution provenance: ${path}`)
	}
	if (provenance.owner.kind === 'core') {
		throw new TypeError(`Protected Core schema contribution: ${path}`)
	}
	if (!sameOwner(provenance.owner, target.owner)) {
		throw new TypeError(`Stale schema contribution owner: ${path}`)
	}
	if (provenance.contributionId !== target.contributionId) {
		throw new TypeError(`Stale schema contribution identity: ${path}`)
	}
	if (!areSchemaDeclarationValuesCompatible(actual, target.expected)) {
		throw new TypeError(`Stale schema contribution shape: ${path}`)
	}

	return provenance
}

const assertExactJsonTransformTarget = (
	actual: unknown,
	provenance: SchemaContributionProvenance | undefined,
	target: ExistingSchemaContributionTarget<JsonValue>,
	path: string,
): SchemaContributionProvenance => {
	if (provenance === undefined) {
		throw new TypeError(`Missing schema contribution provenance: ${path}`)
	}
	if (!sameOwner(provenance.owner, target.owner)) {
		throw new TypeError(`Stale schema contribution owner: ${path}`)
	}
	if (provenance.contributionId !== target.contributionId) {
		throw new TypeError(`Stale schema contribution identity: ${path}`)
	}
	if (!areSchemaDeclarationValuesCompatible(actual, target.expected)) {
		throw new TypeError(`Stale schema contribution shape: ${path}`)
	}

	return provenance
}

const withoutRecordKey = <TValue>(
	record: Readonly<Record<string, TValue>>,
	removedKey: string,
): Readonly<Record<string, TValue>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([key]) => key !== removedKey),
		),
	)

const renameIndexField = (
	fields: readonly [string, ...string[]],
	from: string,
	to: string,
): readonly [string, ...string[]] => {
	const [first, ...remaining] = fields

	return immutableArray([
		first === from ? to : first,
		...remaining.map((name) => (name === from ? to : name)),
	])
}

const applyPatch = (
	candidate: PreparedSchemaCompilation,
	patch: OwnedSchemaPatch,
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
): PreparedSchemaCompilation => {
	let fields = candidate.definition.fields
	let developerFields = candidate.developerFields
	let indexes: readonly SchemaIndexDefinition[] = candidate.definition.indexes
	let provenance = candidate.definition.provenance
	let extensions = candidate.definition.extensions
	let constraints = candidate.definition.constraints
	let schemaOptionValues: Readonly<Record<string, unknown>> = immutableRecord(
		Object.fromEntries(
			Object.entries(candidate.definition).filter(
				([name]) => !coreSchemaKeys.has(name),
			),
		),
	)
	const contributionIds = new Set<string>()
	const hasOwnedContributionId = (contributionId: string): boolean => {
		const candidates: SchemaContributionProvenance[] = [
			provenance.schema,
			...Object.values(provenance.fields),
			...provenance.constraints.map(({ provenance: owner }) => owner),
			...provenance.indexes.map(({ provenance: owner }) => owner),
			...provenance.extensions.map(({ provenance: owner }) => owner),
			...provenance.patches.map(({ provenance: owner }) => owner),
		]

		return candidates.some(
			(candidate) =>
				candidate.contributionId === contributionId &&
				candidate.owner.kind === 'plugin' &&
				candidate.owner.pluginId === patch.owner.pluginId &&
				candidate.owner.instanceId === patch.owner.instanceId,
		)
	}

	for (const operation of patch.operations) {
		if (
			contributionIds.has(operation.contributionId) ||
			hasOwnedContributionId(operation.contributionId)
		) {
			throw new TypeError(
				`Duplicate schema patch contributionId: ${operation.contributionId}`,
			)
		}
		contributionIds.add(operation.contributionId)

		if (
			operation.kind === 'constraint:add' ||
			operation.kind === 'constraint:replace' ||
			operation.kind === 'constraint:remove'
		) {
			const targetPosition =
				operation.kind === 'constraint:add'
					? -1
					: provenance.constraints.findIndex(
							(entry) =>
								sameOwner(entry.provenance.owner, operation.target.owner) &&
								entry.provenance.contributionId ===
									operation.target.contributionId,
						)
			const current =
				targetPosition < 0 ? undefined : constraints[targetPosition]

			if (operation.kind !== 'constraint:add') {
				if (current === undefined) {
					throw new TypeError('Stale schema constraint identity')
				}
				if (
					!areSchemaDeclarationValuesCompatible(
						current,
						operation.target.expected,
					)
				) {
					throw new TypeError('Stale schema constraint shape')
				}
			}

			const transformProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			constraints = immutableArray(
				operation.kind === 'constraint:add'
					? [...constraints, operation.constraint]
					: operation.kind === 'constraint:remove'
						? constraints.filter((_, index) => index !== targetPosition)
						: constraints.map((constraint, index) =>
								index === targetPosition ? operation.constraint : constraint,
							),
			)
			const constraintEntries =
				operation.kind === 'constraint:add'
					? [
							...provenance.constraints,
							immutableRecord({
								definition: operation.constraint,
								provenance: transformProvenance,
							}),
						]
					: operation.kind === 'constraint:remove'
						? provenance.constraints.filter(
								(_, index) => index !== targetPosition,
							)
						: provenance.constraints.map((entry, index) =>
								index === targetPosition
									? immutableRecord({
											definition: operation.constraint,
											provenance: transformProvenance,
										})
									: entry,
							)
			provenance = immutableRecord({
				...provenance,
				constraints: immutableArray(constraintEntries),
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: transformProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		if (
			operation.kind === 'extension:add' ||
			operation.kind === 'extension:replace' ||
			operation.kind === 'extension:remove'
		) {
			const targetPosition =
				operation.kind === 'extension:add'
					? -1
					: provenance.extensions.findIndex(
							(entry) =>
								sameOwner(entry.provenance.owner, operation.target.owner) &&
								entry.provenance.contributionId ===
									operation.target.contributionId,
						)
			const currentExtension =
				targetPosition < 0 ? undefined : extensions[targetPosition]

			if (operation.kind !== 'extension:add') {
				if (currentExtension === undefined) {
					throw new TypeError('Stale schema extension identity')
				}
				if (
					!areSchemaDeclarationValuesCompatible(
						currentExtension,
						operation.target.expected,
					)
				) {
					throw new TypeError('Stale schema extension shape')
				}
			}

			const replacement =
				operation.kind === 'extension:remove' ? undefined : operation.extension
			const removedFieldNames = new Set(
				Object.keys(currentExtension?.fields ?? {}).filter(
					(name) => !Object.hasOwn(replacement?.fields ?? {}, name),
				),
			)
			for (const index of indexes) {
				const removedDependency = index.fields.find((name) =>
					removedFieldNames.has(name),
				)
				if (removedDependency !== undefined) {
					throw new TypeError(
						`Cannot remove schema extension field with a remaining index: ${removedDependency}`,
					)
				}
			}

			for (const name of Object.keys(currentExtension?.fields ?? {})) {
				fields = withoutRecordKey(fields, name) as typeof fields
				provenance = immutableRecord({
					...provenance,
					fieldOptions: withoutRecordKey(provenance.fieldOptions, name),
					fields: withoutRecordKey(provenance.fields, name),
				})
			}

			const transformProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			if (replacement !== undefined) {
				for (const [name, declaredField] of Object.entries(
					replacement.fields,
				)) {
					assertNonEmptyString(
						name,
						`Schema extension ${replacement.name} field`,
					)
					assertFieldDefinition(
						declaredField,
						`Schema extension ${replacement.name} fields.${name}`,
					)
					if (
						Object.hasOwn(fields, name) ||
						reservedSystemFieldNames.includes(name as never) ||
						isReservedQueryLogicalFieldName(name) ||
						isReservedSchemaModelFieldName(name)
					) {
						throw new TypeError(`Reserved schema extension field: ${name}`)
					}
					const field = resolveFieldOptions(
						declaredField,
						definitions.field,
						`${candidate.schema.className}.extensions.${replacement.name}.fields.${name}`,
						resolvedFields,
						patch.owner,
					)
					fields = immutableRecord({ ...fields, [name]: field })
					provenance = immutableRecord({
						...provenance,
						fieldOptions: immutableRecord({
							...provenance.fieldOptions,
							[name]: immutableRecord(
								Object.fromEntries(
									Object.keys(field.options).map((optionName) => [
										optionName,
										immutableRecord({
											definition: transformProvenance,
											value: transformProvenance,
										}),
									]),
								),
							),
						}),
						fields: immutableRecord({
							...provenance.fields,
							[name]: createSchemaContributionProvenance(
								patch.owner,
								`${operation.contributionId}:field:${name}`,
								patch.staticOptions,
							),
						}),
					})
				}
			}

			extensions = defineExtensions(
				operation.kind === 'extension:add'
					? [...extensions, operation.extension]
					: operation.kind === 'extension:remove'
						? extensions.filter((_, index) => index !== targetPosition)
						: extensions.map((extension, index) =>
								index === targetPosition ? operation.extension : extension,
							),
			)
			const extensionEntries =
				operation.kind === 'extension:add'
					? [
							...provenance.extensions,
							immutableRecord({
								name: operation.extension.name,
								provenance: transformProvenance,
							}),
						]
					: operation.kind === 'extension:remove'
						? provenance.extensions.filter(
								(_, index) => index !== targetPosition,
							)
						: provenance.extensions.map((entry, index) =>
								index === targetPosition
									? immutableRecord({
											name: operation.extension.name,
											provenance: transformProvenance,
										})
									: entry,
							)
			provenance = immutableRecord({
				...provenance,
				extensions: immutableArray(extensionEntries),
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: transformProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		if (operation.kind === 'field:add') {
			if (Object.hasOwn(fields, operation.name)) {
				throw new TypeError(
					`Duplicate schema field: ${candidate.schema.className}.${operation.name}`,
				)
			}
			if (reservedSystemFieldNames.includes(operation.name as never)) {
				throw new TypeError(`Reserved schema field: ${operation.name}`)
			}
			const field = resolveFieldOptions(
				operation.field,
				definitions.field,
				`${candidate.schema.className}.fields.${operation.name}`,
				resolvedFields,
				patch.owner,
			)
			fields = immutableRecord({ ...fields, [operation.name]: field })
			developerFields = immutableRecord({
				...developerFields,
				[operation.name]: field,
			})
			const fieldProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			const contract = getDeclaredFieldOptionsContract(field)
			const fieldOptions = immutableRecord(
				Object.fromEntries(
					Object.keys(field.options).map((optionName) => {
						const descriptor = resolveOptionDefinition(
							definitions.field,
							optionName,
							`${candidate.schema.className}.fields.${operation.name}.options.${optionName}`,
							patch.owner,
						)
						const definition =
							descriptor !== undefined
								? createSchemaContributionProvenance(
										descriptor.owner,
										descriptor.contributionId,
										descriptor.staticOptions,
										descriptor.definition.protocolVersion,
									)
								: createSchemaContributionProvenance(
										contract?.optionKeys.includes(optionName) === true
											? coreSchemaContributionOwner
											: patch.owner,
										`${operation.contributionId}:option-definition:${optionName}`,
									)

						return [
							optionName,
							immutableRecord({
								definition,
								value: createSchemaContributionProvenance(
									patch.owner,
									`${operation.contributionId}:option:${optionName}`,
									patch.staticOptions,
								),
							}),
						]
					}),
				),
			)
			provenance = immutableRecord({
				...provenance,
				fieldOptions: immutableRecord({
					...provenance.fieldOptions,
					[operation.name]: fieldOptions,
				}),
				fields: immutableRecord({
					...provenance.fields,
					[operation.name]: fieldProvenance,
				}),
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: fieldProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		if (
			operation.kind === 'field:replace' ||
			operation.kind === 'field:rename' ||
			operation.kind === 'field:remove'
		) {
			const sourceName =
				operation.kind === 'field:rename' ? operation.from : operation.name
			const actual = fields[sourceName]
			if (actual === undefined) {
				throw new TypeError(
					`Unknown schema field: ${candidate.schema.className}.${sourceName}`,
				)
			}
			assertExactFieldTransformTarget(
				actual,
				provenance.fields[sourceName],
				operation.target,
				`${candidate.schema.className}.fields.${sourceName}`,
			)
			if (reservedSystemFieldNames.includes(sourceName as never)) {
				throw new TypeError(`Protected Core schema field: ${sourceName}`)
			}

			const transformProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			const appendPatch = (): void => {
				provenance = immutableRecord({
					...provenance,
					patches: immutableArray([
						...provenance.patches,
						immutableRecord({
							kind: operation.kind,
							provenance: transformProvenance,
							targetClassName: candidate.schema.className,
						}),
					]),
				})
			}

			if (operation.kind === 'field:remove') {
				const dependentIndex = indexes.find((index) =>
					index.fields.includes(sourceName),
				)
				if (dependentIndex !== undefined) {
					throw new TypeError(
						`Cannot remove schema field with a remaining index: ${sourceName}`,
					)
				}
				fields = withoutRecordKey(fields, sourceName) as typeof fields
				if (Object.hasOwn(developerFields, sourceName)) {
					developerFields = withoutRecordKey(developerFields, sourceName)
				}
				provenance = immutableRecord({
					...provenance,
					fieldOptions: withoutRecordKey(provenance.fieldOptions, sourceName),
					fields: withoutRecordKey(provenance.fields, sourceName),
				})
				appendPatch()
				continue
			}

			const targetName =
				operation.kind === 'field:rename' ? operation.to : operation.name
			if (
				operation.kind === 'field:rename' &&
				Object.hasOwn(fields, targetName)
			) {
				throw new TypeError(
					`Duplicate schema field: ${candidate.schema.className}.${targetName}`,
				)
			}
			if (reservedSystemFieldNames.includes(targetName as never)) {
				throw new TypeError(`Reserved schema field: ${targetName}`)
			}
			const replacement =
				operation.kind === 'field:replace'
					? resolveFieldOptions(
							operation.field,
							definitions.field,
							`${candidate.schema.className}.fields.${targetName}`,
							resolvedFields,
							patch.owner,
						)
					: actual
			fields = immutableRecord(
				Object.fromEntries(
					Object.entries(fields).map(([name, field]) => [
						name === sourceName ? targetName : name,
						name === sourceName ? replacement : field,
					]),
				),
			) as typeof fields
			if (Object.hasOwn(developerFields, sourceName)) {
				developerFields = immutableRecord(
					Object.fromEntries(
						Object.entries(developerFields).map(([name, field]) => [
							name === sourceName ? targetName : name,
							name === sourceName ? replacement : field,
						]),
					),
				)
			}

			const priorFieldOptions: Readonly<
				Record<string, SchemaOptionProvenance>
			> = provenance.fieldOptions[sourceName] ?? immutableRecord({})
			const replacementFieldOptions = immutableRecord(
				Object.fromEntries(
					Object.keys(replacement.options).map((optionName) => {
						const prior = priorFieldOptions[optionName]
						return [
							optionName,
							immutableRecord({
								definition: prior?.definition ?? transformProvenance,
								value: createSchemaContributionProvenance(
									patch.owner,
									`${operation.contributionId}:option:${optionName}`,
									patch.staticOptions,
								),
							}),
						]
					}),
				),
			)
			provenance = immutableRecord({
				...provenance,
				fieldOptions: immutableRecord({
					...withoutRecordKey(provenance.fieldOptions, sourceName),
					[targetName]: replacementFieldOptions,
				}),
				fields: immutableRecord({
					...withoutRecordKey(provenance.fields, sourceName),
					[targetName]: transformProvenance,
				}),
				indexes:
					operation.kind === 'field:rename'
						? immutableArray(
								provenance.indexes.map((entry) =>
									immutableRecord({
										...entry,
										definition: immutableRecord({
											...entry.definition,
											fields: renameIndexField(
												entry.definition.fields,
												sourceName,
												targetName,
											),
										}),
									}),
								),
							)
						: provenance.indexes,
			})
			if (operation.kind === 'field:rename') {
				indexes = immutableArray(
					indexes.map((index) =>
						immutableRecord({
							...index,
							fields: renameIndexField(index.fields, sourceName, targetName),
						}),
					),
				)
			}
			appendPatch()
			continue
		}

		if (
			operation.kind === 'schema-option:set' ||
			operation.kind === 'schema-option:remove'
		) {
			const descriptor = resolveOptionDefinition(
				definitions.schema,
				operation.name,
				`${candidate.schema.className}.${operation.name}`,
				patch.owner,
			)
			if (descriptor === undefined) {
				throw new TypeError(`Unknown schema option: ${operation.name}`)
			}
			const hasValue = Object.hasOwn(schemaOptionValues, operation.name)
			const currentValue = Reflect.get(schemaOptionValues, operation.name)
			const currentProvenance = provenance.options[operation.name]

			if (operation.kind === 'schema-option:set') {
				if (operation.target === undefined && hasValue) {
					throw new TypeError(`Duplicate schema option: ${operation.name}`)
				}
				if (operation.target !== undefined) {
					if (!hasValue) {
						throw new TypeError(`Unknown schema option: ${operation.name}`)
					}
					assertExactJsonTransformTarget(
						currentValue,
						currentProvenance?.value,
						operation.target,
						`${candidate.schema.className}.${operation.name}`,
					)
				}
				const value = normalizeOwnedOptionValue(
					descriptor,
					operation.value,
					`${candidate.schema.className}.${operation.name}`,
				)
				schemaOptionValues = immutableRecord({
					...schemaOptionValues,
					[operation.name]: value,
				})
				const valueProvenance = createSchemaContributionProvenance(
					patch.owner,
					operation.contributionId,
					patch.staticOptions,
				)
				provenance = immutableRecord({
					...provenance,
					options: immutableRecord({
						...provenance.options,
						[operation.name]: immutableRecord({
							definition: createSchemaContributionProvenance(
								descriptor.owner,
								descriptor.contributionId,
								descriptor.staticOptions,
								descriptor.definition.protocolVersion,
							),
							value: valueProvenance,
						}),
					}),
					patches: immutableArray([
						...provenance.patches,
						immutableRecord({
							kind: operation.kind,
							provenance: valueProvenance,
							targetClassName: candidate.schema.className,
						}),
					]),
				})
				continue
			}

			if (!hasValue) {
				throw new TypeError(`Unknown schema option: ${operation.name}`)
			}
			assertExactJsonTransformTarget(
				currentValue,
				currentProvenance?.value,
				operation.target,
				`${candidate.schema.className}.${operation.name}`,
			)
			const removalProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			schemaOptionValues = withoutRecordKey(schemaOptionValues, operation.name)
			provenance = immutableRecord({
				...provenance,
				options: withoutRecordKey(provenance.options, operation.name),
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: removalProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		if (
			operation.kind === 'field-option:set' ||
			operation.kind === 'field-option:remove'
		) {
			const field = fields[operation.field]
			if (field === undefined) {
				throw new TypeError(`Unknown schema field: ${operation.field}`)
			}
			const descriptor = resolveOptionDefinition(
				definitions.field,
				operation.name,
				`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
				patch.owner,
			)
			if (descriptor === undefined) {
				throw new TypeError(
					`Unknown plugin field option: ${operation.name}; replace the field to change Core-owned validation or metadata`,
				)
			}
			const hasValue = Object.hasOwn(field.options, operation.name)
			const currentValue = readPlainRecordValue(
				field.options,
				operation.name,
				`${candidate.schema.className}.fields.${operation.field}.options`,
			)
			const currentProvenance =
				provenance.fieldOptions[operation.field]?.[operation.name]
			const options: Readonly<Record<string, unknown>> = immutableRecord(
				Object.fromEntries(Object.entries(field.options)),
			)

			if (operation.kind === 'field-option:set') {
				if (operation.target === undefined && hasValue) {
					throw new TypeError(`Duplicate field option: ${operation.name}`)
				}
				if (operation.target !== undefined) {
					if (!hasValue) {
						throw new TypeError(`Unknown field option: ${operation.name}`)
					}
					assertExactJsonTransformTarget(
						currentValue,
						currentProvenance?.value,
						operation.target,
						`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
					)
				}
				const value = normalizeOwnedOptionValue(
					descriptor,
					operation.value,
					`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
				)
				const replacement = replaceDeclaredFieldOptions(
					field,
					immutableRecord({ ...options, [operation.name]: value }),
				)
				fields = immutableRecord({
					...fields,
					[operation.field]: replacement,
				})
				if (Object.hasOwn(developerFields, operation.field)) {
					developerFields = immutableRecord({
						...developerFields,
						[operation.field]: replacement,
					})
				}
				const valueProvenance = createSchemaContributionProvenance(
					patch.owner,
					operation.contributionId,
					patch.staticOptions,
				)
				provenance = immutableRecord({
					...provenance,
					fieldOptions: immutableRecord({
						...provenance.fieldOptions,
						[operation.field]: immutableRecord({
							...provenance.fieldOptions[operation.field],
							[operation.name]: immutableRecord({
								definition: createSchemaContributionProvenance(
									descriptor.owner,
									descriptor.contributionId,
									descriptor.staticOptions,
									descriptor.definition.protocolVersion,
								),
								value: valueProvenance,
							}),
						}),
					}),
					patches: immutableArray([
						...provenance.patches,
						immutableRecord({
							kind: operation.kind,
							provenance: valueProvenance,
							targetClassName: candidate.schema.className,
						}),
					]),
				})
				continue
			}

			if (!hasValue) {
				throw new TypeError(`Unknown field option: ${operation.name}`)
			}
			assertExactJsonTransformTarget(
				currentValue,
				currentProvenance?.value,
				operation.target,
				`${candidate.schema.className}.fields.${operation.field}.options.${operation.name}`,
			)
			const replacement = replaceDeclaredFieldOptions(
				field,
				withoutRecordKey(options, operation.name),
			)
			fields = immutableRecord({ ...fields, [operation.field]: replacement })
			if (Object.hasOwn(developerFields, operation.field)) {
				developerFields = immutableRecord({
					...developerFields,
					[operation.field]: replacement,
				})
			}
			const removalProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			provenance = immutableRecord({
				...provenance,
				fieldOptions: immutableRecord({
					...provenance.fieldOptions,
					[operation.field]: withoutRecordKey(
						provenance.fieldOptions[operation.field] ?? immutableRecord({}),
						operation.name,
					),
				}),
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: removalProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		if (
			operation.kind === 'index:replace' ||
			operation.kind === 'index:remove'
		) {
			const indexPosition = provenance.indexes.findIndex(
				(entry) =>
					sameOwner(entry.provenance.owner, operation.target.owner) &&
					entry.provenance.contributionId === operation.target.contributionId,
			)
			const entry = provenance.indexes[indexPosition]
			const actual = indexes[indexPosition]
			if (entry === undefined || actual === undefined) {
				throw new TypeError('Stale schema index identity')
			}
			if (
				!areSchemaDeclarationValuesCompatible(actual, operation.target.expected)
			) {
				throw new TypeError('Stale schema index shape')
			}
			const transformProvenance = createSchemaContributionProvenance(
				patch.owner,
				operation.contributionId,
				patch.staticOptions,
			)
			if (operation.kind === 'index:remove') {
				indexes = immutableArray(
					indexes.filter((_, position) => position !== indexPosition),
				)
				provenance = immutableRecord({
					...provenance,
					indexes: immutableArray(
						provenance.indexes.filter(
							(_, position) => position !== indexPosition,
						),
					),
				})
			} else {
				const replacement = normalizeContributedSchemaIndex(
					fields,
					operation.index,
				)
				indexes = immutableArray(
					indexes.map((index, position) =>
						position === indexPosition ? replacement : index,
					),
				)
				provenance = immutableRecord({
					...provenance,
					indexes: immutableArray(
						provenance.indexes.map((candidate, position) =>
							position === indexPosition
								? immutableRecord({
										definition: replacement,
										provenance: transformProvenance,
									})
								: candidate,
						),
					),
				})
			}
			provenance = immutableRecord({
				...provenance,
				patches: immutableArray([
					...provenance.patches,
					immutableRecord({
						kind: operation.kind,
						provenance: transformProvenance,
						targetClassName: candidate.schema.className,
					}),
				]),
			})
			continue
		}

		const index = normalizeContributedSchemaIndex(fields, operation.index)
		indexes = immutableArray([...indexes, index])
		const indexProvenance = createSchemaContributionProvenance(
			patch.owner,
			operation.contributionId,
			patch.staticOptions,
		)
		provenance = immutableRecord({
			...provenance,
			indexes: immutableArray([
				...provenance.indexes,
				immutableRecord({
					definition: index,
					provenance: indexProvenance,
				}),
			]),
			patches: immutableArray([
				...provenance.patches,
				immutableRecord({
					kind: operation.kind,
					provenance: indexProvenance,
					targetClassName: candidate.schema.className,
				}),
			]),
		})
	}

	return immutableRecord({
		definition: immutableRecord({
			...schemaOptionValues,
			className: candidate.definition.className,
			constraints,
			extensions,
			fields,
			indexes,
			provenance,
		}),
		developerFields,
		schema: candidate.schema,
	})
}
