import { accessPlugin } from '@ultimabase/access-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auth } from '../../examples/schema-form-d/src/app.ts'
import { Tag } from '../../examples/schema-form-d/src/tag.ts'
import { Todo } from '../../examples/schema-form-d/src/todo.ts'
import { TodoRole } from '../../examples/schema-form-d/src/todo-role.ts'
import { TodoUser } from '../../examples/schema-form-d/src/todo-user.ts'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// Vertical slice of ADR-0297: schemas declared with `define(...).with(...)`
// (thunk targets, `.softDelete()`, `.acl()`) register, synchronize, and run
// their Access filters, hooks, soft delete and ACL on PostgreSQL.
const master = { useMasterKey: true } as const

const createApplication = (connectionUri: string) =>
	new (UltimaBase.use(
		accessPlugin({ allowWithoutRule: { all: true } }),
		hooksPlugin(),
		softDeletePlugin(),
		aclPlugin(),
		rolesPlugin(),
		// The User schema belongs to the auth plugin instance that declared it.
		auth,
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'schema-form-d-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [TodoUser, TodoRole, Todo, Tag],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const ids = new Map<string, string>()

const idOf = (name: string): string => {
	const id = ids.get(name)
	if (id === undefined) throw new TypeError(`Missing seeded row ${name}`)
	return id
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'schema_form_d' })
	ultimabase = createApplication(fixture.connectionUri)
	await ultimabase.start()

	// Only the authentication flows set a User's email (ADR-0326, 6.4b
	// amendment): seeding goes through the plugin's administration export.
	for (const email of ['ada@admin.test', 'bob@team.test', 'carol@other.test']) {
		ids.set(
			email,
			await ultimabase.plugin(authPlugin).createUser({ data: {}, email }),
		)
	}
	const tags = await Tag.createMany(
		{ data: [{ label: 'team' }, { label: 'admin' }] },
		master,
	)
	for (const tag of tags) ids.set(tag.label, tag.id)

	const seed = async (
		title: string,
		assignee: string,
		tag: string | undefined,
		archived = false,
	): Promise<void> => {
		const todo = await Todo.createOne(
			{
				data: {
					archived,
					assignee: { connect: idOf(assignee) },
					title,
					...(tag === undefined ? {} : { tags: { connect: [idOf(tag)] } }),
				},
			},
			master,
		)
		ids.set(title, todo.id)
	}
	await seed('admin open', 'ada@admin.test', 'admin')
	await seed('team open', 'bob@team.test', 'team')
	await seed('team archived', 'bob@team.test', undefined, true)
	await seed('other archived', 'carol@other.test', undefined, true)
}, 60_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('schema form D on PostgreSQL', { concurrent: false }, () => {
	it('applies the local Access read filter', async () => {
		const todos = await Todo.findMany({ select: { title: true } })

		expect(todos.map(({ title }) => title).sort()).toStrictEqual([
			'admin open',
			'team open',
		])
	})

	it('applies cross-schema filters in both directions and over two hops', async () => {
		// TodoUser -> Todo: only users with a non-archived todo.
		const users = await TodoUser.findMany({ select: { email: true } })
		expect(users.map(({ email }) => email).sort()).toStrictEqual([
			'ada@admin.test',
			'bob@team.test',
		])
		// Tag -> Todo -> TodoUser: only tags of todos assigned to the team.
		const tags = await Tag.findMany({ select: { label: true } })
		expect(tags.map(({ label }) => label)).toStrictEqual(['team'])
		// Todo -> TodoUser: only todos assigned to an admin are updatable.
		await expect(
			Todo.updateOne({
				data: { title: 'team renamed' },
				where: { id: { eq: idOf('team open') } },
			}),
		).resolves.toBeNull()
		await expect(
			Todo.updateOne({
				data: { title: 'admin renamed' },
				where: { id: { eq: idOf('admin open') } },
				select: { title: true },
			}),
		).resolves.toMatchObject({ title: 'admin renamed' })
	})

	it('runs hooks that read schema fields', async () => {
		await expect(
			Todo.updateOne({
				data: { title: '   ' },
				where: { id: { eq: idOf('admin open') } },
			}),
		).rejects.toThrow('Todo title is empty')
	})

	it('filters with the ACL plugin contains operator', async () => {
		const shared = await Todo.findMany(
			{
				select: { title: true },
				where: { acl: { contains: { public: ['read'] } } },
			},
			master,
		)
		expect(shared.map(({ title }) => title).sort()).toStrictEqual([
			'admin renamed',
			'other archived',
			'team archived',
			'team open',
		])
	})

	it('replaces deletes with the soft-delete tombstone', async () => {
		await expect(
			Todo.deleteOne({ where: { id: { eq: idOf('team open') } } }),
		).resolves.toMatchObject({ id: idOf('team open') })

		const remaining = await Todo.findMany({ select: { title: true } })
		expect(remaining.map(({ title }) => title)).toStrictEqual(['admin renamed'])
		const rows = await fixture?.pool.query<Record<string, unknown>>(
			'select * from form_d_todos where id = $1',
			[idOf('team open')],
		)
		const row = rows?.rows[0] ?? {}
		const tombstone = Object.entries(row).find(([column]) =>
			column.toLowerCase().replaceAll('_', '').includes('isdeleted'),
		)
		expect(tombstone?.[1]).toBe(true)
	})

	it('creates ensure roles and filters users through their roles (ADR-0322)', async () => {
		const roles = await TodoRole.findMany({ select: { name: true } }, master)
		expect(roles.map(({ name }) => name)).toStrictEqual(['admin'])
		const [admin] = roles
		if (admin === undefined) throw new TypeError('Missing ensured role')
		await TodoRole.updateOne(
			{
				where: { id: admin.id },
				data: { members: { connect: [idOf('ada@admin.test')] } },
			},
			master,
		)
		const admins = await TodoUser.findMany(
			{
				where: { roles: { some: { name: { eq: 'admin' } } } },
				select: { email: true },
			},
			master,
		)
		expect(admins.map(({ email }) => email)).toStrictEqual(['ada@admin.test'])
	})
})
