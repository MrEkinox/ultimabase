import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type JsonValue,
	type OperationTransportBindingDefinition,
} from '@ultimabase/core'
import type {
	PluginOperationInput,
	PluginOperationResult,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	decodePasswordAuthInput,
	passwordAuthOperations,
	toPasswordAuthenticationPayload,
} from './operations.js'

type PasswordAuthOperationKey = keyof typeof passwordAuthOperations
type PasswordAuthOperation =
	(typeof passwordAuthOperations)[PasswordAuthOperationKey]

const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})
const graphqlNamed = (name: string) => immutableRecord({ kind: 'named', name })
const graphqlNonNull = (
	ofType: ReturnType<typeof graphqlNamed> | Readonly<{ kind: 'schema' }>,
) => immutableRecord({ kind: 'non-null', ofType })
/** Declares one required field of a named GraphQL type. */
const graphqlField = (name: string, type: string) =>
	immutableRecord({ name, type: graphqlNonNull(graphqlNamed(type)) })
const graphqlType = (
	kind: 'input-object' | 'object',
	name: string,
	fields: readonly ReturnType<typeof graphqlField>[],
) => immutableRecord({ fields: immutableArray(fields), kind, name })

const credentialsType = graphqlType(
	'input-object',
	'PasswordAuthCredentialsInput',
	[graphqlField('username', 'String'), graphqlField('password', 'String')],
)
const passwordChangeType = graphqlType(
	'input-object',
	'PasswordAuthChangePasswordInput',
	[
		graphqlField('currentPassword', 'String'),
		graphqlField('newPassword', 'String'),
	],
)
// Schema create fields supply username and application-specific requirements.
const signUpType = immutableRecord({
	createFieldsFrom: 'User',
	...graphqlType('input-object', 'PasswordAuthSignUpInput', [
		graphqlField('password', 'String'),
	]),
})
const sessionType = graphqlType('object', 'PasswordAuthSession', [
	graphqlField('id', 'ID'),
	graphqlField('token', 'String'),
	graphqlField('expiresAt', 'DateTime'),
	graphqlField('absoluteExpiresAt', 'DateTime'),
])
const payloadType = graphqlType('object', 'PasswordAuthPayload', [
	immutableRecord({
		name: 'user',
		type: graphqlNonNull(
			immutableRecord({ kind: 'schema', className: 'User' }),
		),
	}),
	graphqlField('session', 'PasswordAuthSession'),
])
const logoutPayloadType = graphqlType('object', 'PasswordAuthLogoutPayload', [
	graphqlField('revoked', 'Boolean'),
])
const passwordChangePayloadType = graphqlType(
	'object',
	'PasswordAuthChangePasswordPayload',
	[graphqlField('changed', 'Boolean')],
)
const authenticationTypes = [sessionType, payloadType] as const

const graphqlBinding = <TOperation extends PasswordAuthOperation>(
	operation: TOperation,
	field: PasswordAuthOperationKey,
	input: string | undefined,
	types: readonly JsonValue[],
	result: string,
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
			...(input === undefined
				? {}
				: { input: graphqlNonNull(graphqlNamed(input)) }),
			kind: 'graphql-operation-binding',
			result: graphqlNonNull(graphqlNamed(result)),
			root: 'mutation',
			types: immutableArray(types),
		}),
		operation,
	})

/** Provides canonical GraphQL bindings without importing the GraphQL package. */
export const passwordAuthGraphqlBindings: Readonly<
	Record<PasswordAuthOperationKey, OperationTransportBindingDefinition>
> = immutableRecord({
	changePassword: graphqlBinding(
		passwordAuthOperations.changePassword,
		'changePassword',
		'PasswordAuthChangePasswordInput',
		[passwordChangeType, passwordChangePayloadType],
		'PasswordAuthChangePasswordPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.changePassword.input,
			'change-password.graphql-input',
		),
		(value) => value,
	),
	login: graphqlBinding(
		passwordAuthOperations.login,
		'login',
		'PasswordAuthCredentialsInput',
		[credentialsType, ...authenticationTypes],
		'PasswordAuthPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.login.input,
			'login.graphql-input',
		),
		toPasswordAuthenticationPayload,
	),
	logout: graphqlBinding(
		passwordAuthOperations.logout,
		'logout',
		undefined,
		[logoutPayloadType],
		'PasswordAuthLogoutPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.logout.input,
			'logout.graphql-input',
		),
		(value) => value,
	),
	logoutEverywhere: graphqlBinding(
		passwordAuthOperations.logoutEverywhere,
		'logoutEverywhere',
		undefined,
		[logoutPayloadType],
		'PasswordAuthLogoutPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.logoutEverywhere.input,
			'logout-everywhere.graphql-input',
		),
		(value) => value,
	),
	refresh: graphqlBinding(
		passwordAuthOperations.refresh,
		'refresh',
		undefined,
		authenticationTypes,
		'PasswordAuthPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.refresh.input,
			'refresh.graphql-input',
		),
		toPasswordAuthenticationPayload,
	),
	signUp: graphqlBinding(
		passwordAuthOperations.signUp,
		'signUp',
		'PasswordAuthSignUpInput',
		[signUpType, ...authenticationTypes],
		'PasswordAuthPayload',
		decodePasswordAuthInput(
			passwordAuthOperations.signUp.input,
			'sign-up.graphql-input',
		),
		toPasswordAuthenticationPayload,
	),
})
