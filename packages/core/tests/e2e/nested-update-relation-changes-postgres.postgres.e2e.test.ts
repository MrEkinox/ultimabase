import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { MasterAuthority, UltimaBase, type Model } from '@ultimabase/core'
import type { PluginSourceState } from '@ultimabase/core/plugin'
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

// Included rows are frozen plain objects (ADR-0310).
const isChildRow = (item: unknown): item is Model<typeof Child> =>
	typeof item === 'object' &&
	item !== null &&
	Object.getPrototypeOf(item) === Object.prototype &&
	typeof Reflect.get(item, 'name') === 'string'

const requireChildren = (value: unknown): readonly Model<typeof Child>[] => {
	if (!Array.isArray(value) || !value.every(isChildRow)) {
		throw new TypeError('Expected included nested-update children')
	}
	return value
}

describe(
	'nested update and relation changes with PostgreSQL',
	{ concurrent: false },
	() => {
		it('runs pointer updates before the source and relation commands in fixed order', async () => {
			const [author, current, removed, added] = await Child.createMany({
				data: [
					{ name: 'Author' },
					{ name: 'Current' },
					{ name: 'Removed' },
					{ name: 'Added' },
				],
			})
			if (
				author === undefined ||
				current === undefined ||
				removed === undefined ||
				added === undefined
			) {
				throw new TypeError('Nested-update seed children are incomplete')
			}
			const parent = await Parent.createOne({
				data: {
					child: { connect: author.id },
					children: { connect: [current.id, removed.id] },
					name: 'Before',
				},
			})
			trace.length = 0

			const updated = await Parent.updateOne({
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
			})

			if (updated === null || !isChildRow(updated.child)) {
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
				await Child.findOneOrThrow({ where: { id: removed.id } }),
			).toMatchObject({
				name: 'Removed',
			})

			const disconnected = await Parent.updateOne({
				where: { id: { eq: parent.id } },
				data: { child: null },
				include: { child: {} },
			})
			expect(disconnected).toMatchObject({ child: null })
			expect(
				await Child.findOneOrThrow({ where: { id: author.id } }),
			).toMatchObject({
				name: 'Author updated',
			})
		})

		it('replaces only visible owning membership and preserves hidden edges', async () => {
			const [visible, hidden, replacement] = await Child.createMany({
				data: [
					{ name: 'Visible' },
					{ name: 'Hidden' },
					{ name: 'Replacement' },
				],
			})
			if (
				visible === undefined ||
				hidden === undefined ||
				replacement === undefined
			) {
				throw new TypeError('Nested set seed children are incomplete')
			}
			const parent = await Parent.createOne({
				data: {
					children: { connect: [visible.id, hidden.id] },
					name: 'Visibility',
				},
			})
			// The hidden result is requested as `select: { id: true }` (ADR-0306).
			await Child.updateOne({
				where: { id: { eq: hidden.id } },
				data: { visible: false },
				select: { id: true },
			})

			await Parent.updateOne({
				where: { id: { eq: parent.id } },
				data: { children: { set: [replacement.id] } },
			})
			const afterSet = await Parent.findOneOrThrow(
				{ where: { id: parent.id }, include: { children: {} } },
				{ useMasterKey: true },
			)
			expect(
				// The retained Typegen graph owns exact cross-schema include identities.
				requireChildren(afterSet.children)
					.map((child) => readIncludedId(child))
					.sort(),
			).toEqual([hidden.id, replacement.id].sort())

			await Parent.updateOne({
				where: { id: { eq: parent.id } },
				data: { children: { set: [] } },
			})
			const afterClear = await Parent.findOneOrThrow(
				{ where: { id: parent.id }, include: { children: {} } },
				{ useMasterKey: true },
			)
			expect(
				requireChildren(afterClear.children).map((child) =>
					readIncludedId(child),
				),
			).toEqual([hidden.id])
		})

		it('updates inverse-pointer membership without deleting either target', async () => {
			const parent = await Parent.createOne({
				data: { name: 'Inverse parent' },
			})
			const [current, replacement] = await Note.createMany({
				data: [
					{ body: 'Current', parent: { connect: Parent.pointer(parent.id) } },
					{ body: 'Replacement' },
				],
			})
			if (current === undefined || replacement === undefined) {
				throw new TypeError('Nested inverse seed notes are incomplete')
			}

			const updated = await Parent.updateOne({
				where: { id: { eq: parent.id } },
				data: { notes: { set: [replacement.id] } },
				include: { notes: {} },
			})
			if (updated === null || !Array.isArray(updated.notes)) {
				throw new TypeError('Expected included inverse notes')
			}
			expect(updated.notes).toMatchObject([{ id: replacement.id }])
			expect(
				await Note.findOneOrThrow({ where: { id: current.id } }),
			).toMatchObject({
				parent: null,
			})
			expect(
				await Note.findOneOrThrow({ where: { id: replacement.id } }),
			).toMatchObject({
				parent: Parent.pointer(parent.id),
			})
		})

		it('updates and disconnects inverse-relation targets through the same edge', async () => {
			const child = await Child.createOne({
				data: { name: 'Inverse relation child' },
			})
			const [updatedParent, disconnectedParent] = await Promise.all([
				Parent.createOne({
					data: { children: { connect: [child.id] }, name: 'Updated target' },
				}),
				Parent.createOne({
					data: {
						children: { connect: [child.id] },
						name: 'Disconnected target',
					},
				}),
			])

			await Child.updateOne({
				where: { id: { eq: child.id } },
				data: {
					parents: {
						update: [
							{ id: updatedParent.id, data: { name: 'Updated inverse' } },
						],
						disconnect: [disconnectedParent.id],
					},
				},
			})

			expect(
				await Parent.findOneOrThrow({ where: { id: updatedParent.id } }),
			).toMatchObject({
				name: 'Updated inverse',
			})
			const reloaded = await Child.findOneOrThrow({
				where: { id: child.id },
				include: { parents: {} },
			})
			expect(reloaded.parents).toMatchObject([{ id: updatedParent.id }])
		})

		it('rolls descendants and membership back when the root after Hook fails', async () => {
			const [pointerTarget, related] = await Child.createMany({
				data: [{ name: 'Rollback pointer' }, { name: 'Rollback relation' }],
			})
			if (pointerTarget === undefined || related === undefined) {
				throw new TypeError('Nested rollback seed children are incomplete')
			}
			const parent = await Parent.createOne({
				data: {
					child: { connect: pointerTarget.id },
					children: { connect: [related.id] },
					name: 'Rollback parent',
				},
			})
			rejectParentAfterUpdate = true

			await expect(
				Parent.updateOne({
					where: { id: { eq: parent.id } },
					data: {
						child: { update: { name: 'Must roll back' } },
						children: { disconnect: [related.id] },
						name: 'Must roll back',
					},
				}),
			).rejects.toBe(rollbackError)
			rejectParentAfterUpdate = false

			expect(
				await Parent.findOneOrThrow({
					where: { id: parent.id },
					include: { children: {} },
				}),
			).toMatchObject({
				children: [{ id: related.id }],
				name: 'Rollback parent',
			})
			expect(
				await Child.findOneOrThrow({ where: { id: pointerTarget.id } }),
			).toMatchObject({
				name: 'Rollback pointer',
			})
		})

		it('fails hidden and unrelated relation updates before business hooks or writes', async () => {
			const [related, unrelated] = await Child.createMany({
				data: [{ name: 'Related' }, { name: 'Unrelated' }],
			})
			if (related === undefined || unrelated === undefined) {
				throw new TypeError('Nested protected seed children are incomplete')
			}
			const parent = await Parent.createOne({
				data: {
					children: { connect: [related.id] },
					name: 'Protected parent',
				},
			})
			// The hidden result is requested as `select: { id: true }` (ADR-0306).
			await Child.updateOne({
				where: { id: { eq: related.id } },
				data: { visible: false },
				select: { id: true },
			})

			for (const id of [related.id, unrelated.id]) {
				trace.length = 0
				await expect(
					Parent.updateOne({
						where: { id: { eq: parent.id } },
						data: {
							children: {
								update: [{ id, data: { name: 'Forbidden' } }],
							},
						},
					}),
				).rejects.toMatchObject({ code: 'NOT_FOUND' })
				expect(trace).toEqual(['parent:children:update'])
			}
		})

		it('returns null for a missing root without executing descendants', async () => {
			const missing = await Parent.updateOne({
				where: {
					id: { eq: '0199c2d0-0000-7000-8000-000000000099' },
				},
				data: {
					child: { create: { name: 'Must not exist' } },
					name: 'Missing root',
				},
			})

			expect(missing).toBeNull()
			expect(
				await Child.findMany({ where: { name: { eq: 'Must not exist' } } }),
			).toEqual([])
		})
	},
)
