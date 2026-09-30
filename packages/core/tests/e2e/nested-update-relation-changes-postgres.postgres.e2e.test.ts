import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	MasterAuthority,
	Pointer,
	UltimaBase,
	type PluginSourceState,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const trace: string[] = []
const rollbackError = new Error('nested update rollback fixture')
let rejectParentAfterUpdate = false
const NestedUpdateApplication =
	UltimaBase.use(accessPlugin()).use(hooksPlugin())

const Child = NestedUpdateApplication.Schema.define({
	className: 'NestedUpdateChild',
	access: {
		read: { where: ({ where }) => where.eq('visible', true) },
	},
	fields: (field) => ({
		name: field.string({ required: true }),
		parents: field.relation({
			mappedBy: 'children',
			target: 'NestedUpdateParent',
		}),
		visible: field.boolean({ default: true }),
	}),
	hooks: {
		afterOperation: {
			create: () => {
				trace.push('child:create:after')
			},
			update: () => {
				trace.push('child:update:after')
			},
		},
		beforeOperation: {
			create: () => {
				trace.push('child:create:before')
			},
			update: () => {
				trace.push('child:update:before')
			},
		},
	},
})

const Parent = NestedUpdateApplication.Schema.define({
	className: 'NestedUpdateParent',
	fields: (field) => ({
		child: field.pointer({ target: 'NestedUpdateChild' }),
		children: field.relation({
			access: {
				write: ({ change }) => {
					trace.push(`parent:children:${change.action}`)
					return true
				},
			},
			target: 'NestedUpdateChild',
		}),
		name: field.string({ required: true }),
		notes: field.relation({
			mappedBy: 'parent',
			target: 'NestedUpdateNote',
		}),
	}),
	hooks: {
		afterOperation: {
			update: () => {
				trace.push('parent:update:after')
				if (rejectParentAfterUpdate) throw rollbackError
			},
		},
		beforeOperation: {
			update: () => {
				trace.push('parent:update:before')
			},
		},
	},
})

const Note = NestedUpdateApplication.Schema.define({
	className: 'NestedUpdateNote',
	fields: (field) => ({
		body: field.string({ required: true }),
		parent: field.pointer({
			onDelete: 'setNull',
			target: 'NestedUpdateParent',
		}),
	}),
})

const schemas = [Child, Parent, Note] as const
let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [
				ReturnType<typeof hooksPlugin>,
				ReturnType<typeof accessPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Nested-update PostgreSQL application has not started')
	}
	return ultimabase
}

const readIncludedId = (value: object): string => {
	const id: unknown = Reflect.get(value, 'id')
	if (typeof id !== 'string') {
		throw new TypeError('Expected an included model identifier')
	}
	return id
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		accessPlugin({ default: true }),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'nested-update-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas,
		validation: { timezone: 'UTC' },
	})
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

afterEach(() => {
	rejectParentAfterUpdate = false
})

const requireChildren = (
	value: unknown,
): readonly InstanceType<typeof Child>[] => {
	if (!Array.isArray(value) || !value.every((item) => item instanceof Child)) {
		throw new TypeError('Expected included nested-update children')
	}
	return value
}

