// What a whole platform costs one process: every user connected with what each
// screen holds, and writes at a sustained rate. The rate climbs until delivery
// no longer keeps up. In the engine, without sockets or serialization.
// `node --max-old-space-size=24576 bench/realtime/platform.ts --scenario chat`
import { parseArgs } from 'node:util'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { LiveMessage } from '@ultimabase/realtime'
import { defineApp } from 'ultimabase'
import { silent } from '../../packages/testing/src/silent.ts'
import { climbing } from './platform-climb.ts'
import {
	badgeRuns,
	badges,
	Campaign,
	CampaignMember,
	CampaignNpc,
	Chat,
	ChatMember,
	ChatMessage,
	FriendRequest,
	playedBy,
	User,
} from './platform-models.ts'
import { seed, writerOf } from './platform-writes.ts'
import { benched, plugins, urlOf, waited } from './shared.ts'

const { values } = parseArgs({
	options: {
		scenario: { type: 'string', default: 'chat' },
		users: { type: 'string', default: '10000' },
		rates: { type: 'string', default: '5,10,20,50,100,200,500,1000' },
		seconds: { type: 'string', default: '15' },
		follow: { type: 'string', default: '20' },
		'no-badges': { type: 'boolean', default: false },
		url: { type: 'string' },
	},
})
const scenario = values.scenario
const userCount = Number(values.users)
const rates = values.rates.split(',').map(Number)
const seconds = Number(values.seconds)
const followed = Number(values.follow)

