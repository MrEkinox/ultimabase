import { authPlugin } from '@ultimabase/auth-plugin'
import { testApplication } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { securityLog } from '../src/events.ts'
import { outbox } from '../src/mailer.ts'
import { Member } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import {
	adaPassword,
	newPassword,
	subjectsSentTo,
	tokenSentTo,
} from './support.ts'

const invalidToken = { code: 'AUTH_INVALID_TOKEN' }
const invalidSession = { code: 'AUTH_INVALID_SESSION' }
const accepted = { accepted: true }

const signUpAda = () =>
	Member.signUp({
		displayName: 'Ada',
		email: 'ada@example.com',
		password: adaPassword,
	})

beforeEach(() => {
	outbox.length = 0
	securityLog.length = 0
})

afterEach(() => {
	vi.useRealTimers()
})

it('resets a forgotten password through the emailed link', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { user, session } = await signUpAda()

	//#region request-reset
	const answer = await Member.requestPasswordReset({ email: 'ada@example.com' })
	//#endregion request-reset

	// Known and unknown addresses get the same answer; only Ada gets an email.
	expect(answer).toStrictEqual(accepted)
	expect(
		await Member.requestPasswordReset({ email: 'nobody@example.com' }),
	).toStrictEqual(accepted)
	await t.afterCommit()
	expect(subjectsSentTo('nobody@example.com')).toStrictEqual([])
	const token = tokenSentTo('ada@example.com', 'Reset your password')
	expect(token).toMatch(/^ub_r1\./u)

	//#region reset-password
	// The page the link opens reads the token from the URL fragment.
	await Member.resetPassword({
		token,
		newPassword: 'another correct horse battery staple',
	})
	//#endregion reset-password

	// Every session ends, the email counts as verified, nobody is logged in.
	await expect(
		auth.runWithSession(session.token, () => Member.current()),
	).rejects.toMatchObject(invalidSession)
	await expect(
		Member.resetPassword({ token, newPassword: adaPassword }),
	).rejects.toMatchObject(invalidToken)
	const login = await Member.login({
		email: 'ada@example.com',
		password: newPassword,
	})
	expect(login.user).toMatchObject({ emailVerified: true, id: user.id })
	await t.afterCommit()
	expect(securityLog).toContainEqual({
		address: null,
		event: 'password-reset',
		userId: user.id,
	})
})

it('expires a reset token after one hour', async () => {
	await using t = await testApplication(ultimabase)
	vi.useFakeTimers({ toFake: ['Date'] })
	await signUpAda()
	await Member.requestPasswordReset({ email: 'ada@example.com' })
	await t.afterCommit()
	const token = tokenSentTo('ada@example.com', 'Reset your password')

	vi.setSystemTime(Date.now() + 61 * 60_000)
	await expect(
		Member.resetPassword({ token, newPassword }),
	).rejects.toMatchObject(invalidToken)
	expect(await t.asMaster(() => Member.count())).toBe(1)
})

it('verifies the email with the latest token', async () => {
	await using t = await testApplication(ultimabase)
	const { user } = await signUpAda()
	await t.afterCommit()
	// Sign-up sent the first token; a new request replaces it.
	const first = tokenSentTo('ada@example.com', 'Verify your email')

	//#region request-verification
	await Member.requestEmailVerification({ email: 'ada@example.com' })
	//#endregion request-verification

	await t.afterCommit()
	const token = tokenSentTo('ada@example.com', 'Verify your email')
	expect(token).not.toBe(first)
	await expect(Member.verifyEmail({ token: first })).rejects.toMatchObject(
		invalidToken,
	)

	//#region verify-email
	await Member.verifyEmail({ token })
	//#endregion verify-email

	const verified = await t.asMaster(() =>
		Member.findOneOrThrow({ where: { id: { eq: user.id } } }),
	)
	expect(verified.emailVerified).toBe(true)
	expect(verified.emailVerifiedAt).not.toBeNull()
	// A verified address receives nothing more, with the same answer.
	expect(
		await Member.requestEmailVerification({ email: 'ada@example.com' }),
	).toStrictEqual(accepted)
	await t.afterCommit()
	expect(subjectsSentTo('ada@example.com')).toStrictEqual([
		'Verify your email',
		'Verify your email',
	])
})

it('changes the email once the new mailbox confirms it', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { user, session } = await signUpAda()
	await Member.signUp({
		displayName: 'Grace',
		email: 'grace@example.com',
		password: adaPassword,
	})

	//#region request-email-change
	await auth.runWithSession(session.token, () =>
		Member.requestEmailChange({
			currentPassword: 'correct horse battery staple',
			newEmail: 'ada@lovelace.example',
		}),
	)
	//#endregion request-email-change

	await t.afterCommit()
	const token = tokenSentTo('ada@lovelace.example', 'Confirm your new email')
	// Nothing changes before the confirmation.
	expect(
		await auth.runWithSession(session.token, () => Member.current()),
	).toMatchObject({ email: 'ada@example.com' })

	//#region confirm-email-change
	await Member.confirmEmailChange({ token })
	//#endregion confirm-email-change

	// The verified new email logs in, sessions stay, the old address is told.
	expect(
		await auth.runWithSession(session.token, () => Member.current()),
	).toMatchObject({ email: 'ada@lovelace.example', emailVerified: true })
	expect(
		await Member.login({
			email: 'ada@lovelace.example',
			password: adaPassword,
		}),
	).toMatchObject({ user: { id: user.id } })
	await t.afterCommit()
	expect(subjectsSentTo('ada@example.com')).toContain(
		'Your email changed to ada@lovelace.example',
	)
	// A wrong password fails; a taken address fails at confirmation, the
	// same way, so the request reveals no account.
	const rejected = { code: 'AUTH_EMAIL_CHANGE_REJECTED' }
	await expect(
		auth.runWithSession(session.token, () =>
			Member.requestEmailChange({
				currentPassword: newPassword,
				newEmail: 'ada@new.example',
			}),
		),
	).rejects.toMatchObject(rejected)
	expect(
		await auth.runWithSession(session.token, () =>
			Member.requestEmailChange({
				currentPassword: adaPassword,
				newEmail: 'grace@example.com',
			}),
		),
	).toStrictEqual(accepted)
	await t.afterCommit()
	await expect(
		Member.confirmEmailChange({
			token: tokenSentTo('grace@example.com', 'Confirm your new email'),
		}),
	).rejects.toMatchObject(rejected)
	expect(
		await auth.runWithSession(session.token, () => Member.current()),
	).toMatchObject({ email: 'ada@lovelace.example' })
})

it('cancels a pending email change when the password is reset', async () => {
	await using t = await testApplication(ultimabase)
	const auth = ultimabase.plugin(authPlugin)
	const { session } = await signUpAda()
	// Someone who stole the password asks to move the account away...
	await auth.runWithSession(session.token, () =>
		Member.requestEmailChange({
			currentPassword: adaPassword,
			newEmail: 'thief@example.com',
		}),
	)
	// ...and the owner recovers it first.
	await Member.requestPasswordReset({ email: 'ada@example.com' })
	await t.afterCommit()
	await Member.resetPassword({
		token: tokenSentTo('ada@example.com', 'Reset your password'),
		newPassword,
	})

	await expect(
		Member.confirmEmailChange({
			token: tokenSentTo('thief@example.com', 'Confirm your new email'),
		}),
	).rejects.toMatchObject(invalidToken)
	expect(
		await Member.login({ email: 'ada@example.com', password: newPassword }),
	).toMatchObject({ user: { email: 'ada@example.com' } })
})
