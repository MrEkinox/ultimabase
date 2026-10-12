import type { ExposedOperationTransportBinding } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	GraphqlOperationBindingMetadata,
	GraphqlOperationNullableTypeReference,
	GraphqlOperationSupportingTypeDefinition,
	GraphqlOperationTypeFieldDefinition,
	GraphqlOperationTypeReference,
} from './binding-metadata.js'
import { graphqlFieldTypeSegment, isGraphqlName } from './compile-context.js'

type Mode = 'input' | 'output'

const named = (name: string): GraphqlOperationNullableTypeReference =>
	immutableRecord({ kind: 'named' as const, name })
const json = named('JSON')
const scalars: Readonly<Record<string, string>> = {
	boolean: 'Boolean',
	integer: 'SafeInt',
	number: 'Float',
	string: 'String',
}

/** Splits `anyOf: [S, { type: 'null' }]` and `type: [T, 'null']` into S and nullability. */
const unwrapNullable = (
	schema: Readonly<Record<string, unknown>>,
): readonly [Readonly<Record<string, unknown>>, boolean] => {
	const { anyOf, type } = schema
	if (isUnknownArray(anyOf) && anyOf.length === 2) {
		const other = anyOf.filter(
			(item) => !(isPlainRecord(item) && item.type === 'null'),
		)
		const [only] = other
		if (other.length === 1 && isPlainRecord(only)) return [only, true]
	}
	if (isUnknownArray(type) && type.length === 2 && type.includes('null')) {
		return [{ ...schema, type: type.find((item) => item !== 'null') }, true]
	}
	return [schema, false]
}

/**
 * Converts the JSON Schema an operation's owner declared public into GraphQL
 * types (ADR-0325, 6.6c amendment): objects become input or output object
 * types named `<Base><Property>`, string enums become enums, lists and
 * nullability follow the schema, and any part GraphQL cannot describe falls
 * back to the `JSON` scalar for that part only.
 */
class JsonSchemaTypes {
	readonly types: GraphqlOperationSupportingTypeDefinition[] = []
	readonly #mode: Mode

	constructor(mode: Mode) {
		this.#mode = mode
	}

	/** The reference of one schema, non-null unless the schema admits `null`. */
	reference(schema: unknown, name: string): GraphqlOperationTypeReference {
		if (!isPlainRecord(schema)) return json
		const [inner, nullable] = unwrapNullable(schema)
		const type = this.#nullable(inner, name)
		return nullable || type === json
			? type
			: immutableRecord({ kind: 'non-null' as const, ofType: type })
	}

	#nullable(
		schema: Readonly<Record<string, unknown>>,
		name: string,
	): GraphqlOperationNullableTypeReference {
		const { enum: values, type } = schema
		if (isUnknownArray(values)) return this.#enum(values, type, name)
		if (typeof type !== 'string') return json
		if (type === 'array') {
			return isPlainRecord(schema.items)
				? immutableRecord({
						kind: 'list' as const,
						ofType: this.reference(schema.items, name),
					})
				: json
		}
		if (type === 'object') return this.#object(schema, name)
		const scalar = scalars[type]
		return scalar === undefined ? json : named(scalar)
	}

	#enum(
		values: readonly unknown[],
		type: unknown,
		name: string,
	): GraphqlOperationNullableTypeReference {
		const strings = values.filter(
			(value): value is string => typeof value === 'string',
		)
		if (strings.length !== values.length || strings.length === 0) return json
		// Values GraphQL cannot name stay plain strings, checked by the validator.
		if (
			!strings.every(isGraphqlName) ||
			new Set(strings).size !== strings.length
		) {
			return type === 'string' || type === undefined ? named('String') : json
		}
		this.types.push(
			immutableRecord({
				kind: 'enum' as const,
				name,
				values: immutableArray(strings),
			}),
		)
		return named(name)
	}

	#object(
		schema: Readonly<Record<string, unknown>>,
		name: string,
	): GraphqlOperationNullableTypeReference {
		const { additionalProperties, properties, required } = schema
		// An open object or one without properties keeps every key as JSON.
		if (
			!isPlainRecord(properties) ||
			(additionalProperties !== undefined && additionalProperties !== false)
		) {
			return json
		}
		const entries = Object.entries(properties)
		if (entries.length === 0 || !entries.every(([key]) => isGraphqlName(key))) {
			return json
		}
		const requiredKeys = new Set(isUnknownArray(required) ? required : [])
		const fields: GraphqlOperationTypeFieldDefinition[] = entries.map(
			([key, property]) => {
				const reference = this.reference(
					property,
					`${name}${graphqlFieldTypeSegment(key)}`,
				)
				// A property the object may omit is nullable in GraphQL.
				return immutableRecord({
					name: key,
					type:
						reference.kind === 'non-null' && !requiredKeys.has(key)
							? reference.ofType
							: reference,
				})
			},
		)
		this.types.push(
			immutableRecord({
				fields: immutableArray(fields),
				kind:
					this.#mode === 'input'
						? ('input-object' as const)
						: ('object' as const),
				name,
			}),
		)
		return named(name)
	}
}

/**
 * The GraphQL form of a public operation its owner did not bind (ADR-0325,
 * 6.6c amendment): a mutation named after the public name whose input and
 * result types derive from the JSON Schema of its validators. A `null` input
 * takes no argument; a missing schema is `JSON`.
 */
export const describeUnboundOperation = (
	descriptor: ExposedOperationTransportBinding,
): GraphqlOperationBindingMetadata => {
	const field = descriptor.public?.name ?? descriptor.name
	const base = graphqlFieldTypeSegment(field)
	const inputs = new JsonSchemaTypes('input')
	const outputs = new JsonSchemaTypes('output')
	const inputSchema = descriptor.public?.input
	const noInput = isPlainRecord(inputSchema) && inputSchema.type === 'null'
	const input =
		inputSchema === undefined
			? json
			: noInput
				? undefined
				: inputs.reference(inputSchema, `${base}Input`)
	const result =
		descriptor.public?.output === undefined
			? json
			: outputs.reference(descriptor.public.output, `${base}Result`)
	return immutableRecord({
		field,
		...(input === undefined ? {} : { input }),
		kind: 'graphql-operation-binding' as const,
		result,
		root: 'mutation' as const,
		types: immutableArray([...inputs.types, ...outputs.types]),
	})
}
