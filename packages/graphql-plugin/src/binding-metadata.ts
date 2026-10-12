import type {
	ExposedOperationTransportBinding,
	PluginSchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertGraphqlKnownKeys } from './known-keys.js'

/** References a v1 built-in or binding-supplied type, or one application schema. */
export type GraphqlOperationNullableTypeReference =
	| Readonly<{ readonly kind: 'named'; readonly name: string }>
	| Readonly<{ readonly className: string; readonly kind: 'schema' }>
	| Readonly<{
			readonly kind: 'list'
			readonly ofType: GraphqlOperationTypeReference
	  }>

/** Expresses GraphQL nullability without carrying executable schema objects. */
export type GraphqlOperationTypeReference =
	| GraphqlOperationNullableTypeReference
	| Readonly<{
			readonly kind: 'non-null'
			readonly ofType: GraphqlOperationNullableTypeReference
	  }>

/** Declares one callback-free field inside a supporting GraphQL type. */
export interface GraphqlOperationTypeFieldDefinition {
	readonly name: string
	readonly type: GraphqlOperationTypeReference
}

export type GraphqlOperationSupportingTypeDefinition =
	| Readonly<{
			readonly fields: readonly GraphqlOperationTypeFieldDefinition[]
			readonly kind: 'input-object'
			readonly name: string
			/**
			 * Includes ordinary create fields from a schema owned by this
			 * binding's plugin; an owner may send `{ kind: 'owned-schema' }`.
			 */
			readonly createFieldsFrom?: string
	  }>
	| Readonly<{
			readonly fields: readonly GraphqlOperationTypeFieldDefinition[]
			readonly kind: 'object'
			readonly name: string
	  }>
	| Readonly<{
			readonly kind: 'enum'
			readonly name: string
			readonly values: readonly string[]
	  }>

/** Describes one operation root using deterministic inert JSON only. */
export interface GraphqlOperationBindingMetadata {
	readonly field: string
	readonly input?: GraphqlOperationTypeReference
	readonly kind: 'graphql-operation-binding'
	readonly result: GraphqlOperationTypeReference
	readonly root: 'mutation' | 'query'
	readonly types: readonly GraphqlOperationSupportingTypeDefinition[]
}

/** Describes the payload types for one generated schema-mutation field. */
export interface GraphqlSchemaMutationBindingMetadata {
	/** Describes `input.data`; omission means the logical payload is `undefined`. */
	readonly input?: GraphqlOperationTypeReference
	readonly kind: 'graphql-schema-mutation-binding'
	/** Supplies the closed input-object and enum definitions reachable from data. */
	readonly types: readonly GraphqlOperationSupportingTypeDefinition[]
}

const assertKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
	path: string,
): void => {
	assertGraphqlKnownKeys(value, new Set(keys), path, 'unknown key')
}

const readString = (value: unknown, path: string): string => {
	assertNonEmptyString(value, path)
	return value
}

/**
 * Resolves `{ kind: 'owned-schema' }`, the one schema the binding's plugin
 * owns or designates when the application chooses its class name, to that
 * class name.
 */
type OwnedSchemaResolver = (path: string) => string

const unresolvedOwnedSchema: OwnedSchemaResolver = (path) => {
	throw new TypeError(`${path} cannot reference an owned schema here`)
}

const isOwnedSchemaReference = (value: unknown): boolean =>
	isPlainRecord(value) &&
	value.kind === 'owned-schema' &&
	Object.keys(value).length === 1

const normalizeNullableReference = (
	value: Readonly<Record<string, unknown>>,
	path: string,
	owned: OwnedSchemaResolver,
): GraphqlOperationNullableTypeReference => {
	if (isOwnedSchemaReference(value)) {
		return immutableRecord({ className: owned(path), kind: 'schema' })
	}
	if (value.kind === 'named') {
		assertKeys(value, ['kind', 'name'], path)
		return immutableRecord({
			kind: 'named',
			name: readString(value.name, `${path}.name`),
		})
	}
	if (value.kind === 'schema') {
		assertKeys(value, ['className', 'kind'], path)
		return immutableRecord({
			className: readString(value.className, `${path}.className`),
			kind: 'schema',
		})
	}
	if (value.kind === 'list') {
		assertKeys(value, ['kind', 'ofType'], path)
		return immutableRecord({
			kind: 'list',
			ofType: normalizeTypeReference(value.ofType, `${path}.ofType`, owned),
		})
	}
	throw new TypeError(
		`${path}.kind must be named, schema, owned-schema, list, or non-null`,
	)
}

const normalizeTypeReference = (
	value: unknown,
	path: string,
	owned: OwnedSchemaResolver,
): GraphqlOperationTypeReference => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain type reference`)
	}
	if (value.kind !== 'non-null') {
		return normalizeNullableReference(value, path, owned)
	}
	assertKeys(value, ['kind', 'ofType'], path)
	if (!isPlainRecord(value.ofType) || value.ofType.kind === 'non-null') {
		throw new TypeError(`${path}.ofType must be a nullable type reference`)
	}
	return immutableRecord({
		kind: 'non-null',
		ofType: normalizeNullableReference(value.ofType, `${path}.ofType`, owned),
	})
}

const normalizeFields = (
	value: unknown,
	path: string,
	owned: OwnedSchemaResolver,
): readonly GraphqlOperationTypeFieldDefinition[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty field array`)
	}
	return immutableArray(
		value.map((field, index) => {
			const fieldPath = `${path}[${String(index)}]`
			if (!isPlainRecord(field)) {
				throw new TypeError(`${fieldPath} must be a plain object`)
			}
			assertKeys(field, ['name', 'type'], fieldPath)
			return immutableRecord({
				name: readString(field.name, `${fieldPath}.name`),
				type: normalizeTypeReference(field.type, `${fieldPath}.type`, owned),
			})
		}),
	)
}

