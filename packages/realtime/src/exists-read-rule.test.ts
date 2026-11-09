// A live read follows an `exists` with `readRule: false` (D-359): a write to
// a row the caller cannot read sends the boolean again, and only it.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }

const users = definePlugin({ name: 'users', userModel: true })

// Variables, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const me = { viewer: true, isNot: undefined }
const mine = { fromUser: me }

const Account = defineModel({
	name: 'Account',
	use: [users.use(), realtime()],
	fields: (f) => ({
		name: f.string(),
		sentBlocks: f.many(() => Block, { inverse: 'fromUser' }),
		receivedBlocks: f.many(() => Block, { inverse: 'toUser' }),
		hasBlockedMe: f.exists(() => Block, {
			from: 'sentBlocks',
			readRule: false,
		}),
	}),
}).with({
	access: allow.public,
	relations: {
		hasBlockedMe: { where: ({ where }) => where({ toUser: me }) },
	},
})

const Block = defineModel({
	name: 'Block',
	use: [realtime()],
	fields: (f) => ({
		fromUser: f.one(() => Account),
		toUser: f.one(() => Account),
	}),
}).with({
	access: {
		read: ({ where }) => where(mine),
		create: allow.public,
		update: allow.public,
		delete: allow.public,
	},
})

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	// A request's `authorization` names its user.
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

let app: ReturnType<typeof defineApp> | undefined
let ada = ''
let eve = ''

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Account, Block],
		plugins: [users.plugin(), realtimePlugin(), watching.plugin()],
	})
	await app.start()
	ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
	eve = (await Account.create({ data: { name: 'Eve' } }, M)).id
})

afterEach(async () => {
	await app?.stop()
})

/** The messages of a live list of accounts, read with `args`, as `user`. */
async function followed(user: string, args: object): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const headers = { authorization: user }
	const viewer = await api.connect(
		new Request('http://localhost/', { headers }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(
		'Account',
		{ first: 10, orderBy: { name: 'asc' }, ...args },
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

describe('a live list of an exists past its read rule', () => {
	it('sends the boolean again when a row it cannot read changes', async () => {
		const shown = await followed(eve, {
			select: { name: true, hasBlockedMe: true },
		})
		const kept = await followed(eve, {
			where: { hasBlockedMe: false },
			select: { name: true },
		})
		expect(shown[0]).toMatchObject({
			rows: [
				{ name: 'Ada', hasBlockedMe: false },
				{ name: 'Eve', hasBlockedMe: false },
			],
		})
		expect(kept[0]).toMatchObject({ rows: [{ name: 'Ada' }, { name: 'Eve' }] })
		const data = {
			fromUser: { connect: { id: ada } },
			toUser: { connect: { id: eve } },
		}
		const block = await Block.create({ data }, M)
		await vi.waitFor(() => expect(shown).toHaveLength(2))
		const row: unknown = expect.objectContaining({
			name: 'Ada',
			hasBlockedMe: true,
		})
		const upsert: unknown = expect.objectContaining({ upsert: row })
		const changes: unknown = expect.arrayContaining([upsert])
		expect(shown[1]).toMatchObject({ changes })
		await vi.waitFor(() => expect(kept).toHaveLength(2))
		expect(kept[1]).toMatchObject({ changes: [{ remove: ada }] })
		// The block itself reaches no message.
		expect(JSON.stringify([shown, kept])).not.toContain(block.id)
		await Block.delete({ where: { id: block.id } }, M)
		await vi.waitFor(() => expect(kept).toHaveLength(3))
		// A delete reads the window again, as on any exists: Ada is back.
		expect(JSON.stringify(kept[2])).toContain('"name":"Ada"')
	})
})
