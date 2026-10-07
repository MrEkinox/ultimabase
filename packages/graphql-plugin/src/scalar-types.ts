import { getFieldListDepth, type GenericField } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLFloat,
	GraphQLID,
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

/** Resolves the one shared GraphQL representation for a Core scalar kind. */
export const readGraphqlScalarType = (
	kind: string,
): GraphQLScalarType | undefined => graphqlScalarTypes.get(kind)

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
