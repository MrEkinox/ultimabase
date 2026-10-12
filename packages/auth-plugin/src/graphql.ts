import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type JsonValue,
	type OperationTransportBindingDefinition,
} from '@ultimabase/core'
import {
	contributeOperationBinding,
	type PluginOperationBindingContribution,
	type PluginOperationDefinition,
	type PluginOperationInput,
	type PluginOperationResult,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { authOperations } from './operations.js'

// GraphQL's binding vocabulary, written as inert JSON so that no auth package
// imports GraphQL (ADR-0325).
const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})

type TypeReference = Readonly<Record<string, JsonValue>>

/** A named GraphQL type, such as `String`. */
export const graphqlNamed = (name: string): TypeReference =>
	immutableRecord({ kind: 'named', name })
/** A required GraphQL type. */
export const graphqlNonNull = (ofType: TypeReference): TypeReference =>
	immutableRecord({ kind: 'non-null', ofType })
/** A GraphQL list type. */
export const graphqlList = (ofType: TypeReference): TypeReference =>
	immutableRecord({ kind: 'list', ofType })
/** The User type, whatever class name the application chose. */
export const graphqlUser: TypeReference = immutableRecord({
	kind: 'owned-schema',
})
/** One field of a supporting GraphQL type; a string names a required type. */
export const graphqlField = (
	name: string,
	type: string | TypeReference,
): TypeReference =>
	immutableRecord({
		name,
		type: typeof type === 'string' ? graphqlNonNull(graphqlNamed(type)) : type,
	})
/** One supporting input or output object type. */
export const graphqlObjectType = (
	kind: 'input-object' | 'object',
	name: string,
	fields: readonly TypeReference[],
	createFieldsFromUser = false,
): TypeReference =>
	immutableRecord({
		...(createFieldsFromUser ? { createFieldsFrom: graphqlUser } : {}),
		fields: immutableArray(fields),
		kind,
		name,
	})

const sessionType = graphqlObjectType('object', 'AuthSession', [
	graphqlField('id', 'ID'),
	graphqlField('token', 'String'),
	graphqlField('expiresAt', 'DateTime'),
	graphqlField('absoluteExpiresAt', 'DateTime'),
])
const payloadType = graphqlObjectType('object', 'AuthPayload', [
	graphqlField('user', graphqlNonNull(graphqlUser)),
	graphqlField('session', 'AuthSession'),
])

/** The types of `AuthPayload`, the result of every sign-in. */
export const authPayloadTypes: readonly TypeReference[] = immutableArray([
	sessionType,
	payloadType,
])

/** Keeps the profile and session of a sign-in result, without its principal. */
export const toAuthPayload = (value: unknown): unknown =>
	isPlainRecord(value)
		? immutableRecord({ session: value.session, user: value.user })
		: value

/** Binds one operation to a GraphQL root field without importing GraphQL. */
export const authGraphqlBinding = <
	const TOperation extends PluginOperationDefinition,
>(options: {
	readonly field: string
	/** The required input object type name; omitted, the field takes no argument. */
	readonly input?: string
	readonly operation: TOperation
	/** The required result type. */
	readonly result: string | TypeReference
	readonly root: 'mutation' | 'query'
	readonly types: readonly TypeReference[]
	readonly encode?: (value: PluginOperationResult<TOperation>) => unknown
}): PluginOperationBindingContribution<OperationTransportBindingDefinition> =>
	contributeOperationBinding(
		operationTransportBinding({
			codec: operationWireCodec({
				decode: (value: unknown): PluginOperationInput<TOperation> =>
					options.operation.input.snapshot(
						value,
						`${options.field}.graphql-input`,
					) as PluginOperationInput<TOperation>,
				encode: (value) => (options.encode ?? ((same) => same))(value),
				operation: options.operation,
				transport: graphqlProtocol,
			}),
			metadata: immutableRecord({
				field: options.field,
				...(options.input === undefined
					? {}
					: { input: graphqlNonNull(graphqlNamed(options.input)) }),
				kind: 'graphql-operation-binding',
				result:
					typeof options.result === 'string'
						? graphqlNonNull(graphqlNamed(options.result))
						: graphqlNonNull(options.result),
				root: options.root,
				types: immutableArray(options.types),
			}),
			operation: options.operation,
		}),
	)

