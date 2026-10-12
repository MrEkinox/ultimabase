import {
	authGraphqlBinding,
	graphqlField,
	graphqlObjectType,
	type AuthHttpRoute,
	type AuthStaticsServices,
} from '@ultimabase/auth-plugin'
import type {
	PluginOperationBindingContribution,
	PluginOperationPublicDeclaration,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	passwordEmailOperations,
	type EmailChangeConfirmResult,
	type EmailChangeRequestInput,
	type EmailVerifyResult,
	type PasswordEmailInput,
	type PasswordRequestAcceptedResult,
	type PasswordResetInput,
	type PasswordResetResult,
	type PasswordTokenInput,
} from './email-operations.js'

/** Static members `password({ identifier: 'email' })` adds to the User class. */
export interface PasswordEmailUserStatics {
	/**
	 * Sends a reset token through `sendResetEmail` when the address has an
	 * account; the answer is the same either way.
	 * @example `await TodoUser.requestPasswordReset({ email })`
	 */
	requestPasswordReset(
		input: PasswordEmailInput,
	): Promise<PasswordRequestAcceptedResult>
	/**
	 * Sets a new password with a reset token, verifies the email and revokes
	 * every session.
	 * @example `await TodoUser.resetPassword({ token, newPassword })`
	 */
	resetPassword(input: PasswordResetInput): Promise<PasswordResetResult>
	/**
	 * Sends a verification token through `sendVerificationEmail` when the
	 * address has an unverified account; the answer is the same either way.
	 * @example `await TodoUser.requestEmailVerification({ email })`
	 */
	requestEmailVerification(
		input: PasswordEmailInput,
	): Promise<PasswordRequestAcceptedResult>
	/**
	 * Verifies the email a verification token was sent to.
	 * @example `await TodoUser.verifyEmail({ token })`
	 */
	verifyEmail(input: PasswordTokenInput): Promise<EmailVerifyResult>
	/**
	 * Checks the current password, then sends a confirmation token to the new
	 * address through `sendConfirmationEmail`.
	 * @example `await TodoUser.requestEmailChange({ currentPassword, newEmail })`
	 */
	requestEmailChange(
		input: EmailChangeRequestInput,
	): Promise<PasswordRequestAcceptedResult>
	/**
	 * Replaces the email with the confirmed, verified address and notifies
	 * the previous one through `sendNoticeEmail`.
	 * @example `await TodoUser.confirmEmailChange({ token })`
	 */
	confirmEmailChange(
		input: PasswordTokenInput,
	): Promise<EmailChangeConfirmResult>
}

const stringSchema = immutableRecord({ type: 'string' })
const objectSchema = (names: readonly string[]) =>
	immutableRecord({
		type: 'object',
		properties: immutableRecord(
			Object.fromEntries(names.map((name) => [name, stringSchema])),
		),
		required: immutableArray(names),
		additionalProperties: false,
	})

/** The public names and input schemas of the email operations. */
export const passwordEmailPublicOperations: Readonly<
	Record<keyof typeof passwordEmailOperations, PluginOperationPublicDeclaration>
> = immutableRecord({
	confirmEmailChange: immutableRecord({
		name: 'confirmEmailChange',
		input: objectSchema(['token']),
	}),
	requestEmailChange: immutableRecord({
		name: 'requestEmailChange',
		input: objectSchema(['currentPassword', 'newEmail']),
	}),
	requestEmailVerification: immutableRecord({
		name: 'requestEmailVerification',
		input: objectSchema(['email']),
	}),
	requestPasswordReset: immutableRecord({
		name: 'requestPasswordReset',
		input: objectSchema(['email']),
	}),
	resetPassword: immutableRecord({
		name: 'resetPassword',
		input: objectSchema(['newPassword', 'token']),
	}),
	verifyEmail: immutableRecord({
		name: 'verifyEmail',
		input: objectSchema(['token']),
	}),
})

const emailInputType = graphqlObjectType('input-object', 'PasswordEmailInput', [
	graphqlField('email', 'String'),
])
const tokenInputType = graphqlObjectType('input-object', 'PasswordTokenInput', [
	graphqlField('token', 'String'),
])
const acceptedType = graphqlObjectType(
	'object',
	'PasswordRequestAcceptedPayload',
	[graphqlField('accepted', 'Boolean')],
)