describe(
	'nested update and relation changes with PostgreSQL',
	{ concurrent: false },
	() => {
		it('runs pointer updates before the source and relation commands in fixed order', async () => {
			const app = getUltimaBase()
			const [author, current, removed, added] = await Child.createMany(
				{
					data: [
						{ name: 'Author' },
						{ name: 'Current' },
						{ name: 'Removed' },
						{ name: 'Added' },
					],
				},
				{ ultimabase: app },
			)
			if (
				author === undefined ||
				current === undefined ||
				removed === undefined ||
				added === undefined
			) {
				throw new TypeError('Nested-update seed children are incomplete')
			}
			const parent = await Parent.createOne(
				{
					data: {
						child: { connect: author.id },
						children: { connect: [current.id, removed.id] },
						name: 'Before',
					},
				},
				{ ultimabase: app },
			)
			trace.length = 0

			const updated = await Parent.updateOne(
				{
					where: { id: { eq: parent.id } },
					data: {
						child: { update: { name: 'Author updated' } },
						children: {
							create: [{ name: 'Created' }],
							connect: [added.id],
							update: [{ id: current.id, data: { name: 'Current updated' } }],
							disconnect: [removed.id],
						},
						name: 'After',
					},
					include: { child: {}, children: {} },
				},
				{ ultimabase: app },
			)

			if (updated === null || !(updated.child instanceof Child)) {
				throw new TypeError('Expected the included nested pointer target')
			}
			expect(updated.child.name).toBe('Author updated')
			expect(
				requireChildren(updated.children)
					.map(({ name }) => name)
					.sort(),
			).toEqual(['Added', 'Created', 'Current updated'])
			expect(trace).toEqual([
				'parent:children:create',
				'parent:children:connect',
				'parent:children:update',
				'parent:children:disconnect',
				'child:update:before',
				'child:update:after',
				'parent:children:create',
				'parent:children:connect',
				'parent:children:update',
				'parent:children:disconnect',
				'parent:update:before',
				'child:create:before',
				'child:create:after',
				'child:update:before',
				'child:update:after',
				'parent:update:after',
			])
			expect(
				await Child.get({ id: removed.id }, { ultimabase: app }),
			).toMatchObject({
				name: 'Removed',
			})

			const disconnected = await Parent.updateOne(
				{
					where: { id: { eq: parent.id } },
					data: { child: { disconnect: true } },
					include: { child: {} },
				},
				{ ultimabase: app },
			)
			expect(disconnected).toMatchObject({ child: null })
			expect(
				await Child.get({ id: author.id }, { ultimabase: app }),
			).toMatchObject({
				name: 'Author updated',
			})
		})

		it('replaces only visible owning membership and preserves hidden edges', async () => {
			const app = getUltimaBase()
			const [visible, hidden, replacement] = await Child.createMany(
				{
					data: [
						{ name: 'Visible' },
						{ name: 'Hidden' },
						{ name: 'Replacement' },
					],
				},
				{ ultimabase: app },
			)
			if (
				visible === undefined ||
				hidden === undefined ||
				replacement === undefined
			) {
				throw new TypeError('Nested set seed children are incomplete')
			}
			const parent = await Parent.createOne(
				{
					data: {
						children: { connect: [visible.id, hidden.id] },
						name: 'Visibility',
					},
				},
				{ ultimabase: app },
			)
			await hidden.update({ data: { visible: false } }, { ultimabase: app })

			await Parent.updateOne(
				{
					where: { id: { eq: parent.id } },
					data: { children: { set: [replacement.id] } },
				},
				{ ultimabase: app },
			)
			const afterSet = await Parent.get(
				{ id: parent.id, include: { children: {} } },
				{ ultimabase: app, useMasterKey: true },
			)
			expect(
				// The retained Typegen graph owns exact cross-schema include identities.
				requireChildren(afterSet.children)
					.map((child) => readIncludedId(child))
					.sort(),
			).toEqual([hidden.id, replacement.id].sort())

			await Parent.updateOne(
				{
					where: { id: { eq: parent.id } },
					data: { children: { clear: true } },
				},
				{ ultimabase: app },
			)
			const afterClear = await Parent.get(
				{ id: parent.id, include: { children: {} } },
				{ ultimabase: app, useMasterKey: true },
			)
			expect(
				requireChildren(afterClear.children).map((child) =>
					readIncludedId(child),
				),
			).toEqual([hidden.id])
		})

		it('updates inverse-pointer membership without deleting either target', async () => {
			const app = getUltimaBase()
			const parent = await Parent.createOne(
				{ data: { name: 'Inverse parent' } },
				{ ultimabase: app },
			)
			const [current, replacement] = await Note.createMany(
				{
					data: [
						{ body: 'Current', parent: new Pointer(Parent, parent.id) },
						{ body: 'Replacement' },
					],
				},
				{ ultimabase: app },
			)
			if (current === undefined || replacement === undefined) {
				throw new TypeError('Nested inverse seed notes are incomplete')
			}

			const updated = await Parent.updateOne(
				{
					where: { id: { eq: parent.id } },
					data: { notes: { set: [replacement.id] } },
					include: { notes: {} },
				},
				{ ultimabase: app },
			)
			if (updated === null || !Array.isArray(updated.notes)) {
				throw new TypeError('Expected included inverse notes')
			}
			expect(updated.notes).toMatchObject([{ id: replacement.id }])
			expect(
				await Note.get({ id: current.id }, { ultimabase: app }),
			).toMatchObject({
				parent: null,
			})
			expect(
				await Note.get({ id: replacement.id }, { ultimabase: app }),
			).toMatchObject({
				parent: new Pointer(Parent, parent.id),
			})
		})

		it('updates and disconnects inverse-relation targets through the same edge', async () => {
			const app = getUltimaBase()
			const child = await Child.createOne(
				{ data: { name: 'Inverse relation child' } },
				{ ultimabase: app },
			)
			const [updatedParent, disconnectedParent] = await Promise.all([
				Parent.createOne(
					{
						data: { children: { connect: [child.id] }, name: 'Updated target' },
					},
					{ ultimabase: app },
				),
				Parent.createOne(
					{
						data: {
							children: { connect: [child.id] },
							name: 'Disconnected target',
						},
					},
					{ ultimabase: app },
				),
			])

			await Child.updateOne(
				{
					where: { id: { eq: child.id } },
					data: {
						parents: {
							update: [
								{ id: updatedParent.id, data: { name: 'Updated inverse' } },
							],
							disconnect: [disconnectedParent.id],
						},
					},
				},
				{ ultimabase: app },
			)

			expect(
				await Parent.get({ id: updatedParent.id }, { ultimabase: app }),
			).toMatchObject({ name: 'Updated inverse' })
			const reloaded = await Child.get(
				{ id: child.id, include: { parents: {} } },
				{ ultimabase: app },
			)
			expect(reloaded.parents).toMatchObject([{ id: updatedParent.id }])
		})

		it('rolls descendants and membership back when the root after Hook fails', async () => {
			const app = getUltimaBase()
			const [pointerTarget, related] = await Child.createMany(
				{ data: [{ name: 'Rollback pointer' }, { name: 'Rollback relation' }] },
				{ ultimabase: app },
			)
			if (pointerTarget === undefined || related === undefined) {
				throw new TypeError('Nested rollback seed children are incomplete')
			}
			const parent = await Parent.createOne(
				{
					data: {
						child: { connect: pointerTarget.id },
						children: { connect: [related.id] },
						name: 'Rollback parent',
					},
				},
				{ ultimabase: app },
			)
			rejectParentAfterUpdate = true

			await expect(
				Parent.updateOne(
					{
						where: { id: { eq: parent.id } },
						data: {
							child: { update: { name: 'Must roll back' } },
							children: { disconnect: [related.id] },
							name: 'Must roll back',
						},
					},
					{ ultimabase: app },
				),
			).rejects.toBe(rollbackError)
			rejectParentAfterUpdate = false

			expect(
				await Parent.get(
					{ id: parent.id, include: { children: {} } },
					{ ultimabase: app },
				),
			).toMatchObject({
				children: [{ id: related.id }],
				name: 'Rollback parent',
			})
			expect(
				await Child.get({ id: pointerTarget.id }, { ultimabase: app }),
			).toMatchObject({ name: 'Rollback pointer' })
		})

		it('fails hidden and unrelated relation updates before business hooks or writes', async () => {
			const app = getUltimaBase()
			const [related, unrelated] = await Child.createMany(
				{ data: [{ name: 'Related' }, { name: 'Unrelated' }] },
				{ ultimabase: app },
			)
			if (related === undefined || unrelated === undefined) {
				throw new TypeError('Nested protected seed children are incomplete')
			}
			const parent = await Parent.createOne(
				{
					data: {
						children: { connect: [related.id] },
						name: 'Protected parent',
					},
				},
				{ ultimabase: app },
			)
			await related.update({ data: { visible: false } }, { ultimabase: app })

			for (const id of [related.id, unrelated.id]) {
				trace.length = 0
				await expect(
					Parent.updateOne(
						{
							where: { id: { eq: parent.id } },
							data: {
								children: {
									update: [{ id, data: { name: 'Forbidden' } }],
								},
							},
						},
						{ ultimabase: app },
					),
				).rejects.toMatchObject({ code: 'NOT_FOUND' })
				expect(trace).toEqual(['parent:children:update'])
			}
		})

		it('returns null for a missing root without executing descendants', async () => {
			const app = getUltimaBase()
			const missing = await Parent.updateOne(
				{
					where: {
						id: { eq: '0199c2d0-0000-7000-8000-000000000099' },
					},
					data: {
						child: { create: { name: 'Must not exist' } },
						name: 'Missing root',
					},
				},
				{ ultimabase: app },
			)

			expect(missing).toBeNull()
			expect(
				await Child.findMany(
					{ where: { name: { eq: 'Must not exist' } } },
					{ ultimabase: app },
				),
			).toEqual([])
		})
	},
)