const normalizeSupportingType = (
	value: unknown,
	path: string,
	owned: OwnedSchemaResolver,
): GraphqlOperationSupportingTypeDefinition => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const name = readString(value.name, `${path}.name`)
	if (value.kind === 'enum') {
		assertKeys(value, ['kind', 'name', 'values'], path)
		if (!isUnknownArray(value.values) || value.values.length === 0) {
			throw new TypeError(`${path}.values must be a non-empty array`)
		}
		return immutableRecord({
			kind: 'enum',
			name,
			values: immutableArray(
				value.values.map((item, index) =>
					readString(item, `${path}.values[${String(index)}]`),
				),
			),
		})
	}
	if (value.kind === 'input-object' || value.kind === 'object') {
		assertKeys(
			value,
			[
				'fields',
				'kind',
				'name',
				...(value.kind === 'input-object' ? ['createFieldsFrom'] : []),
			],
			path,
		)
		return immutableRecord({
			fields: normalizeFields(value.fields, `${path}.fields`, owned),
			kind: value.kind,
			name,
			...(Object.hasOwn(value, 'createFieldsFrom')
				? {
						createFieldsFrom: isOwnedSchemaReference(value.createFieldsFrom)
							? owned(`${path}.createFieldsFrom`)
							: readString(value.createFieldsFrom, `${path}.createFieldsFrom`),
					}
				: {}),
		})
	}
	throw new TypeError(`${path}.kind must be enum, input-object, or object`)
}

// Both binding families share the plain-object, kind and types envelope checks.
const readBindingEnvelope = (
	value: unknown,
	path: string,
	keys: readonly string[],
	kind: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertKeys(value, keys, path)
	if (value.kind !== kind) throw new TypeError(`${path}.kind must be ${kind}`)
	return value
}

const normalizeSupportingTypes = (
	value: readonly unknown[],
	path: string,
	owned: OwnedSchemaResolver,
): readonly GraphqlOperationSupportingTypeDefinition[] =>
	immutableArray(
		value.map((definition, index) =>
			normalizeSupportingType(
				definition,
				`${path}.types[${String(index)}]`,
				owned,
			),
		),
	)

/**
 * Validates and snapshots one owner-supplied GraphQL binding description;
 * `owned` resolves `{ kind: 'owned-schema' }` references.
 */
export const normalizeGraphqlOperationBindingMetadata = (
	value: unknown,
	operation: string,
	owned: OwnedSchemaResolver = unresolvedOwnedSchema,
): GraphqlOperationBindingMetadata => {
	const path = `GraphQL binding for operation ${operation}`
	const binding = readBindingEnvelope(
		value,
		path,
		['field', 'input', 'kind', 'result', 'root', 'types'],
		'graphql-operation-binding',
	)
	const root = binding.root
	if (root !== 'mutation' && root !== 'query') {
		throw new TypeError(`${path}.root must be query or mutation`)
	}
	if (!isUnknownArray(binding.types)) {
		throw new TypeError(`${path}.types must be an array`)
	}
	return immutableRecord({
		field: readString(binding.field, `${path}.field`),
		...(binding.input === undefined
			? {}
			: {
					input: normalizeTypeReference(binding.input, `${path}.input`, owned),
				}),
		kind: 'graphql-operation-binding',
		result: normalizeTypeReference(binding.result, `${path}.result`, owned),
		root,
		types: normalizeSupportingTypes(binding.types, path, owned),
	})
}

/** Validates one schema-mutation binding without accepting root-field control. */
export const normalizeGraphqlSchemaMutationBindingMetadata = (
	value: unknown,
	mutation: string,
): GraphqlSchemaMutationBindingMetadata => {
	const path = `GraphQL binding for schema mutation ${mutation}`
	const binding = readBindingEnvelope(
		value,
		path,
		['input', 'kind', 'types'],
		'graphql-schema-mutation-binding',
	)
	if (!isUnknownArray(binding.types)) {
		throw new TypeError(`${path}.types must be an array`)
	}
	return immutableRecord({
		...(binding.input === undefined
			? {}
			: {
					input: normalizeTypeReference(
						binding.input,
						`${path}.input`,
						unresolvedOwnedSchema,
					),
				}),
		kind: 'graphql-schema-mutation-binding',
		types: normalizeSupportingTypes(binding.types, path, unresolvedOwnedSchema),
	})
}

/** Projects exact Core ownership for both retained binding families. */
export const bindingOwnerFor = (
	descriptor: Pick<ExposedOperationTransportBinding, 'owner'>,
): PluginSchemaContributionOwner => ({
	kind: 'plugin',
	...(descriptor.owner.instanceId === undefined
		? {}
		: { instanceId: descriptor.owner.instanceId }),
	pluginId: descriptor.owner.pluginId,
	version: descriptor.owner.version,
})

/**
 * Tells whether a schema belongs to a binding's plugin: the plugin added or
 * claimed it, or designates it with a schema option the plugin defines (a
 * plugin's schema factory, such as `App.UserSchema`).
 */
export const isBindingOwnerSchema = (
	schema: SchemaDefinition,
	owner: PluginSchemaContributionOwner,
): boolean => {
	const { options, schema: source } = schema.definition.provenance
	return [
		source.owner,
		...Object.values(options).map(({ definition }) => definition.owner),
	].some(
		(candidate) =>
			candidate.kind === 'plugin' && isSameBindingOwner(candidate, owner),
	)
}

/** Compares binding owners by plugin identity, instance and version. */
export const isSameBindingOwner = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId &&
	left.instanceId === right.instanceId &&
	left.version === right.version
