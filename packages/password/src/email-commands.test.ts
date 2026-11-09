// password's email flows as commands (D-198): the functions' tokens and
// emails, reached from server code, which waits for the email.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Caller } from 'ultimabase'
import { transaction } from 'ultimabase'
import type { Email, PasswordOptions } from './index.ts'
import { M, started, tokenIn, User } from './test/app.ts'

const outbox: Email[] = []
const sendEmail = async (email: Email) => {
	outbox.push(email)
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	outbox.length = 0
})

const ada = { email: 'ada@example.com', password: 'correct horse' }

/** Ada signed up by the command, which sends nothing, and her caller. */
async function server(options: PasswordOptions = { sendEmail }) {
	const running = await started({ signUp: ['name'], ...options })
	stop = async () => running.app.stop()
	const user = await User.signUp({ ...ada, data: { name: 'Ada' } })
	const asAda: { as: Caller } = { as: { kind: 'user', user } }
	return { ...running, user, asAda }
}

const grace = async () => {
	const user = await User.signUp({
		email: 'grace@example.com',
		password: 'correct horse',
		data: { name: 'Grace' },
	})
	const asGrace: { as: Caller } = { as: { kind: 'user', user } }
	return { user, asGrace }
}

const verified = async (id: string) =>
	(await User.findUnique({ where: { id } }, M))?.emailVerified
const denied = (command: string) => ({
	code: 'ACCESS_DENIED',
	message: `User.${command} runs as Master or as the user.`,
})
const invalidLink = {
	code: 'INVALID_CREDENTIALS',
	message: 'This link is invalid or has expired.',
}

describe('User.requestPasswordReset', () => {
	it('has sent the reset link once it resolves', async () => {
		const { user } = await server()
		const done = User.requestPasswordReset({ email: ' ADA@example.com ' })
		expectTypeOf(done).toEqualTypeOf<Promise<void>>()
		await done
		// The row Master reads, `email` included, which a read rule guards.
		const row = await User.findUnique({ where: { id: user.id } }, M)
		expect(row?.email).toBe(ada.email)
		expect(outbox).toEqual([
			{ kind: 'reset', to: ada.email, token: tokenIn(outbox[0]), user: row },
		])
	})

	it('sends nothing to an email without an account', async () => {
		await server()
		await User.requestPasswordReset({ email: 'nobody@example.com' })
		expect(outbox).toEqual([])
	})

	it('refuses an invalid email', async () => {
		await server()
		await expect(
			User.requestPasswordReset({ email: 'ada' }),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			message: 'email: Expected an email address.',
		})
	})

	it('fails past the account three emails per hour, never limited by address', async () => {
		await server()
		for (let sent = 0; sent < 3; sent += 1) {
			await User.requestPasswordReset({ email: ada.email })
		}
		await expect(
			User.requestPasswordReset({ email: ada.email }),
		).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' })
		expect(outbox).toHaveLength(3)
	})

	it('rejects with the error sendEmail throws', async () => {
		const down = new Error('The mail service is down.')
		await server({
			sendEmail: async () => {
				throw down
			},
		})
		await expect(User.requestPasswordReset({ email: ada.email })).rejects.toBe(
			down,
		)
	})
})