const idInputType = graphqlObjectType('input-object', 'AuthIdInput', [
	graphqlField('id', 'ID'),
])
const logoutType = graphqlObjectType('object', 'AuthLogoutPayload', [
	graphqlField('revoked', 'Boolean'),
])
const sessionInfoType = graphqlObjectType('object', 'AuthSessionInfo', [
	graphqlField('id', 'ID'),
	graphqlField('current', 'Boolean'),
	graphqlField('method', 'String'),
	graphqlField('createdAt', 'DateTime'),
	graphqlField('lastUsedAt', 'DateTime'),
	graphqlField('expiresAt', 'DateTime'),
	graphqlField('address', graphqlNamed('String')),
	graphqlField('device', graphqlNamed('String')),
])
const sessionListType = graphqlObjectType('object', 'AuthSessionList', [
	graphqlField(
		'sessions',
		graphqlNonNull(
			graphqlList(graphqlNonNull(graphqlNamed('AuthSessionInfo'))),
		),
	),
])
const methodInfoType = graphqlObjectType('object', 'AuthMethodInfo', [
	graphqlField('id', 'ID'),
	graphqlField('method', 'String'),
	graphqlField('createdAt', 'DateTime'),
	graphqlField('email', graphqlNamed('String')),
	graphqlField('emailVerified', 'Boolean'),
])
const methodListType = graphqlObjectType('object', 'AuthMethodList', [
	graphqlField(
		'methods',
		graphqlNonNull(graphqlList(graphqlNonNull(graphqlNamed('AuthMethodInfo')))),
	),
])
const unlinkType = graphqlObjectType('object', 'AuthUnlinkPayload', [
	graphqlField('unlinked', 'Boolean'),
])
const deleteType = graphqlObjectType('object', 'AuthDeleteAccountPayload', [
	graphqlField('deleted', 'Boolean'),
])

/** The GraphQL fields of the foundation's operations. */
export const authGraphqlBindings: readonly PluginOperationBindingContribution<OperationTransportBindingDefinition>[] =
	immutableArray([
		authGraphqlBinding({
			field: 'current',
			operation: authOperations.current,
			result: graphqlUser,
			root: 'query',
			types: [],
		}),
		authGraphqlBinding({
			encode: toAuthPayload,
			field: 'refresh',
			operation: authOperations.refresh,
			result: 'AuthPayload',
			root: 'mutation',
			types: authPayloadTypes,
		}),
		authGraphqlBinding({
			field: 'logout',
			operation: authOperations.logout,
			result: 'AuthLogoutPayload',
			root: 'mutation',
			types: [logoutType],
		}),
		authGraphqlBinding({
			field: 'logoutEverywhere',
			operation: authOperations.logoutEverywhere,
			result: 'AuthLogoutPayload',
			root: 'mutation',
			types: [logoutType],
		}),
		authGraphqlBinding({
			field: 'listSessions',
			operation: authOperations.listSessions,
			result: 'AuthSessionList',
			root: 'query',
			types: [sessionInfoType, sessionListType],
		}),
		authGraphqlBinding({
			field: 'revokeSession',
			input: 'AuthIdInput',
			operation: authOperations.revokeSession,
			result: 'AuthLogoutPayload',
			root: 'mutation',
			types: [idInputType, logoutType],
		}),
		authGraphqlBinding({
			field: 'listMethods',
			operation: authOperations.listMethods,
			result: 'AuthMethodList',
			root: 'query',
			types: [methodInfoType, methodListType],
		}),
		authGraphqlBinding({
			field: 'unlinkMethod',
			input: 'AuthIdInput',
			operation: authOperations.unlinkMethod,
			result: 'AuthUnlinkPayload',
			root: 'mutation',
			types: [idInputType, unlinkType],
		}),
		authGraphqlBinding({
			field: 'deleteAccount',
			operation: authOperations.deleteAccount,
			result: 'AuthDeleteAccountPayload',
			root: 'mutation',
			types: [deleteType],
		}),
	])
