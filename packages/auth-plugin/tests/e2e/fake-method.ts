import {
	contributeOperation,
	defineOperation,
	defineOperationValue,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	authenticationResult,
	defineAuthMethod,
	type AuthenticationResult,
	type AuthMethod,
	type AuthMethodInfo,
	type AuthMethodStaticsHKT,
} from '../../src/index.js'

/** One external account a test provider vouches for. */
export interface FakeAccountInput {
	readonly email: string | null
	readonly emailVerified: boolean
	readonly providerUserId: string
}

const accountInput = defineOperationValue<FakeAccountInput>((value, path) => {
	if (
		!isPlainRecord(value) ||
		typeof value.providerUserId !== 'string' ||
		(value.email !== null && typeof value.email !== 'string') ||
		typeof value.emailVerified !== 'boolean'
	) {
		throw new TypeError(`${path} must be a fake account`)
	}
	return immutableRecord({
		email: value.email,
		emailVerified: value.emailVerified,
		providerUserId: value.providerUserId,
	})
})
const linkResult = defineOperationValue<AuthMethodInfo>((value, path) => {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be a method`)
	return value as unknown as AuthMethodInfo
})

/** Signs in through the fake provider: linked user, verified email, or a new user. */
export const fakeSignIn: PluginOperationDefinition<
	'fixture.auth.fake.sign-in',
	'1.0.0',
	'application',
	FakeAccountInput,
	AuthenticationResult,
	readonly []
> = defineOperation({
	errors: [],
	input: accountInput,
	name: 'fixture.auth.fake.sign-in',
	result: authenticationResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

/** Links one fake account to the authenticated user. */
export const fakeLink: PluginOperationDefinition<
	'fixture.auth.fake.link',
	'1.0.0',
	'application',
	FakeAccountInput,
	AuthMethodInfo,
	readonly []
> = defineOperation({
	errors: [],
	input: accountInput,
	name: 'fixture.auth.fake.link',
	result: linkResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

/** A test-only sign-in method proving the method contract and linking. */
export const fakeMethod = (): AuthMethod<
	'fake',
	Readonly<Record<never, never>>,
	AuthMethodStaticsHKT,
	typeof fakeSignIn | typeof fakeLink
> =>
	defineAuthMethod<
		'fake',
		Readonly<Record<never, never>>,
		AuthMethodStaticsHKT,
		typeof fakeSignIn | typeof fakeLink
	>({
		name: 'fake',
		contributions: (services) => [
			contributeOperation({
				operation: fakeSignIn,
				execute: ({ context, input }) =>
					services.authenticateAccount({
						account: { ...input, method: 'fake' },
						context,
						createUser: () => services.createUser({}, context),
					}),
			}),
			contributeOperation({
				operation: fakeLink,
				execute: ({ context, input }) =>
					services.linkAccount(services.requireAuthenticated(context).userId, {
						...input,
						method: 'fake',
					}),
			}),
		],
	})
