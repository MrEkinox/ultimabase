// What a write costs live lists whose rule goes through a relation: a user
// reads the documents of the teams they belong to, latest first, and one write
// lifts a batch of documents across those teams to the top of the lists. It
// times from the write's return to the last message and to the last statement.
// `node --expose-gc bench/realtime/teams.ts [--subscribers 1000] [--batches 1,100,1000]`
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import type { LiveMessage, Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { Caller, PluginTypes } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'
import { silent } from '../../packages/testing/src/silent.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		memberships: f.many(() => Member, { inverse: 'user' }),
	}),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'team' }),
		docs: f.many(() => Doc, { inverse: 'team' }),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.one(() => User), team: f.one(() => Team) }),
	indexes: [{ fields: ['user', 'team'] }, { fields: ['team'] }],
})
const Doc = defineModel({
	name: 'Doc',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		batch: f.number({ integer: true }),
		slot: f.number({ integer: true }),
		revision: f.number({ integer: true }),
		team: f.one(() => Team),
	}),
	indexes: [
		{ fields: ['team', 'title'] },
		{ fields: ['batch', 'slot'] },
		{ fields: ['revision'] },
	],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({
				team: {
					is: { members: { some: { user: { is: { id: idOf(caller) } } } } },
				},
			}),
	},
})

let api: RealtimeApi | undefined
interface Bench extends PluginTypes {
	readonly name: 'bench'
	readonly requires: Realtime
}
const benchPlugin = definePlugin<Bench>({
	name: 'bench',
	manifest: {
		name: 'bench',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

const median = (values: readonly number[]): number =>
	values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const waited = async (delay: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, delay)
	})
const chunks = <T>(rows: readonly T[], size = 5000): T[][] =>
	Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
		rows.slice(i * size, (i + 1) * size),
	)

async function query(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

const { values } = parseArgs({
	options: {
		subscribers: { type: 'string', default: '1000' },
		teams: { type: 'string', default: '50' },
		joined: { type: 'string', default: '3' },
		documents: { type: 'string', default: '50000' },
		window: { type: 'string', default: '25' },
		batches: { type: 'string', default: '1,100,1000' },
		writes: { type: 'string', default: '5' },
		url: { type: 'string' },
	},
})
const url =
	values.url ??
	process.env['BENCH_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54318/postgres'
const subscribers = Number(values.subscribers)
const teamCount = Number(values.teams)
const joined = Number(values.joined)
const documents = Number(values.documents)
const window = Number(values.window)
const writes = Number(values.writes)
const batchSizes = values.batches.split(',').map(Number)
const biggest = Math.max(...batchSizes)

const schema = `bench_${randomUUID().replaceAll('-', '')}`
await query(url, `create schema "${schema}"`)
let statements = 0
let lastStatement = 0
const separator = url.includes('?') ? '&' : '?'
const options = encodeURIComponent(`-c search_path=${schema}`)
const app = defineApp({
	database: createAdapter({
		url: `${url}${separator}options=${options}`,
		log: () => {
			statements += 1
			lastStatement = performance.now()
		},
	}),
	models: [User, Team, Member, Doc],
	plugins: [realtimePlugin(), benchPlugin.plugin()],
	logger: silent,
})
await app.start()
try {
	const teams = await Team.createManyAndReturn(
		{
			data: Array.from({ length: teamCount }, (_, i) => ({ name: `t${i}` })),
		},
		M,
	)
	const made = await Promise.all(
		chunks(Array.from({ length: subscribers }, (_, i) => `u${i}`)).map(
			async (names) =>
				User.createManyAndReturn({ data: names.map((name) => ({ name })) }, M),
		),
	)
	const users = made.flat().map(({ id }) => id)
	const members = users.flatMap((id, i) =>
		Array.from({ length: joined }, (_, step) => ({
			user: { connect: { id } },
			team: { connect: { id: teams[(i + step) % teamCount]?.id ?? '' } },
		})),
	)
	for (const data of chunks(members)) await Member.createMany({ data }, M)
	const groups = Math.ceil(documents / biggest)
	const rows = Array.from({ length: documents }, (_, n) => ({
		title: `d${String(n).padStart(6, '0')}`,
		batch: Math.floor(n / teamCount) % groups,
		slot: Math.floor(n / (teamCount * groups)),
		revision: 0,
		team: { connect: { id: teams[n % teamCount]?.id ?? '' } },
	}))
	for (const data of chunks(rows)) await Doc.createMany({ data }, M)
	await query(url, `analyze "${schema}"."doc"`)
	const realtimeApi = api
	if (realtimeApi === undefined) throw new Error('No realtime API.')
	let t0 = 0
	let lastMessage = 0
	let messages = 0
	const viewers = await Promise.all(
		users.map(async (id) =>
			realtimeApi.connect(
				new Request('http://localhost/', { headers: { authorization: id } }),
			),
		),
	)
	const opened = performance.now()
	let next = 0
	await Promise.all(
		Array.from({ length: 16 }, async () => {
			while (next < viewers.length) {
				const viewer = viewers[next]
				next += 1
				await viewer?.list(
					'Doc',
					{
						orderBy: [{ revision: 'desc' }, { title: 'asc' }],
						first: window,
						select: { title: true, revision: true },
					},
					(message: LiveMessage) => {
						if (t0 === 0 || message.kind === 'closed') return
						messages += 1
						lastMessage = performance.now()
					},
				)
			}
		}),
	)
	console.log(
		`${subscribers} subscribers, ${teamCount} teams, ${joined} teams each, ${documents} documents, window ${window}; subscribed in ${(performance.now() - opened).toFixed(0)} ms\n`,
	)
	console.log(
		'| Rows written | Statements | Messages | Last message p50 | Last statement p50 |\n| --: | --: | --: | --: | --: |',
	)
	const quiet = async () => {
		let seen = statements
		do {
			seen = statements
			await waited(150)
		} while (statements !== seen)
	}
	let revision = 0
	for (const size of batchSizes) {
		const told: number[] = []
		const done: number[] = []
		const counts: number[] = []
		const heard: number[] = []
		for (let index = -1; index < writes; index += 1) {
			revision += 1
			const batch = (index + 1) % groups
			// The latest documents first: a batch climbs to the top of the lists.
			const where =
				size < teamCount
					? { title: `d${String(batch).padStart(6, '0')}` }
					: { batch, slot: { lt: size / teamCount } }
			const before = statements
			messages = 0
			lastMessage = 0
			t0 = performance.now()
			await Doc.updateMany({ where, data: { revision } }, M)
			const back = performance.now()
			await quiet()
			if (index < 0) continue
			told.push(Math.max(0, lastMessage - back))
			done.push(Math.max(0, lastStatement - back))
			counts.push(statements - before)
			heard.push(messages)
		}
		t0 = 0
		console.log(
			`| ${size} | ${median(counts)} | ${median(heard)} | ${median(told).toFixed(1)} | ${median(done).toFixed(1)} |`,
		)
	}
} finally {
	await app.stop()
	await query(url, `drop schema "${schema}" cascade`)
}
