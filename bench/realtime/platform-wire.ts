// What `platform.ts` measures, with the wire: every user connected over GraphQL
// over WebSocket with what each screen holds, from threads of their own, and
// told when the message reaches the socket's far end.
// `node --max-old-space-size=24576 bench/realtime/platform-wire.ts --scenario chat`
import { parseArgs } from 'node:util'
import { Worker } from 'node:worker_threads'
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { Logger } from 'ultimabase'
import { defineApp } from 'ultimabase'
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
	User,
} from './platform-models.ts'
import type { Client, Command, Reply } from './platform-wire-clients.ts'
import { seed, writerOf } from './platform-writes.ts'
import { benched, plugins, urlOf, waited } from './shared.ts'

const { values } = parseArgs({
	options: {
		scenario: { type: 'string', default: 'chat' },
		users: { type: 'string', default: '10000' },
		rates: { type: 'string', default: '50,100,200,400,600,1000,2000' },
		seconds: { type: 'string', default: '10' },
		follow: { type: 'string', default: '20' },
		threads: { type: 'string', default: '4' },
		url: { type: 'string' },
	},
})
const scenario = values.scenario
const userCount = Number(values.users)
const followed = Number(values.follow)

let origin = ''
const logger: Logger = {
	info: (first: string | object) => {
		if (typeof first === 'string' && first.startsWith('Listening on')) {
			origin = first.replace(/^Listening on (.*)\.$/, '$1')
		}
	},
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		console.error(message ?? first, typeof first === 'object' ? first : '')
	},
	child: () => logger,
}

const workers = Array.from(
	{ length: Number(values.threads) },
	() => new Worker(new URL('platform-wire-clients.ts', import.meta.url)),
)
const counts = workers.map(() => 0)
const waiting = new Map<Worker, (reply: Reply) => void>()
for (const [index, worker] of workers.entries()) {
	worker.on('message', (reply: Reply) => {
		if (reply.kind === 'failed') throw new Error(reply.message)
		if (reply.kind === 'count') counts[index] = reply.count
		else waiting.get(worker)?.(reply)
	})
}
/** Each thread's reply to `command`. */
const all = async (command: (index: number) => Command) =>
	Promise.all(
		workers.map(
			async (worker, index) =>
				new Promise<Reply>((resolve) => {
					waiting.set(worker, resolve)
					// oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker's, not a window's.
					worker.postMessage(command(index))
				}),
		),
	)

const mine = (id: string) => ({ is: { id: { equals: id } } })
const playedBy = (id: string) => ({
	OR: [
		{ gameMaster: mine(id) },
		{ members: { some: { user: mine(id), status: { equals: 'member' } } } },
	],
})

