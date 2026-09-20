import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type OperationTransportBindingDefinition,
	type PluginOperationInput,
	type PluginOperationResult,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	passwordAuthOperations,
	toPasswordAuthenticationPayload,
} from './operations.js'

type PasswordAuthOperation =
	(typeof passwordAuthOperations)[keyof typeof passwordAuthOperations]

const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})
const graphqlNamed = (name: string) => immutableRecord({ kind: 'named', name })
const graphqlNonNull = (ofType: ReturnType<typeof graphqlNamed>) =>
	immutableRecord({ kind: 'non-null', ofType })
const graphqlField = (name: string, type: ReturnType<typeof graphqlNonNull>) =>
	immutableRecord({ name, type })
const credentialsType = immutableRecord({
	fields: immutableArray([
		graphqlField('username', graphqlNonNull(graphqlNamed('String'))),
		graphqlField('password', graphqlNonNull(graphqlNamed('String'))),
	]),
	kind: 'input-object',
	name: 'PasswordAuthCredentialsInput',
})
const sessionType = immutableRecord({
	fields: immutableArray([
		graphqlField('id', graphqlNonNull(graphqlNamed('ID'))),
		graphqlField('token', graphqlNonNull(graphqlNamed('String'))),
		graphqlField('expiresAt', graphqlNonNull(graphqlNamed('DateTime'))),
		graphqlField('absoluteExpiresAt', graphqlNonNull(graphqlNamed('DateTime'))),
	]),
	kind: 'object',
	name: 'PasswordAuthSession',
})
const payloadType = immutableRecord({
	fields: immutableArray([
		immutableRecord({
			name: 'user',
			type: immutableRecord({
				kind: 'non-null',
				ofType: immutableRecord({ kind: 'schema', className: 'User' }),
			}),
		}),
		graphqlField(
			'session',
			graphqlNonNull(graphqlNamed('PasswordAuthSession')),
		),
	]),
	kind: 'object',
	name: 'PasswordAuthPayload',
})
const logoutPayloadType = immutableRecord({
	fields: immutableArray([
		graphqlField('revoked', graphqlNonNull(graphqlNamed('Boolean'))),
	]),
	kind: 'object',
	name: 'PasswordAuthLogoutPayload',
})
const authenticationTypes = immutableArray([sessionType, payloadType])

const createGraphqlBinding = <TOperation extends PasswordAuthOperation>(
	operation: TOperation,
	field: 'login' | 'logout' | 'refresh' | 'signUp',
	input: ReturnType<typeof graphqlNonNull> | undefined,
	types: readonly (
		| typeof credentialsType
		| typeof sessionType
		| typeof payloadType
		| typeof logoutPayloadType
	)[],
	result: ReturnType<typeof graphqlNonNull>,
	decode: (value: unknown) => PluginOperationInput<TOperation>,
	encode: (value: PluginOperationResult<TOperation>) => unknown,
) =>
	operationTransportBinding({
		codec: operationWireCodec({
			decode,
			encode,
			operation,
			transport: graphqlProtocol,
		}),
		metadata: immutableRecord({
			field,
			...(input === undefined ? {} : { input }),
			kind: 'graphql-operation-binding',
			result,
			root: 'mutation',
			types: immutableArray(types),
		}),
		operation,
	})

/** Provides canonical GraphQL bindings without importing the GraphQL package. */
export const passwordAuthGraphqlBindings: Readonly<
	Record<
		keyof typeof passwordAuthOperations,
		OperationTransportBindingDefinition
	>
> = immutableRecord({
	login: createGraphqlBinding(
		passwordAuthOperations.login,
		'login',
		graphqlNonNull(graphqlNamed('PasswordAuthCredentialsInput')),
		[credentialsType, ...authenticationTypes],
		graphqlNonNull(graphqlNamed('PasswordAuthPayload')),
		(value) =>
			passwordAuthOperations.login.input.snapshot(value, 'login.graphql-input'),
		toPasswordAuthenticationPayload,
	),
	logout: createGraphqlBinding(
		passwordAuthOperations.logout,
		'logout',
		undefined,
		[logoutPayloadType],
		graphqlNonNull(graphqlNamed('PasswordAuthLogoutPayload')),
		(value) =>
			passwordAuthOperations.logout.input.snapshot(
				value,
				'logout.graphql-input',
			),
		(value) => value,
	),
	refresh: createGraphqlBinding(
		passwordAuthOperations.refresh,
		'refresh',
		undefined,
		authenticationTypes,
		graphqlNonNull(graphqlNamed('PasswordAuthPayload')),
		(value) =>
			passwordAuthOperations.refresh.input.snapshot(
				value,
				'refresh.graphql-input',
			),
		toPasswordAuthenticationPayload,
	),
	signUp: createGraphqlBinding(
		passwordAuthOperations.signUp,
		'signUp',
		graphqlNonNull(graphqlNamed('PasswordAuthCredentialsInput')),
		[credentialsType, ...authenticationTypes],
		graphqlNonNull(graphqlNamed('PasswordAuthPayload')),
		(value) =>
			passwordAuthOperations.signUp.input.snapshot(
				value,
				'sign-up.graphql-input',
			),
		toPasswordAuthenticationPayload,
	),
})
