import {
	authGraphqlBinding,
	authPayloadTypes,
	graphqlField,
	graphqlNonNull,
	graphqlObjectType,
	graphqlUser,
	toAuthPayload,
	type AuthHttpRoute,
} from '@ultimabase/auth-plugin'
import type { JsonValue } from '@ultimabase/core'
import type {
	PluginOperationBindingContribution,
	PluginOperationPublicDeclaration,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { PasswordIdentifier } from './handlers.js'
import { passwordOperations } from './operations.js'

const stringSchema = immutableRecord({ type: 'string' })

/** The JSON Schema of one input object with exactly these string fields. */
export const objectSchema = (names: readonly string[]): JsonValue =>
	immutableRecord({
		type: 'object',
		properties: immutableRecord(
			Object.fromEntries(names.map((name) => [name, stringSchema])),
		),
		required: immutableArray(names),
		additionalProperties: false,
	})

const userSchema = immutableRecord({ type: 'object' })
const sessionSignUpSchema: JsonValue = immutableRecord({
	type: 'object',
	properties: immutableRecord({
		session: immutableRecord({
			type: 'object',
			properties: immutableRecord({
				absoluteExpiresAt: stringSchema,
				expiresAt: stringSchema,
				id: stringSchema,
				token: stringSchema,
			}),
		}),
		user: userSchema,
	}),
	required: immutableArray(['session', 'user']),
})
// With `requireVerifiedEmail`, sign-up issues no session (6.4b amendment).
const pendingSignUpSchema: JsonValue = immutableRecord({
	type: 'object',
	properties: immutableRecord({
		user: userSchema,
		verificationRequired: immutableRecord({ const: true }),
	}),
	required: immutableArray(['user', 'verificationRequired']),
	additionalProperties: false,
})

/** The public names and input and result schemas of the password operations. */
export const createPasswordPublicOperations = (
	identifier: PasswordIdentifier,
	requireVerifiedEmail: boolean,
): Readonly<
	Record<keyof typeof passwordOperations, PluginOperationPublicDeclaration>
> =>
	immutableRecord({
		changePassword: immutableRecord({
			name: 'changePassword',
			input: objectSchema(['currentPassword', 'newPassword']),
		}),
		login: immutableRecord({
			name: 'login',
			input: objectSchema([identifier, 'password']),
		}),
		reauthenticate: immutableRecord({
			name: 'reauthenticate',
			input: objectSchema(['password']),
		}),
		signUp: immutableRecord({
			name: 'signUp',
			output: requireVerifiedEmail ? pendingSignUpSchema : sessionSignUpSchema,
		}),
	})

/** The GraphQL mutations of the password operations. */
export const createPasswordGraphqlBindings = (
	identifier: PasswordIdentifier,
	requireVerifiedEmail: boolean,
): readonly PluginOperationBindingContribution[] => {
	const signUpInput = graphqlObjectType(
		'input-object',
		'PasswordSignUpInput',
		[
			// The email is not a User create field: sign-up takes it.
			...(identifier === 'email' ? [graphqlField('email', 'String')] : []),
			graphqlField('password', 'String'),
		],
		true,
	)
	return immutableArray([
		requireVerifiedEmail
			? authGraphqlBinding({
					field: 'signUp',
					input: 'PasswordSignUpInput',
					operation: passwordOperations.signUp,
					result: 'PasswordSignUpPendingPayload',
					root: 'mutation',
					types: [
						signUpInput,
						graphqlObjectType('object', 'PasswordSignUpPendingPayload', [
							graphqlField('user', graphqlNonNull(graphqlUser)),
							graphqlField('verificationRequired', 'Boolean'),
						]),
					],
				})
			: authGraphqlBinding({
					encode: toAuthPayload,
					field: 'signUp',
					input: 'PasswordSignUpInput',
					operation: passwordOperations.signUp,
					result: 'AuthPayload',
					root: 'mutation',
					types: [signUpInput, ...authPayloadTypes],
				}),
		authGraphqlBinding({
			encode: toAuthPayload,
			field: 'login',
			input: 'PasswordLoginInput',
			operation: passwordOperations.login,
			result: 'AuthPayload',
			root: 'mutation',
			types: [
				graphqlObjectType('input-object', 'PasswordLoginInput', [
					graphqlField(identifier, 'String'),
					graphqlField('password', 'String'),
				]),
				...authPayloadTypes,
			],
		}),
		authGraphqlBinding({
			field: 'changePassword',
			input: 'PasswordChangeInput',
			operation: passwordOperations.changePassword,
			result: 'PasswordChangePayload',
			root: 'mutation',
			types: [
				graphqlObjectType('input-object', 'PasswordChangeInput', [
					graphqlField('currentPassword', 'String'),
					graphqlField('newPassword', 'String'),
				]),
				graphqlObjectType('object', 'PasswordChangePayload', [
					graphqlField('changed', 'Boolean'),
				]),
			],
		}),
		authGraphqlBinding({
			field: 'reauthenticate',
			input: 'PasswordReauthenticateInput',
			operation: passwordOperations.reauthenticate,
			result: 'PasswordReauthenticatePayload',
			root: 'mutation',
			types: [
				graphqlObjectType('input-object', 'PasswordReauthenticateInput', [
					graphqlField('password', 'String'),
				]),
				graphqlObjectType('object', 'PasswordReauthenticatePayload', [
					graphqlField('reauthenticated', 'Boolean'),
				]),
			],
		}),
	])
}

/** The HTTP routes of the password operations below the foundation's prefix. */
export const createPasswordRoutes = (
	requireVerifiedEmail: boolean,
): readonly AuthHttpRoute[] =>
	immutableArray<readonly AuthHttpRoute[]>([
		requireVerifiedEmail
			? // No session, so no cookie: the result names the pending verification.
				{
					anonymous: true,
					body: 'json',
					operation: passwordOperations.signUp,
					path: 'sign-up',
					response: 'result',
				}
			: {
					body: 'json',
					operation: passwordOperations.signUp,
					path: 'sign-up',
					response: 'session',
				},
		{
			body: 'json',
			operation: passwordOperations.login,
			path: 'login',
			response: 'session',
		},
		{
			body: 'json',
			operation: passwordOperations.changePassword,
			path: 'change-password',
			response: 'result',
		},
		{
			body: 'json',
			operation: passwordOperations.reauthenticate,
			path: 'reauthenticate',
			response: 'result',
		},
	])
