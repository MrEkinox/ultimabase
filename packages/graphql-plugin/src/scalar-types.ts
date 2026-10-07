import { getFieldListDepth, type GenericField } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLFloat,
	GraphQLID,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
	type GraphQLScalarType,
} from 'graphql'

import {
	GraphqlBase64,
	GraphqlBigInt,
	GraphqlDate,
	GraphqlDateTime,
	GraphqlDecimal,
	GraphqlJSON,
	GraphqlSafeInt,
	GraphqlTime,
	GraphqlUUID,
} from './scalars.js'

const graphqlScalarTypes: ReadonlyMap<string, GraphQLScalarType> = new Map([
	['bigint', GraphqlBigInt],
	['binary', GraphqlBase64],
	['boolean', GraphQLBoolean],
	['date', GraphqlDate],
	['dateTime', GraphqlDateTime],
	['decimal', GraphqlDecimal],
	['float', GraphQLFloat],
	['int', GraphqlSafeInt],
	['json', GraphqlJSON],
	['string', GraphQLString],
	['time', GraphqlTime],
	['uuid', GraphqlUUID],
])

const builtInTypes: ReadonlyMap<string, GraphQLScalarType> = new Map(
	[...graphqlScalarTypes.values(), GraphQLID, GraphQLInt].map((type) => [
		type.name,
		type,
	]),
)

/** Names every GraphQL v1 built-in scalar, which schemas may never redefine. */
export const graphqlBuiltInTypeNames: readonly string[] = [
	...builtInTypes.keys(),
]

/** Resolves a GraphQL v1 built-in scalar that bindings may reference by name. */
export const readGraphqlBuiltInType = (
	name: string,
): GraphQLScalarType | undefined => builtInTypes.get(name)

/** Resolves the one shared GraphQL representation for a Core scalar kind. */
export const readGraphqlScalarType = (
	kind: string,
): GraphQLScalarType | undefined => graphqlScalarTypes.get(kind)

const structuralFieldKinds: ReadonlySet<string> = new Set([
	'enum',
	'object',
	'pointer',
	'relation',
])

/** Separates Core field kinds from namespaced plugin kinds that need codecs. */
export const isGraphqlBuiltInFieldKind = (kind: string): boolean =>
	graphqlScalarTypes.has(kind) || structuralFieldKinds.has(kind)

/** Applies the one-dimensional Core list shape to an input or output type. */
export const wrapGraphqlFieldList = <
	TType extends GraphQLNullableInputType | GraphQLNullableOutputType,
>(
	type: TType,
	field: GenericField,
): TType | GraphQLList<GraphQLNonNull<TType>> =>
	getFieldListDepth(field.options) === 0
		? type
		: new GraphQLList(new GraphQLNonNull(type))

/** Resolves built-in scalar output kinds without guessing complex field shapes. */
export const readGraphqlScalarOutputType = (
	field: GenericField,
	systemId: boolean,
): GraphQLNullableOutputType | undefined =>
	field.kind === 'uuid' && systemId
		? GraphQLID
		: readGraphqlScalarType(field.kind)

/** Resolves built-in scalar and pointer input kinds before nested generation. */
export const readGraphqlScalarInputType = (
	field: GenericField,
): GraphQLNullableInputType | undefined =>
	field.kind === 'pointer' ? GraphQLID : readGraphqlScalarType(field.kind)