/** The GraphQL mutations of the email operations. */
export const passwordEmailGraphqlBindings: readonly PluginOperationBindingContribution[] =
	immutableArray([
		authGraphqlBinding({
			field: 'requestPasswordReset',
			input: 'PasswordEmailInput',
			operation: passwordEmailOperations.requestPasswordReset,
			result: 'PasswordRequestAcceptedPayload',
			root: 'mutation',
			types: [emailInputType, acceptedType],
		}),
		authGraphqlBinding({
			field: 'resetPassword',
			input: 'PasswordResetInput',
			operation: passwordEmailOperations.resetPassword,
			result: 'PasswordResetPayload',
			root: 'mutation',
			types: [
				graphqlObjectType('input-object', 'PasswordResetInput', [
					graphqlField('token', 'String'),
					graphqlField('newPassword', 'String'),
				]),
				graphqlObjectType('object', 'PasswordResetPayload', [
					graphqlField('reset', 'Boolean'),
				]),
			],
		}),
		authGraphqlBinding({
			field: 'requestEmailVerification',
			input: 'PasswordEmailInput',
			operation: passwordEmailOperations.requestEmailVerification,
			result: 'PasswordRequestAcceptedPayload',
			root: 'mutation',
			types: [emailInputType, acceptedType],
		}),
		authGraphqlBinding({
			field: 'verifyEmail',
			input: 'PasswordTokenInput',
			operation: passwordEmailOperations.verifyEmail,
			result: 'EmailVerifyPayload',
			root: 'mutation',
			types: [
				tokenInputType,
				graphqlObjectType('object', 'EmailVerifyPayload', [
					graphqlField('verified', 'Boolean'),
				]),
			],
		}),
		authGraphqlBinding({
			field: 'requestEmailChange',
			input: 'EmailChangeRequestInput',
			operation: passwordEmailOperations.requestEmailChange,
			result: 'PasswordRequestAcceptedPayload',
			root: 'mutation',
			types: [
				graphqlObjectType('input-object', 'EmailChangeRequestInput', [
					graphqlField('currentPassword', 'String'),
					graphqlField('newEmail', 'String'),
				]),
				acceptedType,
			],
		}),
		authGraphqlBinding({
			field: 'confirmEmailChange',
			input: 'PasswordTokenInput',
			operation: passwordEmailOperations.confirmEmailChange,
			result: 'EmailChangeConfirmPayload',
			root: 'mutation',
			types: [
				tokenInputType,
				graphqlObjectType('object', 'EmailChangeConfirmPayload', [
					graphqlField('confirmed', 'Boolean'),
				]),
			],
		}),
	])

/** The HTTP routes of the email operations below the foundation's prefix. */
export const passwordEmailRoutes: readonly AuthHttpRoute[] = immutableArray([
	{
		anonymous: true,
		body: 'json',
		operation: passwordEmailOperations.requestPasswordReset,
		path: 'request-password-reset',
		response: 'result',
	},
	{
		// Every session ends: a browser's cookie is cleared too.
		anonymous: true,
		body: 'json',
		operation: passwordEmailOperations.resetPassword,
		path: 'reset-password',
		response: 'clear',
	},
	{
		anonymous: true,
		body: 'json',
		operation: passwordEmailOperations.requestEmailVerification,
		path: 'request-email-verification',
		response: 'result',
	},
	{
		anonymous: true,
		body: 'json',
		operation: passwordEmailOperations.verifyEmail,
		path: 'verify-email',
		response: 'result',
	},
	{
		body: 'json',
		operation: passwordEmailOperations.requestEmailChange,
		path: 'request-email-change',
		response: 'result',
	},
	{
		anonymous: true,
		body: 'json',
		operation: passwordEmailOperations.confirmEmailChange,
		path: 'confirm-email-change',
		response: 'result',
	},
] as const)

/** Creates the email statics of one User class. */
export const createPasswordEmailStatics = (
	services: AuthStaticsServices,
): PasswordEmailUserStatics =>
	immutableRecord({
		requestPasswordReset: (input: PasswordEmailInput) =>
			services.execute(passwordEmailOperations.requestPasswordReset, input),
		resetPassword: (input: PasswordResetInput) =>
			services.execute(passwordEmailOperations.resetPassword, input),
		requestEmailVerification: (input: PasswordEmailInput) =>
			services.execute(passwordEmailOperations.requestEmailVerification, input),
		verifyEmail: (input: PasswordTokenInput) =>
			services.execute(passwordEmailOperations.verifyEmail, input),
		requestEmailChange: (input: EmailChangeRequestInput) =>
			services.execute(passwordEmailOperations.requestEmailChange, input),
		confirmEmailChange: (input: PasswordTokenInput) =>
			services.execute(passwordEmailOperations.confirmEmailChange, input),
	})
