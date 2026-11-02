// A new password's checks (D-209): never the account's email, and, with
// `breached: true`, in no breach Have I Been Pwned knows; the service's
// failure accepts it, a test skips it, and production warns of no choice.
import { createHash } from 'node:crypto'
import { authPlugin } from '@ultimabase/auth'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { Logger } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Email, PasswordOptions } from './index.ts'
import { passwordPlugin } from './index.ts'
import {
	bearer,
	changeQuery,
	graphqlOf,
	M,
	signInQuery,
	started,
	tokenIn,
	tokenOf,
	User,
} from './test/app.ts'

const outbox: Email[] = []
const sendEmail = async (email: Email) => {
	outbox.push(email)
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
	await stop?.()
	stop = undefined
	outbox.length = 0
})

async function server(options: PasswordOptions = {}) {
	const running = await started({ signUp: ['name'], ...options })
	stop = async () => running.app.stop()
	return running
}

const ada = { email: 'ada.lovelace@example.com', data: { name: 'Ada' } }
const asEmail = {
	code: 'VALIDATION_FAILED',
	message: 'password: A password cannot be the email.',
	details: {
		issues: [
			{ path: ['password'], message: 'A password cannot be the email.' },
		],
	},
}
const inBreach = {
	code: 'VALIDATION_FAILED',
	message: 'password: This password appears in a data breach: choose another.',
}

const suffixOf = (password: string) =>
	createHash('sha1').update(password).digest('hex').toUpperCase().slice(5)

/** Have I Been Pwned, answering `body` for a range; other requests go out. */
function pwned(answer: () => Promise<Response>) {
	const real = globalThis.fetch
	const asked: { url: string; padding: string | null }[] = []
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = input instanceof Request ? input.url : String(input)
		if (!url.startsWith('https://api.pwnedpasswords.com/')) {
			return real(input, init)
		}
		const padding = new Headers(init?.headers).get('Add-Padding')
		asked.push({ url, padding })
		return answer()
	})
	return asked
}

/** A breach that holds `password`, among padding and other suffixes. */
const holding = (password: string) => async () =>
	new Response(
		`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffixOf(password)}:42\r\nFFFFF00000000000000000000000000000000:0`,
	)

describe('a password that is the email', () => {
	it('is refused at sign-up, as the email or its local part, any case', async () => {
		await server()
		for (const password of ['Ada.Lovelace@Example.com', 'ADA.LOVELACE']) {
			await expect(User.signUp({ ...ada, password }, M)).rejects.toMatchObject(
				asEmail,
			)
		}
		expect(await User.count({}, M)).toBe(0)
		await User.signUp({ ...ada, password: 'ada.lovelace!' }, M)
	})

	it('is refused by setPassword and changePassword, as the current email', async () => {
		const { url } = await server()
		const user = await User.signUp({ ...ada, password: 'correct horse' }, M)
		await expect(
			User.setPassword({ id: user.id, password: 'ada.lovelace' }, M),
		).rejects.toMatchObject(asEmail)
		const signed = await graphqlOf(url, signInQuery, {
			input: { email: ada.email, password: 'correct horse' },
		})
		const token = tokenOf(signed.body, 'signIn')
		const { body } = await graphqlOf(
			url,
			changeQuery,
			{
				input: {
					currentPassword: 'correct horse',
					newPassword: 'ada.lovelace',
				},
			},
			bearer(token),
		)
		expect(JSON.stringify(body)).toContain(
			'"message":"newPassword: A password cannot be the email."',
		)
		// The old password still signs in.
		await User.signIn({ email: ada.email, password: 'correct horse' })
	})

	it('keeps a reset link the refused password did not use', async () => {
		await server({ sendEmail })
		await User.signUp({ ...ada, password: 'correct horse' }, M)
		await User.requestPasswordReset({ email: ada.email })
		const token = tokenIn(outbox[0])
		await expect(
			User.resetPassword({ token, password: 'ada.lovelace' }),
		).rejects.toMatchObject(asEmail)
		await User.resetPassword({ token, password: 'battery staple' })
		await User.signIn({ email: ada.email, password: 'battery staple' })
	})
})

