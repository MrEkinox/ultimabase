import { authPlugin } from '@ultimabase/auth-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { adaPassword } from './support.ts'

// Each `//#region` below is shown on the Password Authentication page; the
// assertions after it prove what the page says about the result.

const invalidCredentials = { code: 'AUTH_INVALID_CREDENTIALS' }

it('signs up and logs in by email', async () => {
	await using t = await testApplication(ultimabase)

	//#region sign-up
	const { user, session } = await Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: 'correct horse battery staple',
	})
	//#endregion sign-up

	// The readable profile and a token returned exactly once.
	expect(user).toMatchObject({
		displayName: 'Ada',
		email: 'ada@example.com',
		emailVerified: false,
		emailVerifiedAt: null,
	})
	expect(session.token).toMatch(/^ub_s1\./u)

	//#region login
	const login = await Member.login({
		email: ' Ada@Example.com ',
		password: 'correct horse battery staple',
	})
	//#endregion login

	// The email is trimmed and lowercased; each login opens its own session.
	expect(login.user.id).toBe(user.id)
	expect(login.session.id).not.toBe(session.id)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('rejects sign-ups and logins without saying why', async () => {
	await using t = await testApplication(ultimabase)
	await Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})

	// Missing or invalid fields are named; a short password is invalid.
	await expect(
		Member.signUp({
			displayName: 'Grace',
			email: 'not an email',
			password: 'too short',
		}),
	).rejects.toMatchObject({
		code: 'AUTH_SIGN_UP_REJECTED',
		publicDetails: { fields: ['email', 'password'] },
	})
	// A taken email is rejected without naming it.
	const duplicate = await Member.signUp({
		displayName: 'Imposter',
		email: 'ADA@example.com',
		password: adaPassword,
	}).catch((error: unknown) => error)
	expect(duplicate).toMatchObject({ code: 'AUTH_SIGN_UP_REJECTED' })
	expect(duplicate).not.toHaveProperty('publicDetails.fields')

	// A wrong password and an unknown email fail the same way.
	await expect(
		Member.login({ email: 'ada@example.com', password: 'wrong horse battery' }),
	).rejects.toMatchObject(invalidCredentials)
	await expect(
		Member.login({ email: 'nobody@example.com', password: adaPassword }),
	).rejects.toMatchObject(invalidCredentials)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('keeps the email fields to the authentication flows', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)

	//#region create-user
	// Server-side seeding: the User is created without any sign-in method.
	const id = await auth.createUser({
		data: { displayName: 'Grace' },
		email: 'grace@example.com',
	})
	//#endregion create-user

	expect(
		await t.asMaster(() =>
			Member.findOneOrThrow({ where: { id: { eq: id } } }),
		),
	).toMatchObject({ email: 'grace@example.com', emailVerified: false })
	// Master included, a direct create comes only from sign-up or createUser.
	await expect(
		t.asMaster(() => Member.createOne({ data: { displayName: 'Mallory' } })),
	).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: { issues: [{ code: 'auth.user-creation' }] },
	})
})
