// The rights a plugin takes away (D-154): an ACL changed, a role left and a
// row soft deleted each remove the row from the live lists of the callers
// who no longer read it.
import { ACL, acl, aclPlugin } from '@ultimabase/acl'
import { defineRole, rolesPlugin } from '@ultimabase/roles'
import { softDelete, softDeletePlugin } from '@ultimabase/soft-delete'
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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

const Role = defineRole({ name: 'Role', members: () => User })
const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), roles: f.many(() => Role) }),
})
const Note = defineModel({
	name: 'Note',
	use: [acl({ default: () => new ACL() }), realtime()],
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })
const Post = defineModel({
	name: 'Post',
	use: [softDelete(), realtime()],
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** Keeps the realtime API; a request's `authorization` is its user's id. */
const following = definePlugin<Following>({
	name: 'following',
	manifest: {
		name: 'following',
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

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Role, User, Note, Post],
		plugins: [
			rolesPlugin(),
			aclPlugin(),
			softDeletePlugin(),
			realtimePlugin(),
			following.plugin(),
		],
	})
	await app.start()
})
afterEach(async () => app.stop())

/** The messages of `model`'s live list, as `user`, its first one in. */
async function list(model: string, user: { id: string }) {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(
		new Request('http://localhost/', { headers: { authorization: user.id } }),
	)
	const seen: LiveMessage[] = []
	await viewer.list(model, { select: { title: true }, first: 5 }, (message) => {
		seen.push(message)
	})
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

/** The message after the first, once it came. */
async function next(seen: readonly LiveMessage[]): Promise<LiveMessage> {
	await vi.waitFor(() => expect(seen).toHaveLength(2))
	return seen[1] ?? { kind: 'closed' }
}

it('removes a row whose ACL no longer lets its caller read it, gone', async () => {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	const note = await Note.create(
		{ data: { title: 'Q3', acl: new ACL().allowUser(ada) } },
		M,
	)
	const seen = await list('Note', ada)
	expect(seen[0]).toMatchObject({ kind: 'reset', rows: [{ title: 'Q3' }] })
	await Note.update({ where: { id: note.id }, data: { acl: new ACL() } }, M)
	expect(await next(seen)).toMatchObject({
		kind: 'changes',
		changes: [{ remove: note.id, gone: true }],
	})
})

it('sends the rows again without those of a role its caller left', async () => {
	const editor = await Role.create({ data: { name: 'Editor' } }, M)
	const ada = await User.create(
		{
			data: {
				email: 'ada@example.com',
				roles: { connect: [{ id: editor.id }] },
			},
		},
		M,
	)
	await Note.create(
		{ data: { title: 'shared', acl: new ACL().allowRole(editor) } },
		M,
	)
	await Note.create(
		{ data: { title: 'own', acl: new ACL().allowUser(ada) } },
		M,
	)
	const seen = await list('Note', ada)
	expect(seen[0]).toMatchObject({ kind: 'reset', rows: [{}, {}] })
	await User.update(
		{
			where: { id: ada.id },
			data: { roles: { disconnect: [{ id: editor.id }] } },
		},
		M,
	)
	expect(await next(seen)).toMatchObject({
		kind: 'reset',
		rows: [{ title: 'own' }],
	})
})

it('removes a soft-deleted row, gone, and shows it once restored', async () => {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	const post = await Post.create({ data: { title: 'draft' } }, M)
	const seen = await list('Post', ada)
	await Post.delete({ where: { id: post.id } }, M)
	expect(await next(seen)).toMatchObject({
		kind: 'changes',
		changes: [{ remove: post.id, gone: true }],
	})
	await Post.restore({ where: { id: post.id } }, M)
	await vi.waitFor(() => expect(seen).toHaveLength(3))
	expect(seen[2]).toMatchObject({
		kind: 'changes',
		changes: [{ upsert: { id: post.id, title: 'draft' } }],
	})
})
