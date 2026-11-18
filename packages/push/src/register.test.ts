// `push.register` and `push.unregister` (D-408): one device per session,
// an endpoint follows the session that last registered it.
import type { Caller } from 'ultimabase'
import { afterEach, describe, expect, it } from 'vitest'
import { M, PushDevice } from './device.ts'
import type { PushOptions } from './options.ts'
import { push } from './push.ts'
import { started, signedIn, User, web } from './test/app.ts'
import { fakeWebPush } from './testing.ts'

let stop = async () => undefined
afterEach(async () => {
	await stop()
	stop = async () => undefined
})

async function running(options: PushOptions | 'none' = { web }) {
	const app = await started(options === 'none' ? undefined : options)
	const fake = fakeWebPush()
	stop = async () => {
		fake.restore()
		await app.app.stop()
	}
	return { ...app, fake }
}

const devices = async () =>
	(
		await PushDevice.findMany(
			{
				select: {
					kind: true,
					sessionId: true,
					endpoint: true,
					user: { select: { id: true } },
				},
			},
			M,
		)
	).map(({ kind, sessionId, endpoint, user }) => ({
		kind,
		sessionId,
		endpoint,
		user: user?.id,
	}))

const sessionIdOf = (caller: Caller) =>
	caller.kind === 'user' ? caller.session?.id : undefined

const issue = (key: string, message: string) => ({
	path: ['web', key],
	message,
})

describe('push.register', () => {
	it('saves the device of the caller’s session', async () => {
		const { ada, fake } = await running()
		const caller = await signedIn(ada.id)
		const browser = fake.subscription()
		expect(await push.register(caller, { web: browser })).toBe(true)
		expect(await devices()).toStrictEqual([
			{
				kind: 'web',
				sessionId: sessionIdOf(caller),
				endpoint: browser.endpoint,
				user: ada.id,
			},
		])
	})

	it('replaces the device the session had', async () => {
		const { ada, fake } = await running()
		const caller = await signedIn(ada.id)
		await push.register(caller, { web: fake.subscription() })
		const browser = fake.subscription()
		await push.register(caller, { web: browser })
		expect(await devices()).toMatchObject([{ endpoint: browser.endpoint }])
	})

	it('moves an endpoint to the session that registers it, user included', async () => {
		const { ada, fake } = await running()
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		const browser = fake.subscription()
		await push.register(await signedIn(ada.id), { web: browser })
		await push.register(await signedIn(ada.id), { web: fake.subscription() })
		const caller = await signedIn(bob.id)
		await push.register(caller, { web: browser })
		const moved = (await devices()).filter(
			(device) => device.endpoint === browser.endpoint,
		)
		expect(moved).toStrictEqual([
			{
				kind: 'web',
				sessionId: sessionIdOf(caller),
				endpoint: browser.endpoint,
				user: bob.id,
			},
		])
		expect(await devices()).toHaveLength(2)
	})

	it('refuses a malformed subscription, naming each part', async () => {
		const { ada, fake } = await running()
		const caller = await signedIn(ada.id)
		const { p256dh, auth } = fake.subscription()
		const refused = async (subscription: unknown): Promise<unknown> => {
			const input: unknown = { web: subscription }
			// @ts-expect-error -- a client sends what it wants.
			return push.register(caller, input).catch((caught: unknown) => caught)
		}
		const url = 'is an https: URL of 2048 characters at most'
		const local = 'is a push service’s URL, not a local host or an address'
		const key = 'is the browser’s key, in base64url'
		const endpoints: readonly (readonly [string, string])[] = [
			['http://push.example.test/1', url],
			[`https://push.example.test/${'a'.repeat(2048)}`, url],
			['not a url', url],
			['https://localhost/1', local],
			['https://push.localhost/1', local],
			['https://10.0.0.1/1', local],
			['https://0x7f000001/1', local],
			['https://[::1]/1', local],
			['https://[fd00::1]/1', local],
		]
		for (const [endpoint, message] of endpoints) {
			expect(await refused({ endpoint, p256dh, auth })).toMatchObject({
				code: 'VALIDATION_FAILED',
				message: `web.endpoint: ${message}`,
				details: { issues: [issue('endpoint', message)] },
			})
		}
		const endpoint = 'https://push.example.test/1'
		for (const malformed of [
			{ p256dh: 'not base64url!' },
			{ p256dh: auth },
			{ p256dh: Buffer.alloc(65, 4).toString('base64url') },
			{ p256dh: 'A'.repeat(257) },
			{ auth: p256dh },
			{ auth: 7 },
		]) {
			const [part = ''] = Object.keys(malformed)
			expect(
				await refused({ endpoint, p256dh, auth, ...malformed }),
			).toMatchObject({
				code: 'VALIDATION_FAILED',
				details: { issues: [issue(part, key)] },
			})
		}
		expect(await refused({})).toMatchObject({
			message: `web.endpoint: ${url}`,
			details: {
				issues: [
					issue('endpoint', url),
					issue('p256dh', key),
					issue('auth', key),
				],
			},
		})
		expect(await refused(null)).toMatchObject({ code: 'VALIDATION_FAILED' })
		expect(await devices()).toStrictEqual([])
	})

	it('refuses a caller with no session, as a bug', async () => {
		const { ada } = await running()
		const message = 'push.register needs a caller signed in with a session.'
		const subscription = { endpoint: '', p256dh: '', auth: '' }
		for (const caller of [
			{ kind: 'anonymous' as const },
			{ kind: 'user' as const, user: ada },
		]) {
			await expect(
				push.register(caller, { web: subscription }),
			).rejects.toThrow(message)
		}
		await expect(push.unregister({ kind: 'anonymous' })).rejects.toThrow(
			'push.unregister needs a caller signed in with a session.',
		)
	})

	it('saves nothing without web keys, and the application says so once', async () => {
		const { ada, fake, warnings } = await running('none')
		const caller = await signedIn(ada.id)
		expect(await push.register(caller, { web: fake.subscription() })).toBe(
			false,
		)
		expect(await devices()).toStrictEqual([])
		expect(push.publicKey).toBeUndefined()
		expect(warnings).toStrictEqual([
			'pushPlugin() has no web keys: web devices are not registered and nothing is sent. Run npx @ultimabase/push keys.',
		])
	})

	it('runs while the application runs', async () => {
		const { ada, fake } = await running()
		const caller = await signedIn(ada.id)
		const subscription = fake.subscription()
		await stop()
		await expect(push.register(caller, { web: subscription })).rejects.toThrow(
			'push.register runs while an application with pushPlugin() runs.',
		)
		await expect(push.unregister(caller)).rejects.toThrow(
			'push.unregister runs while an application with pushPlugin() runs.',
		)
		expect(() => push.publicKey).toThrow(
			'push.publicKey runs while an application with pushPlugin() runs.',
		)
		await expect(push.send([], { title: '', body: '' })).rejects.toThrow(
			'push.send runs while an application with pushPlugin() runs.',
		)
	})
})

describe('push.unregister', () => {
	it('deletes the device of the caller’s session, and only it', async () => {
		const { ada, fake, warnings } = await running()
		const caller = await signedIn(ada.id)
		await push.register(caller, { web: fake.subscription() })
		const other = fake.subscription()
		await push.register(await signedIn(ada.id), { web: other })
		await push.unregister(caller)
		expect(await devices()).toMatchObject([{ endpoint: other.endpoint }])
		await push.unregister(caller)
		expect(push.publicKey).toBe(web.publicKey)
		expect(warnings).toStrictEqual([])
	})
})
