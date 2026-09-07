import type {
	ExposedOperationTransportBinding,
	PluginSchemaContributionOwner,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLFloat,
	GraphQLID,
	GraphQLInt,
	GraphQLString,
	type GraphQLNamedType,
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

export const graphqlOperationBuiltInTypes: ReadonlyMap<
	string,
	GraphQLNamedType
> = new Map([
	['Base64', GraphqlBase64],
	['BigInt', GraphqlBigInt],
	['Boolean', GraphQLBoolean],
	['Date', GraphqlDate],
	['DateTime', GraphqlDateTime],
	['Decimal', GraphqlDecimal],
	['Float', GraphQLFloat],
	['ID', GraphQLID],
	['Int', GraphQLInt],
	['JSON', GraphqlJSON],
	['SafeInt', GraphqlSafeInt],
	['String', GraphQLString],
	['Time', GraphqlTime],
	['UUID', GraphqlUUID],
])

export const operationOwnerFor = (
	descriptor: ExposedOperationTransportBinding,
): PluginSchemaContributionOwner => ({
	kind: 'plugin',
	...(descriptor.owner.instanceId === undefined
		? {}
		: { instanceId: descriptor.owner.instanceId }),
	pluginId: descriptor.owner.pluginId,
	version: descriptor.owner.version,
})

export const isSameOperationOwner = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId &&
	left.instanceId === right.instanceId &&
	left.version === right.version