async function bounded<T>(
	items: readonly T[],
	limit: number,
	run: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
	let next = 0
	await Promise.all(
		Array.from({ length: limit }, async () => {
			while (next < items.length) {
				const index = next
				next += 1
				const item = items[index]
				if (item !== undefined) await run(item, index)
			}
		}),
	)
}
await benched(
	urlOf(values.url),
	(database) =>
		defineApp({
			database,
			models: [
				User,
				Chat,
				ChatMember,
				ChatMessage,
				FriendRequest,
				Campaign,
				CampaignMember,
				CampaignNpc,
			],
			functions: [badges],
			// The models use GraphQL for `platform-wire.ts`; nothing connects here.
			plugins: [httpPlugin({ port: 0 }), ...plugins, graphqlPlugin()],
			logger: silent,
		}),
	async (bench) => {
		const seedStart = performance.now()
		const world = await seed(scenario, userCount)
		const { users, chats, campaigns } = world
		const userAt = (index: number) => users[index % userCount] ?? ''
		await bench.analyzed()
		const seedSeconds = (performance.now() - seedStart) / 1000

		// What is told, and how long after the write was due.
		let counting = false
		let delays: number[] = []
		let delivered = 0
		const told = (message: LiveMessage, field: string) => {
			if (!counting || message.kind !== 'changes') return
			delivered += 1
			for (const change of message.changes) {
				if (!('upsert' in change)) continue
				const value = change.upsert[field]
				const due =
					value instanceof Date
						? value.getTime()
						: typeof value === 'string' && /^\d+$/u.test(value)
							? Number(value)
							: Number.NaN
				if (!Number.isNaN(due)) delays.push(Date.now() - due)
			}
		}
		const ignored = (message: LiveMessage) => {
			if (counting && message.kind !== 'reset') delivered += 1
		}

		const chatListArgs = (index: number) => ({
			where: { members: { some: { user: { is: { id: userAt(index) } } } } },
			orderBy: [{ lastMessageAt: 'desc' }],
			first: 25,
			select: {
				lastMessageAt: true,
				members: {
					take: 2,
					select: {
						unreadCount: true,
						user: { select: { name: true, isOnline: true } },
					},
				},
				messages: {
					take: 1,
					orderBy: [{ createdAt: 'desc' }],
					select: { text: true },
				},
			},
		})
		const handles: { close: () => void }[] = []
		const viewers: { close: () => void }[] = []
		const hold = async (index: number) => {
			const id = userAt(index)
			const viewer = await bench.api.connect(
				new Request('http://localhost/', { headers: { authorization: id } }),
			)
			viewers.push(viewer)
			if (!values['no-badges']) {
				handles.push(
					await viewer.value(
						'badges',
						async (caller) => badges.run({ as: caller }),
						ignored,
					),
				)
			}
			handles.push(
				await viewer.list(
					'Campaign',
					{
						where: playedBy({ kind: 'user', user: { id } }),
						orderBy: [{ updatedAt: 'desc' }],
						first: 5,
						select: { name: true, updatedAt: true },
					},
					ignored,
				),
				await viewer.list(
					'User',
					{
						where: {
							id: {
								in: Array.from({ length: followed }, (_, k) =>
									userAt(index + k + 1),
								),
							},
						},
						first: 1000,
						select: { name: true, isOnline: true, lastSeenAt: true },
					},
					scenario === 'presence'
						? (message) => {
								told(message, 'lastSeenAt')
							}
						: ignored,
				),
			)
			if (scenario === 'campaign') {
				const campaign = campaigns[Math.floor(index / 5)] ?? ''
				handles.push(
					await viewer.row(
						'Campaign',
						{
							where: { id: campaign },
							select: {
								name: true,
								members: {
									take: 100,
									select: {
										status: true,
										user: { select: { name: true, isOnline: true } },
									},
								},
							},
						},
						ignored,
					),
					await viewer.list(
						'CampaignNpc',
						{
							where: { campaign: { is: { id: campaign } } },
							orderBy: [{ updatedAt: 'desc' }],
							first: 25,
							select: { name: true, visible: true, updatedAt: true },
						},
						(message) => {
							told(message, 'name')
						},
					),
				)
				return
			}
			handles.push(await viewer.list('Chat', chatListArgs(index), ignored))
			if (scenario === 'chat') {
				handles.push(
					await viewer.list(
						'ChatMessage',
						{
							where: {
								chat: { is: { id: chats[Math.floor(index / 2)] ?? '' } },
							},
							orderBy: [{ createdAt: 'desc' }],
							first: 25,
							select: { text: true, user: { select: { name: true } } },
						},
						(message) => {
							told(message, 'text')
						},
					),
				)
			}
		}
		const openStart = performance.now()
		await bounded(users, 32, async (_, index) => hold(index))
		const openSeconds = (performance.now() - openStart) / 1000
		await bench.quiet()
		const idleRuns = badgeRuns.count
		globalThis.gc?.()
		const heap = process.memoryUsage().heapUsed / 2 ** 30
		console.log(
			`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${scenario}, ${userCount} users, ${handles.length} live reads${values['no-badges'] ? ', no badges' : ''}.`,
		)
		console.log(
			`Seed ${seedSeconds.toFixed(0)} s; all connected in ${openSeconds.toFixed(1)} s (${((openSeconds * 1000) / userCount).toFixed(2)} ms a user, 32 at a time); heap ${heap.toFixed(2)} GiB; badges run ${idleRuns}.\n`,
		)

		const write = writerOf(scenario, world)

		// Who hears of one write, and the viewer the walk reaches last.
		const hearing =
			scenario === 'chat' ? 2 : scenario === 'campaign' ? 5 : followed
		const lastIndex =
			scenario === 'chat'
				? chats.length - 1
				: scenario === 'campaign'
					? campaigns.length - 1
					: userCount - 1
		await climbing({
			bench,
			rates,
			seconds,
			users: userCount,
			hearing,
			last: lastIndex,
			write,
			runs: () => badgeRuns.count,
			told: {
				begin: () => {
					delays = []
					delivered = 0
					counting = true
				},
				count: () => delays.length,
				end: () => {
					counting = false
					return delays
				},
			},
		})
		const closeStart = performance.now()
		for (const handle of handles) handle.close()
		for (const viewer of viewers) viewer.close()
		console.log(
			`\nAll closed in ${((performance.now() - closeStart) / 1000).toFixed(2)} s.`,
		)
		await waited(500)
	},
)