describe('passwordPlugin({ breached: true })', () => {
	it('refuses a password a breach holds, sending 5 characters with padding', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		const asked = pwned(holding('correct horse'))
		await server({ breached: true })
		await expect(
			User.signUp({ ...ada, password: 'correct horse' }, M),
		).rejects.toMatchObject(inBreach)
		const prefix = createHash('sha1')
			.update('correct horse')
			.digest('hex')
			.toUpperCase()
			.slice(0, 5)
		expect(asked).toEqual([
			{
				url: `https://api.pwnedpasswords.com/range/${prefix}`,
				padding: 'true',
			},
		])
		await User.signUp({ ...ada, password: 'battery staple' }, M)
	})

	it('refuses it on a reset and keeps the link', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		pwned(holding('correct horse'))
		await server({ breached: true, sendEmail })
		await User.signUp({ ...ada, password: 'battery staple' }, M)
		await User.requestPasswordReset({ email: ada.email })
		const token = tokenIn(outbox[0])
		await expect(
			User.resetPassword({ token, password: 'correct horse' }),
		).rejects.toMatchObject(inBreach)
		await User.resetPassword({ token, password: 'new secret!' })
	})

	it('accepts a suffix found only as padding', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		pwned(async () => new Response(`${suffixOf('correct horse')}:0\r\nABC:3`))
		await server({ breached: true })
		const user = await User.signUp({ ...ada, password: 'correct horse' }, M)
		expect(user.email).toBe(ada.email)
	})

	it('accepts the password, with a warning, when the service fails', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		const { warnings } = await server({ breached: true })
		const answers = [
			async () => new Response('', { status: 503 }),
			async () => Promise.reject(new Error('The network is down.')),
		]
		pwned(async () => (answers.shift() ?? holding(''))())
		await User.signUp({ ...ada, password: 'correct horse' }, M)
		const grace = { email: 'grace@example.com', data: { name: 'Grace' } }
		await User.signUp({ ...grace, password: 'correct horse' }, M)
		expect(warnings.filter((line) => line.startsWith('Have'))).toEqual([
			'Have I Been Pwned did not answer: the password was accepted unchecked.',
			'Have I Been Pwned did not answer: the password was accepted unchecked.',
		])
	})

	it('asks nothing in tests, nor on a sign-in', async () => {
		const asked = pwned(holding('correct horse'))
		await server({ breached: true })
		await User.signUp({ ...ada, password: 'correct horse' }, M)
		vi.stubEnv('NODE_ENV', 'development')
		await User.signIn({ email: ada.email, password: 'correct horse' })
		expect(asked).toEqual([])
	})
})

/** The warnings of a production start with `options`. */
async function warningsOf(options: PasswordOptions): Promise<string[]> {
	vi.stubEnv('NODE_ENV', 'production')
	const warnings: string[] = []
	const logger: Logger = {
		info: () => undefined,
		warn: (first) => {
			if (typeof first === 'string') warnings.push(first)
		},
		error: () => undefined,
		child: () => logger,
	}
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0, drain: 0 }),
			graphqlPlugin(),
			authPlugin(),
			passwordPlugin({ signUp: ['name'], ...options }),
		],
		models: [User],
		logger,
	})
	await app.start()
	await app.stop()
	return warnings.filter((line) => line.startsWith('Breached'))
}

describe('a production start', () => {
	it('warns once when the application did not choose', async () => {
		expect(await warningsOf({})).toEqual([
			'Breached passwords are accepted: passwordPlugin({ breached: true }) refuses them.',
		])
		expect(await warningsOf({ breached: false })).toEqual([])
		expect(await warningsOf({ breached: true })).toEqual([])
	})
})