describe('User.resetPassword', () => {
	it('sets the password the link chose and verifies the email', async () => {
		const { user } = await server()
		await User.requestPasswordReset({ email: ada.email })
		const token = tokenIn(outbox[0])
		await User.resetPassword({ token, password: 'new secret!' })
		expect(await verified(user.id)).toBe(true)
		const signed = await User.signIn({ ...ada, password: 'new secret!' })
		expect(signed.user?.id).toBe(user.id)
		await expect(
			User.resetPassword({ token, password: 'other secret' }),
		).rejects.toMatchObject(invalidLink)
	})

	it('refuses a password too short before redeeming the link', async () => {
		await server()
		await User.requestPasswordReset({ email: ada.email })
		const token = tokenIn(outbox[0])
		await expect(
			User.resetPassword({ token, password: 'short' }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await User.resetPassword({ token, password: 'new secret!' })
	})
})

describe('User.sendVerificationEmail and User.verifyEmail', () => {
	it('sends the link as Master or as the user, and verifies with it', async () => {
		const { user, asAda } = await server()
		await User.sendVerificationEmail({ id: user.id }, M)
		await User.sendVerificationEmail({ id: user.id }, asAda)
		expect(outbox.map(({ kind, to }) => [kind, to])).toEqual([
			['verify', ada.email],
			['verify', ada.email],
		])
		await User.verifyEmail({ token: tokenIn(outbox[1]) })
		expect(await verified(user.id)).toBe(true)
		await expect(
			User.verifyEmail({ token: tokenIn(outbox[0]) }),
		).rejects.toMatchObject(invalidLink)
	})

	it('refuses another user and an anonymous caller', async () => {
		const { user } = await server()
		const { asGrace } = await grace()
		const command = 'sendVerificationEmail'
		await expect(
			User.sendVerificationEmail({ id: user.id }, asGrace),
		).rejects.toMatchObject(denied(command))
		await expect(
			User.sendVerificationEmail({ id: user.id }),
		).rejects.toMatchObject(denied(command))
		expect(outbox).toEqual([])
	})

	it('sends nothing to a verified email, a user without a password or none', async () => {
		const { user } = await server()
		await User.update(
			{ where: { id: user.id }, data: { emailVerified: true } },
			M,
		)
		await User.sendVerificationEmail({ id: user.id }, M)
		const other = await User.create({ data: { name: 'Grace' } }, M)
		await User.sendVerificationEmail({ id: other.id }, M)
		await User.sendVerificationEmail({ id: 'missing' }, M)
		expect(outbox).toEqual([])
	})
})

describe('User.requestEmailChange and User.confirmEmailChange', () => {
	it('moves the user to the new email, which the old one is told', async () => {
		const { user, asAda } = await server()
		const newEmail = 'ada@new.example'
		await User.requestEmailChange({ id: user.id, newEmail }, asAda)
		expect(outbox.map(({ kind, to }) => [kind, to])).toEqual([
			['emailChange', newEmail],
		])
		await User.confirmEmailChange({ token: tokenIn(outbox[0]) })
		const row = await User.findUnique({ where: { id: user.id } }, M)
		expect([row?.email, row?.emailVerified]).toEqual([newEmail, true])
		await vi.waitFor(() => {
			expect(outbox.at(-1)).toEqual({
				kind: 'emailChanged',
				to: ada.email,
				newEmail,
				// Read once the change commits: its new email.
				user: row,
			})
		})
	})

	it('tells no user deleted before the notice goes', async () => {
		const { user, app } = await server()
		const where = { id: user.id }
		await transaction(async () => {
			await User.update({ where, data: { email: 'ada@new.example' } }, M)
			await User.delete({ where }, M)
		})
		// Stopping waits for the emails under way.
		await app.stop()
		expect(outbox).toEqual([])
	})

	it('refuses a taken email with its details, and another caller', async () => {
		const { user } = await server()
		const { asGrace } = await grace()
		await expect(
			User.requestEmailChange(
				{ id: user.id, newEmail: 'GRACE@example.com' },
				M,
			),
		).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			details: { model: 'User', fields: ['email'] },
		})
		await expect(
			User.requestEmailChange(
				{ id: user.id, newEmail: 'ada@new.example' },
				asGrace,
			),
		).rejects.toMatchObject(denied('requestEmailChange'))
		await expect(
			User.requestEmailChange({ id: user.id, newEmail: 'ada' }, M),
		).rejects.toMatchObject({ message: 'newEmail: Expected an email address.' })
		expect(outbox).toEqual([])
	})
})

describe('without sendEmail', () => {
	it('throws on the commands that send, and finds no link to redeem', async () => {
		const { user } = await server({})
		const id = user.id
		await expect(
			User.requestPasswordReset({ email: ada.email }),
		).rejects.toThrow(
			'User.requestPasswordReset needs passwordPlugin({ sendEmail }).',
		)
		await expect(User.sendVerificationEmail({ id }, M)).rejects.toThrow(
			'User.sendVerificationEmail needs passwordPlugin({ sendEmail }).',
		)
		await expect(
			User.requestEmailChange({ id, newEmail: 'ada@new.example' }, M),
		).rejects.toThrow(
			'User.requestEmailChange needs passwordPlugin({ sendEmail }).',
		)
		await expect(
			User.confirmEmailChange({ token: 'unknown' }),
		).rejects.toMatchObject(invalidLink)
	})
})