try {
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
				plugins: [httpPlugin({ port: 0 }), ...plugins, graphqlPlugin()],
				logger,
			}),
		async (bench) => {
			const world = await seed(scenario, userCount)
			const { users, chats, campaigns } = world
			const userAt = (index: number) => users[index % userCount] ?? ''
			await bench.analyzed()

			const clientOf = (index: number): Client => {
				const id = userAt(index)
				const timed = (name: string) => (name === scenario ? 't' : name)
				const subscriptions: Client['subscriptions'][number][] = [
					{
						id: 'badges',
						query: 'subscription { badges { unread friends } }',
						variables: {},
					},
					{
						id: 'campaigns',
						query: `subscription ($where: CampaignWhereInput) {
							campaigns(where: $where, orderBy: [{ updatedAt: desc }], first: 5) {
								edges { node { name updatedAt } }
							}
						}`,
						variables: { where: playedBy(id) },
					},
					{
						id: timed('presence'),
						query: `subscription ($where: UserWhereInput) {
							users(where: $where, first: ${followed}) {
								edges { node { name isOnline lastSeenAt } }
							}
						}`,
						variables: {
							where: {
								id: {
									in: Array.from({ length: followed }, (_, k) =>
										userAt(index + k + 1),
									),
								},
							},
						},
					},
				]
				if (scenario === 'campaign') {
					const campaign = campaigns[Math.floor(index / 5)] ?? ''
					subscriptions.push(
						{
							id: 'campaign',
							query: `subscription ($id: ID!) {
								campaign(where: { id: $id }) {
									name
									members(first: 100) {
										edges { node { status user { name isOnline } } }
									}
								}
							}`,
							variables: { id: campaign },
						},
						{
							id: 't',
							query: `subscription ($where: CampaignNpcWhereInput) {
								campaignNpcs(where: $where, orderBy: [{ updatedAt: desc }], first: 25) {
									edges { node { name visible updatedAt } }
								}
							}`,
							variables: { where: { campaign: mine(campaign) } },
						},
					)
					return { authorization: id, subscriptions }
				}
				subscriptions.push({
					id: 'chats',
					query: `subscription ($where: ChatWhereInput) {
						chats(where: $where, orderBy: [{ lastMessageAt: desc }], first: 25) {
							edges { node {
								lastMessageAt
								members(first: 2) {
									edges { node { unreadCount user { name isOnline } } }
								}
								messages(first: 1, orderBy: [{ createdAt: desc }]) {
									edges { node { text } }
								}
							} }
						}
					}`,
					variables: { where: { members: { some: { user: mine(id) } } } },
				})
				if (scenario === 'chat') {
					subscriptions.push({
						id: 't',
						query: `subscription ($where: ChatMessageWhereInput) {
							chatMessages(where: $where, orderBy: [{ createdAt: desc }], first: 25) {
								edges { node { text user { name } } }
							}
						}`,
						variables: {
							where: { chat: mine(chats[Math.floor(index / 2)] ?? '') },
						},
					})
				}
				return { authorization: id, subscriptions }
			}

			const field =
				scenario === 'chat'
					? 'text'
					: scenario === 'campaign'
						? 'name'
						: 'lastSeenAt'
			const threads = workers.length
			const started = performance.now()
			await all((thread) => ({
				kind: 'open',
				url: `${origin.replace(/^http/, 'ws')}/graphql`,
				field,
				clients: users.flatMap((_, index) =>
					index % threads === thread ? [clientOf(index)] : [],
				),
			}))
			const opened = (performance.now() - started) / 1000
			await bench.quiet()
			globalThis.gc?.()
			const { heapUsed, rss } = process.memoryUsage()
			const heap = heapUsed / 2 ** 30
			console.log(
				`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${scenario} over the wire, ${userCount} users.`,
			)
			console.log(
				`All connected in ${opened.toFixed(1)} s (${((opened * 1000) / userCount).toFixed(2)} ms a user); heap ${heap.toFixed(2)} GiB, process ${(rss / 2 ** 30).toFixed(2)} GiB, client threads included.\n`,
			)

			await climbing({
				bench,
				rates: values.rates.split(',').map(Number),
				seconds: Number(values.seconds),
				users: userCount,
				hearing:
					scenario === 'chat' ? 2 : scenario === 'campaign' ? 5 : followed,
				last:
					scenario === 'chat'
						? chats.length - 1
						: scenario === 'campaign'
							? campaigns.length - 1
							: userCount - 1,
				write: writerOf(scenario, world),
				runs: () => badgeRuns.count,
				told: {
					begin: async () => {
						counts.fill(0)
						await all(() => ({ kind: 'begin' }))
					},
					count: () => counts.reduce((sum, count) => sum + count, 0),
					end: async () => {
						const replies = await all(() => ({ kind: 'end' }))
						return replies.flatMap((reply) =>
							reply.kind === 'ended' ? reply.delays : [],
						)
					},
				},
			})
			await all(() => ({ kind: 'close' }))
			await waited(500)
		},
	)
} finally {
	await Promise.all(workers.map(async (worker) => worker.terminate()))
}
