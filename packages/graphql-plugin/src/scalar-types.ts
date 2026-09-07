import type { GenericField } from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLFloat,
	GraphQLID,
	GraphQLString,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
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

/** Resolves built-in scalar output kinds without guessing complex field shapes. */
export const readGraphqlScalarOutputType = (
	field: GenericField,
	systemId: boolean,
): GraphQLNullableOutputType | undefined => {
	switch (field.kind) {
		case 'string':
			return GraphQLString
		case 'boolean':
			return GraphQLBoolean
		case 'int':
			return GraphqlSafeInt
		case 'float':
			return GraphQLFloat
		case 'bigint':
			return GraphqlBigInt
		case 'decimal':
			return GraphqlDecimal
		case 'date':
			return GraphqlDate
		case 'time':
			return GraphqlTime
		case 'dateTime':
			return GraphqlDateTime
		case 'binary':
			return GraphqlBase64
		case 'uuid':
			return systemId ? GraphQLID : GraphqlUUID
		case 'json':
			return GraphqlJSON
		default:
			return undefined
	}
}

/** Resolves built-in scalar and pointer input kinds before nested generation. */
export const readGraphqlScalarInputType = (
	field: GenericField,
): GraphQLNullableInputType | undefined => {
	switch (field.kind) {
		case 'string':
			return GraphQLString
		case 'boolean':
			return GraphQLBoolean
		case 'int':
			return GraphqlSafeInt
		case 'float':
			return GraphQLFloat
		case 'bigint':
			return GraphqlBigInt
		case 'decimal':
			return GraphqlDecimal
		case 'date':
			return GraphqlDate
		case 'time':
			return GraphqlTime
		case 'dateTime':
			return GraphqlDateTime
		case 'binary':
			return GraphqlBase64
		case 'uuid':
			return GraphqlUUID
		case 'json':
			return GraphqlJSON
		case 'pointer':
			return GraphQLID
		default:
			return undefined
	}
}
