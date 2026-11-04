// What losing a right costs live lists, no followed row written: a member
// row deleted, through which a subscriber read its team's documents, or a
// role left or renamed, which let subscribers read every sheet. For each
// case it counts the statements, the time from the write's return to the
// first and last message the losers get, and to the engine's last
// statement. `node --expose-gc bench/realtime/rights.ts`.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import type { LiveMessage, Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import { defineRole, hasRole, rolesPlugin } from '@ultimabase/roles'
import type { Caller, PluginTypes } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'
import { silent } from '../../packages/testing/src/silent.ts'

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

const Role = defineRole({ name: 'Role', members: () => User, inverse: 'roles' })
const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		roles: f.many(() => Role, { inverse: 'members' }),
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
	indexes: [{ fields: ['user', 'team'] }],
})
/** A user reads the documents of the teams they are a member of. */
const Doc = defineModel({
	name: 'Doc',
	use: [realtime()],
	fields: (f) => ({ title: f.string(), team: f.one(() => Team) }),
	indexes: [{ fields: ['team', 'title'] }],
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
/** A reader reads every sheet, another user their own. */
const Sheet = defineModel({
	name: 'Sheet',
	use: [realtime()],
	fields: (f) => ({ title: f.string(), owner: f.string() }),
	indexes: [{ fields: ['owner', 'title'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			hasRole(caller, 'Reader') ||
			where({ owner: idOf(caller) }),
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

const at = (values: readonly number[], share: number): number => {
	const sorted = values.toSorted((a, b) => a - b)
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
	)
}
const ms = (value: number): string => value.toFixed(1)
const waited = async (delay: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, delay)
	})

async function query(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

async function bounded(
	count: number,
	limit: number,
	task: (index: number) => Promise<void>,
): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (next < count) {
			const index = next
			next += 1
			await task(index)
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
}

const chunks = <T>(rows: readonly T[], size = 5000): T[][] =>
	Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
		rows.slice(i * size, (i + 1) * size),
	)
const titles = (window: number) =>
	Array.from({ length: window }, (_, n) => `d${String(n).padStart(5, '0')}`)

type Case =
	| 'link, one team'
	| 'link, a team each'
	| 'role, one user leaves'
	| 'role, renamed for all'

/** A timed loss: the write, and the subscribers who lose rows by it. */
type Loss = {
	readonly lose: () => Promise<void>
	readonly losers: ReadonlySet<number>
	readonly after?: () => Promise<void>
}

/** Seeds `kind`'s rows; the losses it times, one a call. */
async function seed(
	kind: Case,
	users: readonly string[],
	window: number,
): Promise<(index: number) => Loss> {
	if (kind.startsWith('link')) {
		const each = kind === 'link, a team each'
		const teams = await Team.createManyAndReturn(
			{ data: (each ? users : ['all']).map((name) => ({ name })) },
			M,
		)
		const teamOf = (i: number) => teams[each ? i : 0]?.id ?? ''
		const members = users.map((user, i) => ({
			user: { connect: { id: user } },
			team: { connect: { id: teamOf(i) } },
		}))
		for (const data of chunks(members)) await Member.createMany({ data }, M)
		await bounded(teams.length, 8, async (i) => {
			const team = { connect: { id: teams[i]?.id ?? '' } }
			const data = titles(window).map((title) => ({ title, team }))
			for (const part of chunks(data)) await Doc.createMany({ data: part }, M)
		})
		return (index) => ({
			lose: async () => {
				const where = {
					user: { is: { id: users[index] ?? '' } },
					team: { is: { id: teamOf(index) } },
				}
				await Member.deleteMany({ where }, M)
			},
			losers: new Set([index]),
		})
	}
	const reader = await Role.create({ data: { name: 'Reader' } }, M)
	const all = users.map((id) => ({ id }))
	for (const connect of chunks(all, 1000)) {
		await Role.update(
			{ where: { id: reader.id }, data: { members: { connect } } },
			M,
		)
	}
	const data = titles(window).map((title) => ({ title, owner: 'nobody' }))
	for (const part of chunks(data)) await Sheet.createMany({ data: part }, M)
	const rename = (name: string) => async () => {
		await Role.update({ where: { id: reader.id }, data: { name } }, M)
	}
	if (kind === 'role, renamed for all') {
		const everyone = new Set(users.map((_, i) => i))
		return () => ({
			lose: rename('Former'),
			losers: everyone,
			after: rename('Reader'),
		})
	}
	return (index) => ({
		lose: async () => {
			const disconnect = [{ id: reader.id }]
			const where = { id: users[index] ?? '' }
			await User.update({ where, data: { roles: { disconnect } } }, M)
		},
		losers: new Set([index]),
	})
}

async function run(
	url: string,
	kind: Case,
	subscribers: number,
	window: number,
	writes: number,
): Promise<string> {
	const schema = `bench_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	let statements = 0
	let lastStatement = 0
	const separator = url.includes('?') ? '&' : '?'
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const database = createAdapter({
		url: `${url}${separator}options=${options}`,
		log: () => {
			statements += 1
			lastStatement = performance.now()
		},
	})
	const app = defineApp({
		database,
		models: [Role, User, Team, Member, Doc, Sheet],
		plugins: [rolesPlugin(), realtimePlugin(), benchPlugin.plugin()],
		logger: silent,
	})
	await app.start()
	try {
		const made = await Promise.all(
			chunks(Array.from({ length: subscribers }, (_, i) => `u${i}`)).map(
				async (names) =>
					User.createManyAndReturn(
						{ data: names.map((name) => ({ name })) },
						M,
					),
			),
		)
		const users = made.flat().map(({ id }) => id)
		const losses = await seed(kind, users, window)
		await waited(200)
		const realtimeApi = api
		if (realtimeApi === undefined) throw new Error('No realtime API.')
		let t0 = 0
		const heard: { readonly viewer: number; readonly time: number }[] = []
		const viewers = await Promise.all(
			users.map(async (id) =>
				realtimeApi.connect(
					new Request('http://localhost/', { headers: { authorization: id } }),
				),
			),
		)
		const model = kind.startsWith('link') ? 'Doc' : 'Sheet'
		const args = {
			orderBy: [{ title: 'asc' }],
			first: window,
			select: { title: true },
		}
		const opened = performance.now()
		await bounded(viewers.length, 16, async (i) => {
			await viewers[i]?.list(model, args, (message: LiveMessage) => {
				if (t0 === 0 || message.kind === 'closed') return
				heard.push({ viewer: i, time: performance.now() - t0 })
			})
		})
		const subscribed = performance.now() - opened
		const counts: number[] = []
		const firsts: number[] = []
		const lasts: number[] = []
		const settled: number[] = []
		const others: number[] = []
		const quiet = async () => {
			let seen = statements
			do {
				seen = statements
				await waited(150)
			} while (statements !== seen)
		}
		for (let index = -1; index < writes; index += 1) {
			const loss = losses(((index + 1) * 7) % subscribers)
			heard.length = 0
			const before = statements
			const deadline = performance.now() + 120_000
			await loss.lose()
			t0 = performance.now()
			const reached = () =>
				new Set(
					heard
						.filter(({ viewer }) => loss.losers.has(viewer))
						.map(({ viewer }) => viewer),
				)
			while (
				reached().size < loss.losers.size &&
				performance.now() < deadline
			) {
				await waited(1)
			}
			await quiet()
			const ofLosers = heard.filter(({ viewer }) => loss.losers.has(viewer))
			const times = ofLosers.map(({ time }) => time)
			const done = Math.max(0, lastStatement - t0)
			t0 = 0
			if (loss.after) {
				await loss.after()
				await quiet()
			}
			if (index < 0) continue
			counts.push(statements - before)
			firsts.push(Math.min(...times))
			lasts.push(Math.max(...times))
			settled.push(done)
			others.push(heard.length - ofLosers.length)
		}
		return `| ${subscribers} | ${kind} | ${window} | ${Math.min(...counts)}–${Math.max(...counts)} | ${ms(at(firsts, 0.5))} | ${ms(at(lasts, 0.5))} | ${ms(at(settled, 0.5))} | ${Math.max(...others)} | ${ms(subscribed)} |`
	} finally {
		await app.stop()
		await query(url, `drop schema "${schema}" cascade`)
	}
}

const { values } = parseArgs({
	options: {
		subscribers: { type: 'string', default: '1000' },
		windows: { type: 'string', default: '25,1000' },
		writes: { type: 'string', default: '5' },
		cases: { type: 'string' },
		url: { type: 'string' },
	},
})
const url =
	values.url ??
	process.env['BENCH_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54318/postgres'
const numbers = (text: string) => text.split(',').map(Number)
const cases: readonly Case[] = [
	'link, one team',
	'link, a team each',
	'role, one user leaves',
	'role, renamed for all',
]
const chosen = values.cases?.split(',').map(Number) ?? [0, 1, 2, 3]
console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${values.writes} losses a case; times in ms.\n`,
)
console.log(
	'| Subscribers | Case | Window | Statements | First loser message p50 | Last loser message p50 | Last statement p50 | Others’ messages | Subscribe all |\n| --: | --- | --: | --: | --: | --: | --: | --: | --: |',
)
for (const subscribers of numbers(values.subscribers)) {
	for (const kind of chosen
		.map((i) => cases[i])
		.filter((c) => c !== undefined)) {
		for (const window of numbers(values.windows)) {
			console.log(
				await run(url, kind, subscribers, window, Number(values.writes)),
			)
		}
	}
}
