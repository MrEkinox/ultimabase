// `push.send` (D-408): each live device gets the message, encrypted for it;
// an ended session or an unsubscribed browser deletes its device.
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { M, PushDevice } from './device.ts'
import { maxMessage } from './encrypt.ts'
import type { PushOptions } from './options.ts'
import { push } from './push.ts'
import { usePost } from './running.ts'
import { revoked, signedIn, started, User, web } from './test/app.ts'
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
	// A device of a new session of `userId`.
	const device = async (userId: string) => {
		const subscription = fake.subscription()
		await push.register(await signedIn(userId), { web: subscription })
		return subscription.endpoint
	}
	return { ...app, fake, device }
}

const endpoints = async () =>
	(await PushDevice.findMany({ orderBy: { endpoint: 'asc' } }, M)).map(
		(row) => row.endpoint,
	)

const message = { title: 'New message', body: 'Ada wrote to you.' }

describe('push.send', () => {
	it('sends each device of the users the message, decrypted by each', async () => {
		const { ada, fake, device } = await running()
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		const eve = await User.create({ data: { email: 'eve@example.com' } }, M)
		const first = await device(ada.id)
		const second = await device(ada.id)
		const third = await device(bob.id)
		await device(eve.id)
		const full = { ...message, url: '/inbox', tag: 'inbox', data: { id: 7 } }
		expect(await push.send([ada.id, bob.id], full)).toStrictEqual({
			sent: 3,
			gone: 0,
			failed: 0,
		})
		const pushes = fake.pushes.toSorted((a, b) =>
			a.endpoint.localeCompare(b.endpoint),
		)
		const received = {
			message: full,
			ttl: 86_400,
			urgency: undefined,
			topic: 'inbox',
		}
		expect(pushes).toStrictEqual([
			{ endpoint: first, ...received },
			{ endpoint: second, ...received },
			{ endpoint: third, ...received },
		])
	})

	it('passes ttl, urgency and a topic a push service accepts', async () => {
		const { ada, fake, device } = await running()
		await device(ada.id)
		const tag = 'conversation:42 with a long name'
		await push.send([ada.id], { ...message, tag }, { ttl: 0, urgency: 'high' })
		await push.send([ada.id], message, { urgency: 'very-low' })
		const digest = createHash('sha256').update(tag).digest('base64url')
		expect(fake.pushes).toMatchObject([
			{
				message: { ...message, tag },
				ttl: 0,
				urgency: 'high',
				topic: digest.slice(0, 32),
			},
			{
				message: { ...message, tag: undefined },
				urgency: 'very-low',
				topic: undefined,
			},
		])
	})

	it('refuses, before sending, a message or options a push cannot carry', async () => {
		const { ada, fake, device } = await running()
		await device(ada.id)
		const room = maxMessage - JSON.stringify({ ...message, data: '' }).length
		const largest = { ...message, data: 'a'.repeat(room) }
		await push.send([ada.id], largest)
		const larger = { ...message, data: 'a'.repeat(room + 1) }
		await expect(push.send([ada.id], larger)).rejects.toThrow(
			`push.send: the message is ${maxMessage + 1} bytes, over the ${maxMessage} a push carries.`,
		)
		for (const ttl of [-1, 1.5, Number.NaN]) {
			await expect(push.send([ada.id], message, { ttl })).rejects.toThrow(
				'push.send: ttl is a number of seconds, 0 or more.',
			)
		}
		const now: unknown = { urgency: 'now' }
		// @ts-expect-error -- a job may compute it.
		const sending = push.send([ada.id], message, now)
		await expect(sending).rejects.toThrow(
			'push.send: urgency is very-low, low, normal or high.',
		)
		expect(fake.pushes.map((each) => each.message.data)).toStrictEqual([
			largest.data,
		])
	})

	it('deletes the devices of ended sessions, and counts them gone', async () => {
		const { ada, fake, device } = await running()
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		await device(ada.id)
		await device(ada.id)
		const kept = await device(bob.id)
		await revoked(ada.id)
		expect(await push.send([ada.id, bob.id], message)).toStrictEqual({
			sent: 1,
			gone: 2,
			failed: 0,
		})
		expect(await endpoints()).toStrictEqual([kept])
		expect(fake.pushes.map((each) => each.endpoint)).toStrictEqual([kept])
	})

	it('deletes a device its push service answers 404 or 410 for', async () => {
		const { ada, fake, device } = await running()
		const unsubscribed = await device(ada.id)
		const kept = await device(ada.id)
		fake.gone(unsubscribed)
		expect(await push.send([ada.id], message)).toMatchObject({
			sent: 1,
			gone: 1,
		})
		expect(await endpoints()).toStrictEqual([kept])
		// A push service that forgot the endpoint answers 404.
		await PushDevice.update(
			{
				where: { endpoint: kept },
				data: { endpoint: 'https://push.example.test/forgotten' },
			},
			M,
		)
		expect(await push.send([ada.id], message)).toStrictEqual({
			sent: 0,
			gone: 1,
			failed: 0,
		})
		expect(await endpoints()).toStrictEqual([])
	})

	it('logs and counts any other failure, naming the push service only', async () => {
		const { ada, device, warnings } = await running()
		const refused = await device(ada.id)
		const silent = await device(ada.id)
		const error = new Error('fetch failed')
		usePost(async (endpoint) => {
			if (endpoint === silent) throw error
			return endpoint === refused ? 500 : 201
		})
		expect(await push.send([ada.id], message)).toStrictEqual({
			sent: 0,
			gone: 0,
			failed: 2,
		})
		const origin = 'https://push.example.test'
		expect(warnings).toHaveLength(2)
		expect(warnings).toContainEqual([
			{ origin, status: 500 },
			'A push service refused a push.',
		])
		expect(warnings).toContainEqual([
			{ err: error, origin },
			'A push service did not answer.',
		])
		expect(await endpoints()).toHaveLength(2)
	})

	it('sends 32 pushes at once at most', async () => {
		const { ada, device } = await running()
		for (let index = 0; index < 40; index += 1) await device(ada.id)
		let flying = 0
		let most = 0
		usePost(async () => {
			flying += 1
			most = Math.max(most, flying)
			await new Promise((resolve) => setTimeout(resolve, 5))
			flying -= 1
			return 201
		})
		expect(await push.send([ada.id], message)).toMatchObject({ sent: 40 })
		expect(most).toBe(32)
	})

	it('sends nothing to no one, or without web keys', async () => {
		const { ada, fake, device } = await running()
		await device(ada.id)
		expect(await push.send([], message)).toStrictEqual({
			sent: 0,
			gone: 0,
			failed: 0,
		})
		await stop()
		const keyless = await running({ web: undefined })
		expect(await push.send([keyless.ada.id], message)).toStrictEqual({
			sent: 0,
			gone: 0,
			failed: 0,
		})
		expect(fake.pushes).toStrictEqual([])
	})
})
