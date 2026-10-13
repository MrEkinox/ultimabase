import { testApplication } from '@ultimabase/testing'
import { expect, expectTypeOf, it } from 'vitest'

import { Reader, strict } from '../src/strict.ts'
import { adaPassword, tokenSentTo } from './support.ts'

it('issues no session before the email is verified', async () => {
	await using t = await testApplication(strict)

	//#region pending-sign-up
	const pending = await Reader.signUp({
		email: 'ada@example.com',
		password: 'correct horse battery staple',
	})
	//#endregion pending-sign-up

	// The profile without a session; the type says so too.
	expectTypeOf(pending.verificationRequired).toEqualTypeOf<true>()
	expect(pending).toMatchObject({
		user: { email: 'ada@example.com', emailVerified: false },
		verificationRequired: true,
	})
	expect(pending).not.toHaveProperty('session')
	// The right password is refused until the email is verified.
	await expect(
		Reader.login({ email: 'ada@example.com', password: adaPassword }),
	).rejects.toMatchObject({ code: 'AUTH_EMAIL_NOT_VERIFIED' })

	await t.afterCommit()
	await Reader.verifyEmail({
		token: tokenSentTo('ada@example.com', 'Verify your email'),
	})
	const { session, user } = await Reader.login({
		email: 'ada@example.com',
		password: adaPassword,
	})
	expect(session.token).toMatch(/^ub_s1\./u)
	expect(user).toMatchObject({ emailVerified: true })
})
