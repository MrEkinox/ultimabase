// password's limits against many addresses (D-114): IPv6 networks, the
// account and address ceilings, the hashing queue and the sign-up limit.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicError } from 'ultimabase'
import { hashPassword, lanes, waiting } from './hash.ts'
import {
	limited,
	networkOf,
	PasswordAttempt,
	PasswordRequest,
} from './models.ts'
import { graphqlOf, M, signUpQuery, started } from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
})

async function server() {
	const running = await started()
	stop = async () => running.app.stop()
	return running
}

const wrong = async () => {
	throw new PublicError('INVALID_CREDENTIALS', 'Wrong email or password.')
}
const fail = async (subject: string, address: string) =>
	limited({ subject, address }, wrong).catch((error: unknown) => error)
const tooMany = { code: 'TOO_MANY_ATTEMPTS' }

describe('networkOf', () => {
	it('counts an IPv6 address as its /64 network', () => {
		expect(networkOf('2001:db8:0:1::1')).toBe('2001:db8:0:1::/64')
		expect(networkOf('2001:0db8:0000:0001:ffff::2')).toBe('2001:db8:0:1::/64')
		expect(networkOf('2001:db8::')).toBe('2001:db8:0:0::/64')
		expect(networkOf('::1')).toBe('0:0:0:0::/64')
		expect(networkOf('fe80::1%en0')).toBe('fe80:0:0:0::/64')
		expect(networkOf('64:ff9b:1:2::1.2.3.4')).toBe('64:ff9b:1:2::/64')
	})

	it('counts an IPv4 address, mapped or not, as itself', () => {
		expect(networkOf('::ffff:192.0.2.1')).toBe('192.0.2.1')
		expect(networkOf('192.0.2.1')).toBe('192.0.2.1')
		expect(networkOf('')).toBe('')
	})
})

describe('the sign-in limit', () => {
	it('counts the addresses of one /64 network together', async () => {
		await server()
		for (let failure = 0; failure < 10; failure += 1) {
			await fail('ada@example.com', `2001:db8::${failure + 1}`)
		}
		expect(await fail('ada@example.com', '2001:db8::ff')).toMatchObject(tooMany)
		expect(await fail('ada@example.com', '2001:db9::1')).toMatchObject({
			code: 'INVALID_CREDENTIALS',
		})
	})

	it('refuses the 101st failure on an account from any address', async () => {
		await server()
		const now = Date.now()
		for (let failure = 0; failure < 100; failure += 1) {
			vi.spyOn(Date, 'now').mockReturnValue(now + failure * 1000)
			await fail('ada@example.com', `192.0.2.${failure}`)
		}
		vi.spyOn(Date, 'now').mockReturnValue(now + 100 * 1000)
		expect(await fail('ada@example.com', '198.51.100.1')).toMatchObject({
			...tooMany,
			details: { retryAfter: 800 },
		})
		const succeeded = await limited(
			{ subject: 'ada@example.com', address: '198.51.100.1' },
			async () => 'signed in',
		).catch((error: unknown) => error)
		expect(succeeded).toMatchObject(tooMany)
		expect(await fail('bob@example.com', '198.51.100.1')).toMatchObject({
			code: 'INVALID_CREDENTIALS',
		})
	})

	it('refuses the 101st failure from an address on any account', async () => {
		await server()
		const now = Date.now()
		for (let failure = 0; failure < 100; failure += 1) {
			vi.spyOn(Date, 'now').mockReturnValue(now + failure * 1000)
			await fail(`user${failure}@example.com`, '192.0.2.1')
		}
		vi.spyOn(Date, 'now').mockReturnValue(now + 100 * 1000)
		expect(await fail('ada@example.com', '192.0.2.1')).toMatchObject({
			...tooMany,
			details: { retryAfter: 800 },
		})
		expect(await fail('ada@example.com', '198.51.100.1')).toMatchObject({
			code: 'INVALID_CREDENTIALS',
		})
	})

	it('retries after the later of the two limits', async () => {
		await server()
		const now = Date.now()
		for (let failure = 0; failure < 100; failure += 1) {
			vi.spyOn(Date, 'now').mockReturnValue(now + failure * 1000)
			const address = failure < 90 ? `192.0.2.${failure}` : '198.51.100.1'
			await fail('ada@example.com', address)
		}
		vi.spyOn(Date, 'now').mockReturnValue(now + 100 * 1000)
		// The address's tenth failure, at 90 s, ends after the account's first.
		expect(await fail('ada@example.com', '198.51.100.1')).toMatchObject({
			details: { retryAfter: 890 },
		})
	})

	it('does not count an attempt the busy server refused', async () => {
		await server()
		const busy = await limited({ subject: 'ada', address: '::1' }, async () => {
			throw new PublicError('TOO_MANY_ATTEMPTS', 'The server is busy.')
		}).catch((error: unknown) => error)
		expect(busy).toMatchObject(tooMany)
		expect(await PasswordAttempt.count({}, M)).toBe(0)
	})
})

describe('the hashing queue', () => {
	it(`runs ${lanes} at once, queues ${waiting} and refuses one more`, async () => {
		const results = await Promise.allSettled(
			Array.from({ length: lanes + waiting + 1 }, async () =>
				hashPassword('correct horse'),
			),
		)
		const refused = results.filter((result) => result.status === 'rejected')
		expect(refused).toHaveLength(1)
		expect(refused[0]).toMatchObject({
			reason: { ...tooMany, details: { retryAfter: 1 } },
		})
		expect(await hashPassword('correct horse')).toMatch(/^\$argon2id\$/)
	})
})

describe('the sign-up limit', () => {
	it('refuses the eleventh sign-up from an address within one hour', async () => {
		const { url } = await server()
		const now = Date.now()
		const signUp = async (index: number) =>
			graphqlOf(url, signUpQuery, {
				input: {
					email: `user${index}@example.com`,
					password: 'correct horse',
					name: `User ${index}`,
				},
			})
		for (let index = 0; index < 10; index += 1) {
			vi.spyOn(Date, 'now').mockReturnValue(now + index * 1000)
			expect((await signUp(index)).body).not.toHaveProperty('errors')
		}
		vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 1000)
		expect(JSON.stringify((await signUp(10)).body)).toContain(
			'"code":"TOO_MANY_ATTEMPTS","details":{"retryAfter":3590}',
		)
		vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000)
		expect((await signUp(11)).body).not.toHaveProperty('errors')
		expect(await PasswordRequest.count({}, M)).toBe(10)
	})
})
