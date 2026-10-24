// password's functions (D-113, D-114): `signUp`, `signIn` and `changePassword`, each
// taking one named input and returning `SignedIn`.
import type { ExposedModel, FunctionShape, OutputSpec } from 'ultimabase'
import { allow, defineFunction, defineType, PublicError } from 'ultimabase'
import type { State } from './core.ts'
import {
	attemptOf,
	checkCurrent,
	createUser,
	setPassword,
	signedIn,
	verified,
} from './core.ts'
import type { Mailer } from './email-functions.ts'
import { later } from './email-functions.ts'
import type { Property } from './input.ts'
import { requestLimited } from './models.ts'
import {
	changePasswordInput,
	outputSchema,
	signInInput,
	signUpInput,
} from './input.ts'

/** `User.nullable()`, which `ExposedModel.model` holds but does not type. */
function nullable(model: ExposedModel['model']): OutputSpec {
	const make: unknown = Reflect.get(model, 'nullable')
	if (typeof make !== 'function')
		throw new TypeError(`${model.name} is not a model.`)
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a `defineModel` value's `nullable()` (D-109).
	return Reflect.apply(make, model, []) as OutputSpec
}

/**
 * The functions, `signUp` only when sign-up is open; each is public. With a
 * `mailer`, `signUp` sends the verification email (D-117).
 */
export function passwordFunctions(
	stateOf: () => State,
	users: ExposedModel,
	fields: ReadonlyMap<string, Property> | false,
	mailer: Mailer | undefined,
): readonly FunctionShape[] {
	const SignedIn = defineType({
		name: 'SignedIn',
		fields: {
			token: outputSchema<string>({ type: 'string' }),
			expiresAt: outputSchema<Date>({ type: 'string', format: 'date-time' }),
			user: nullable(users.model),
		},
	})
	const signUp = defineFunction({
		name: 'signUp',
		input: signUpInput(fields === false ? new Map() : fields),
		output: SignedIn,
		run: async ({ input: { input }, client }) => {
			const state = stateOf()
			if (client !== undefined) await requestLimited('signUp', client.address)
			const { email, password, ...data } = input
			const { user, stamp } = await createUser(state, email, password, data)
			if (mailer !== undefined) {
				later(state, async () => {
					await mailer('verify', user.id, email)
				})
			}
			return signedIn(state, { userId: user.id, stamp }, client)
		},
	}).with({ access: allow.public })
	const signIn = defineFunction({
		name: 'signIn',
		input: signInInput,
		output: SignedIn,
		run: async ({ input: { input }, client }) => {
			const state = stateOf()
			const { email, password } = input
			const attempt = attemptOf(email, client)
			const checked = await verified(state, email, password, attempt)
			return signedIn(state, checked, client)
		},
	}).with({ access: allow.public })
	const changePassword = defineFunction({
		name: 'changePassword',
		input: changePasswordInput,
		output: SignedIn,
		run: async ({ input: { input }, caller, client }) => {
			if (caller.kind !== 'user') {
				throw new PublicError(
					'UNAUTHENTICATED',
					'changePassword needs a signed-in user.',
				)
			}
			const state = stateOf()
			const { id } = caller.user
			await checkCurrent(id, input.currentPassword, attemptOf(id, client))
			const stamp = await setPassword(state, id, input.newPassword)
			return signedIn(state, { userId: id, stamp }, client)
		},
	}).with({ access: allow.public })
	return fields === false
		? [signIn, changePassword]
		: [signUp, signIn, changePassword]
}
