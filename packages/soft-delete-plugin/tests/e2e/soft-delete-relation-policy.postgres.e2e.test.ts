import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0344: a plugin command applies a policy that filters through a relation
// (here an Access rule on a pointer) like a native command, instead of
// reaching the database without the relation's target scope.
const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin({ allowWithoutRule: { all: true } }),
)

const Folder = App.Schema.define({
	className: 'SoftDeletePolicyFolder',
	fields: (field) => ({
		name: field.string({ required: true }),
		open: field.boolean({ default: true }),
	}),
})

const Note = App.Schema.define({
	className: 'SoftDeletePolicyNote',
	fields: (field) => ({
		folder: field.pointer({ target: () => Folder }),
		title: field.string({ required: true }),
	}),
	softDelete: { mode: 'command' },
}).with({
	access: {
		read: ({ where }) => where.is('folder', { open: { eq: true } }),
		softDeleteMany: ({ where }) => where.is('folder', { open: { eq: true } }),
		softDeleteOne: ({ where }) => where.is('folder', { open: { eq: true } }),
	},
})

const master = { useMasterKey: true } as const
let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	InstanceType<ReturnType<typeof createApplicationClass>> | undefined

const createApplicationClass = (pool: PostgresWorkerFixture['pool']) =>
	App.use(postgresPlugin({ pool, schemaPolicy: 'override' }))

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'soft_delete_policy' })
	ultimabase = new (createApplicationClass(fixture.pool))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'soft-delete-policy', value: 'soft-delete-policy-secret' }],
			onUse: () => undefined,
		}),
		schemas: [Folder, Note],
	})
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

const createNote = async (title: string, open: boolean) => {
	const folder = await Folder.createOne(
		{ data: { name: `${title}-folder`, open } },
		master,
	)
	return Note.createOne(
		{ data: { folder: { connect: folder.id }, title } },
		master,
	)
}

const isDeleted = async (id: string): Promise<boolean> => {
	const row = await Note.findOne(
		{ where: { id: { eq: id } }, select: { isDeleted: true } },
		master,
	)
	if (row === null) throw new TypeError(`Note ${id} is missing`)
	return row.isDeleted
}

describe('relation-filter policies on plugin commands (PostgreSQL)', () => {
	it('applies the policy to softDeleteOne', async () => {
		const open = await createNote('one-open', true)
		const closed = await createNote('one-closed', false)

		await expect(
			Note.softDeleteOne({ id: open.id, select: { title: true } }),
		).resolves.toStrictEqual({ id: open.id, title: 'one-open' })
		await expect(Note.softDeleteOne({ id: closed.id })).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
		await expect(isDeleted(open.id)).resolves.toBe(true)
		await expect(isDeleted(closed.id)).resolves.toBe(false)
	})

	it('applies the policy to every row of softDeleteMany', async () => {
		const open = await createNote('many-open', true)
		const closed = await createNote('many-closed', false)

		await expect(
			Note.softDeleteMany({
				where: { title: { startsWith: 'many-' } },
				select: { title: true },
			}),
		).resolves.toStrictEqual([{ id: open.id, title: 'many-open' }])
		await expect(isDeleted(open.id)).resolves.toBe(true)
		await expect(isDeleted(closed.id)).resolves.toBe(false)
	})
})
