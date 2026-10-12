import type {
	ExposedOperationTransportBinding,
	PluginSchemaContributionOwner,
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
			/** Includes ordinary create fields from a schema owned by this binding's plugin. */
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

const normalizeNullableReference = (
	value: Readonly<Record<string, unknown>>,
	path: string,
): GraphqlOperationNullableTypeReference => {
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
			ofType: normalizeTypeReference(value.ofType, `${path}.ofType`),
		})
	}
	throw new TypeError(`${path}.kind must be named, schema, list, or non-null`)
}

const normalizeTypeReference = (
	value: unknown,
	path: string,
): GraphqlOperationTypeReference => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain type reference`)
	}
	if (value.kind !== 'non-null') return normalizeNullableReference(value, path)
	assertKeys(value, ['kind', 'ofType'], path)
	if (!isPlainRecord(value.ofType) || value.ofType.kind === 'non-null') {
		throw new TypeError(`${path}.ofType must be a nullable type reference`)
	}
	return immutableRecord({
		kind: 'non-null',
		ofType: normalizeNullableReference(value.ofType, `${path}.ofType`),
	})
}

const normalizeFields = (
	value: unknown,
	path: string,
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
				type: normalizeTypeReference(field.type, `${fieldPath}.type`),
			})
		}),
	)
}

const normalizeSupportingType = (
	value: unknown,
	path: string,
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
			fields: normalizeFields(value.fields, `${path}.fields`),
			kind: value.kind,
			name,
			...(Object.hasOwn(value, 'createFieldsFrom')
				? {
						createFieldsFrom: readString(
							value.createFieldsFrom,
							`${path}.createFieldsFrom`,
						),
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
): readonly GraphqlOperationSupportingTypeDefinition[] =>
	immutableArray(
		value.map((definition, index) =>
			normalizeSupportingType(definition, `${path}.types[${String(index)}]`),
		),
	)

/** Validates and snapshots one owner-supplied GraphQL binding description. */
export const normalizeGraphqlOperationBindingMetadata = (
	value: unknown,
	operation: string,
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
			: { input: normalizeTypeReference(binding.input, `${path}.input`) }),
		kind: 'graphql-operation-binding',
		result: normalizeTypeReference(binding.result, `${path}.result`),
		root,
		types: normalizeSupportingTypes(binding.types, path),
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
			: { input: normalizeTypeReference(binding.input, `${path}.input`) }),
		kind: 'graphql-schema-mutation-binding',
		types: normalizeSupportingTypes(binding.types, path),
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

/** Compares binding owners by plugin identity, instance and version. */
export const isSameBindingOwner = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId &&
	left.instanceId === right.instanceId &&
	left.version === right.version
