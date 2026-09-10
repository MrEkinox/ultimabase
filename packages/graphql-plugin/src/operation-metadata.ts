import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** References one named GraphQL type supplied by v1 or this binding. */
export interface GraphqlOperationNamedTypeReference {
	readonly kind: 'named'
	readonly name: string
}

/** References one exact application schema by Core class identity. */
export interface GraphqlOperationSchemaTypeReference {
	readonly className: string
	readonly kind: 'schema'
}

/** Wraps another operation type reference in one GraphQL list. */
export interface GraphqlOperationListTypeReference {
	readonly kind: 'list'
	readonly ofType: GraphqlOperationTypeReference
}

export type GraphqlOperationNullableTypeReference =
	| GraphqlOperationNamedTypeReference
	| GraphqlOperationSchemaTypeReference
	| GraphqlOperationListTypeReference

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

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	allowed: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !allowed.has(key)) {
			throw new TypeError(`${path} contains unknown key: ${String(key)}`)
		}
	}
}

const readString = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`)
	}
	return value
}

const normalizeNullableReference = (
	value: Readonly<Record<string, unknown>>,
	path: string,
): GraphqlOperationNullableTypeReference => {
	if (value.kind === 'named') {
		assertExactKeys(value, new Set(['kind', 'name']), path)
		return immutableRecord({
			kind: 'named' as const,
			name: readString(value.name, `${path}.name`),
		})
	}
	if (value.kind === 'schema') {
		assertExactKeys(value, new Set(['className', 'kind']), path)
		return immutableRecord({
			className: readString(value.className, `${path}.className`),
			kind: 'schema' as const,
		})
	}
	if (value.kind === 'list') {
		assertExactKeys(value, new Set(['kind', 'ofType']), path)
		return immutableRecord({
			kind: 'list' as const,
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
	assertExactKeys(value, new Set(['kind', 'ofType']), path)
	if (!isPlainRecord(value.ofType) || value.ofType.kind === 'non-null') {
		throw new TypeError(`${path}.ofType must be a nullable type reference`)
	}
	return immutableRecord({
		kind: 'non-null' as const,
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
			assertExactKeys(field, new Set(['name', 'type']), fieldPath)
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
		assertExactKeys(value, new Set(['kind', 'name', 'values']), path)
		if (!isUnknownArray(value.values) || value.values.length === 0) {
			throw new TypeError(`${path}.values must be a non-empty array`)
		}
		return immutableRecord({
			kind: 'enum' as const,
			name,
			values: immutableArray(
				value.values.map((item, index) =>
					readString(item, `${path}.values[${String(index)}]`),
				),
			),
		})
	}
	if (value.kind === 'input-object' || value.kind === 'object') {
		assertExactKeys(value, new Set(['fields', 'kind', 'name']), path)
		return immutableRecord({
			fields: normalizeFields(value.fields, `${path}.fields`),
			kind: value.kind,
			name,
		})
	}
	throw new TypeError(`${path}.kind must be enum, input-object, or object`)
}

/** Validates and snapshots one owner-supplied GraphQL binding description. */
export const normalizeGraphqlOperationBindingMetadata = (
	value: unknown,
	operation: string,
): GraphqlOperationBindingMetadata => {
	const path = `GraphQL binding for operation ${operation}`
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be a plain object`)
	assertExactKeys(
		value,
		new Set(['field', 'input', 'kind', 'result', 'root', 'types']),
		path,
	)
	if (value.kind !== 'graphql-operation-binding') {
		throw new TypeError(`${path}.kind must be graphql-operation-binding`)
	}
	if (value.root !== 'mutation' && value.root !== 'query') {
		throw new TypeError(`${path}.root must be query or mutation`)
	}
	if (!isUnknownArray(value.types)) {
		throw new TypeError(`${path}.types must be an array`)
	}
	return immutableRecord({
		field: readString(value.field, `${path}.field`),
		...(value.input === undefined
			? {}
			: { input: normalizeTypeReference(value.input, `${path}.input`) }),
		kind: 'graphql-operation-binding' as const,
		result: normalizeTypeReference(value.result, `${path}.result`),
		root: value.root,
		types: immutableArray(
			value.types.map((definition, index) =>
				normalizeSupportingType(definition, `${path}.types[${String(index)}]`),
			),
		),
	})
}

/** Validates one schema-mutation binding without accepting root-field control. */
export const normalizeGraphqlSchemaMutationBindingMetadata = (
	value: unknown,
	mutation: string,
): GraphqlSchemaMutationBindingMetadata => {
	const path = `GraphQL binding for schema mutation ${mutation}`
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertExactKeys(value, new Set(['input', 'kind', 'types']), path)
	if (value.kind !== 'graphql-schema-mutation-binding') {
		throw new TypeError(`${path}.kind must be graphql-schema-mutation-binding`)
	}
	if (!isUnknownArray(value.types)) {
		throw new TypeError(`${path}.types must be an array`)
	}
	return immutableRecord({
		...(value.input === undefined
			? {}
			: { input: normalizeTypeReference(value.input, `${path}.input`) }),
		kind: 'graphql-schema-mutation-binding' as const,
		types: immutableArray(
			value.types.map((definition, index) =>
				normalizeSupportingType(definition, `${path}.types[${String(index)}]`),
			),
		),
	})
}
