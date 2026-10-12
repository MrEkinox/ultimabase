import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	Pointer,
	UltimaBase,
	runWithRequestEngine,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { generatePointerId, queuedPointerIds } from './pointer-id-fixture.js'
import { isPlainResult } from '../../../../tests/fixtures/plain-results.js'
import {
	requestSources,
	anonymous,
	type PluginSourceState,
} from '@ultimabase/core/plugin'

const pointerTrace: string[] = []
const pointerRollbackError = new Error('pointer update rollback fixture')
const PointerSchemaApplication = UltimaBase.use(hooksPlugin())
const User = PointerSchemaApplication.Schema.define({
	className: 'PointerE2EUser',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})

const Post = PointerSchemaApplication.Schema.define({
	className: 'PointerE2EPost',
	fields: (field) => ({
		author: field.pointer({
			indexed: true,
			target: 'PointerE2EUser',
			required: true,
		}),
		title: field.string({ required: true }),
	}),
}).with({
	hooks: {
		afterOperation: {
			update: ({ changes }) => {
				pointerTrace.push('post:afterUpdate')

				// The write has happened at this point, so this failure proves transaction rollback.
				if (changes.title === 'rollback-pointer') {
					throw pointerRollbackError
				}
			},
		},
		beforeOperation: {
			update: () => {
				pointerTrace.push('post:beforeUpdate')
			},
		},
	},
})

const UniqueTarget = PointerSchemaApplication.Schema.define({
	className: 'PointerE2EUniqueTarget',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
})
const UniqueSource = PointerSchemaApplication.Schema.define({
	className: 'PointerE2EUniqueSource',
	fields: (field) => ({
		target: field.pointer({
			indexed: 'unique',
			target: 'PointerE2EUniqueTarget',
			required: true,
		}),
	}),
})

const RestrictedTarget = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ERestrictedTarget',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
})
const RestrictedSource = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ERestrictedSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'restrict',
			target: 'PointerE2ERestrictedTarget',
			required: true,
		}),
	}),
})

const CascadeTarget = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ECascadeTarget',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
})
const CascadeSource = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ECascadeSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'cascade',
			target: 'PointerE2ECascadeTarget',
			required: true,
		}),
	}),
})

const NullableTarget = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ENullableTarget',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
})
const NullableSource = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ENullableSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'setNull',
			target: 'PointerE2ENullableTarget',
		}),
	}),
})

// Access types the `access` rule; the instance installs its configured copy.
const PrivateTarget = PointerSchemaApplication.use(accessPlugin()).Schema.define({
	className: 'PointerE2EPrivateTarget',
	fields: (field) => ({
		label: field.string({ required: true }),
	}),
}).with({
	access: {
		read: false,
	},
})
const PrivateSource = PointerSchemaApplication.Schema.define({
	className: 'PointerE2EPrivateSource',
	fields: (field) => ({
		target: field.pointer({
			target: 'PointerE2EPrivateTarget',
			required: true,
		}),
	}),
})

const CircularLeft = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ECircularLeft',
	fields: (field) => ({
		right: field.pointer({
			onDelete: 'setNull',
			target: 'PointerE2ECircularRight',
		}),
	}),
})
const CircularRight = PointerSchemaApplication.Schema.define({
	className: 'PointerE2ECircularRight',
	fields: (field) => ({
		left: field.pointer({
			onDelete: 'setNull',
			target: 'PointerE2ECircularLeft',
		}),
	}),
})

const pointerSchemas = [
	User,
	Post,
	UniqueTarget,
	UniqueSource,
	RestrictedTarget,
	RestrictedSource,
	CascadeTarget,
	CascadeSource,
	NullableTarget,
	NullableSource,
	PrivateTarget,
	PrivateSource,
	CircularLeft,
	CircularRight,
] as const

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [...typeof pointerSchemas],
			readonly [ReturnType<typeof postgresPlugin>],
			PluginSourceState
	  >
	| undefined

const getUltimaBase = () => {
	if (ultimabase === undefined) {
		throw new TypeError('Pointer PostgreSQL application has not started')
	}

	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (PointerSchemaApplication.use(
		accessPlugin({ allowWithoutRule: { all: true } }),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'pointer-postgres-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: pointerSchemas,
		validation: {
			clock: () => new Date('2026-08-03T18:00:00.000Z'),
			timezone: 'UTC',
			uuidV7Generator: generatePointerId,
		},
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

describe('pointer vertical with PostgreSQL', { concurrent: false }, () => {
	it('honors explicit id ordering on an eager bounded page', async () => {
		const author = await User.createOne({ data: { name: 'Cursor author' } })
		const higherId = '0198a43e-2431-7000-8000-00000000f002'
		const lowerId = '0198a43e-2431-7000-8000-00000000f001'

		queuedPointerIds.push(higherId)
		await Post.createOne({
			data: {
				author: { connect: author.id },
				title: 'Cursor order fixture',
			},
		})
		queuedPointerIds.push(lowerId)
		await Post.createOne({
			data: {
				author: { connect: author.id },
				title: 'Cursor order fixture',
			},
		})

		const page = await Post.findMany({
			where: { title: { eq: 'Cursor order fixture' } },
			select: { id: true },
			include: { author: { select: { name: true } } },
			take: 2,
			orderBy: { id: 'asc' },
		})

		expect(page.map(({ id }) => id)).toStrictEqual([lowerId, higherId])
		expect(
			page.map(({ author: included }) =>
				isPlainResult(included) ? included.name : undefined,
			),
		).toStrictEqual(['Cursor author', 'Cursor author'])
	})

	it('executes public CRUD, model commands, selection-aware inclusion, and hooks', async () => {
		pointerTrace.length = 0
		const firstAuthor = await User.createOne({ data: { name: 'Ada' } })
		const secondAuthor = await User.createOne({ data: { name: 'Grace' } })
		const firstPointer = User.pointer(firstAuthor.id)
		const secondPointer = User.pointer(secondAuthor.id)
		const created = await Post.createOne({
			data: {
				author: { connect: firstPointer },
				title: 'Typed pointer',
			},
		})

		if (!Pointer.is(created.author)) {
			throw new TypeError(
				'Expected the created author pointer to be materialized',
			)
		}
		expect(created.author).toBeInstanceOf(Pointer)
		expect(created.author.equals(firstPointer)).toBe(true)

		const included = await Post.findOne({
			where: { author: { eq: firstPointer.id } },
			select: { title: true },
			include: { author: { select: { name: true } } },
		})

		expect(included?.title).toBe('Typed pointer')
		if (!isPlainResult(included?.author)) {
			throw new TypeError('Expected an included author row')
		}
		expect(included.author).toStrictEqual({
			id: firstAuthor.id,
			name: 'Ada',
		})
		// ADR-0310: an included row has no methods; updates go through the schema.
		expect(Reflect.get(included.author, 'update')).toBeUndefined()

		const renamedAuthor = await User.updateOne({
			where: { id: { eq: firstPointer.id } },
			data: { name: 'Ada Lovelace' },
		})

		expect(renamedAuthor?.name).toBe('Ada Lovelace')

		// A pointer no longer reads its target: the schema does (ADR-0310).
		const directAuthor = await User.findOne({
			where: { id: { eq: firstPointer.id } },
			select: { name: true },
		})

		expect(directAuthor).toStrictEqual({
			id: firstAuthor.id,
			name: 'Ada Lovelace',
		})

		pointerTrace.length = 0
		const updated = await Post.updateOne({
			where: { id: { eq: created.id } },
			data: { author: { connect: secondPointer }, title: 'Updated pointer' },
		})
		if (updated === null || !Pointer.is(updated.author)) {
			throw new TypeError(
				'Expected the updated author pointer to be materialized',
			)
		}

		expect(updated.author.equals(secondPointer)).toBe(true)
		expect(pointerTrace).toEqual(
			expect.arrayContaining(['post:beforeUpdate', 'post:afterUpdate']),
		)

		await expect(
			Post.updateOne({
				where: { id: { eq: created.id } },
				data: {
					author: { connect: firstPointer },
					title: 'rollback-pointer',
				},
			}),
		).rejects.toBe(pointerRollbackError)

		const afterRollback = await Post.findOne({
			where: { id: { eq: created.id } },
			select: { author: true, title: true },
		})
		if (!Pointer.is(afterRollback?.author)) {
			throw new TypeError(
				'Expected the persisted author pointer to be materialized',
			)
		}

		expect(afterRollback.author.equals(secondPointer)).toBe(true)
		expect(afterRollback.title).toBe('Updated pointer')

		const deleted = await Post.deleteOne({
			where: { id: { eq: updated.id } },
		})
		if (deleted === null || !Pointer.is(deleted.author)) {
			throw new TypeError(
				'Expected the deleted author pointer to be materialized',
			)
		}

		expect(deleted.author.equals(secondPointer)).toBe(true)
		await expect(
			Post.exists({ where: { id: { eq: created.id } } }),
		).resolves.toBe(false)
	})

	it('enforces unique and foreign-key constraints through sanitized errors', async () => {
		const target = await UniqueTarget.createOne({ data: { label: 'unique' } })
		const targetPointer = UniqueTarget.pointer(target.id)

		await UniqueSource.createOne({
			data: { target: { connect: targetPointer.id } },
		})
		await expect(
			UniqueSource.createOne({
				data: { target: { connect: targetPointer.id } },
			}),
		).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			internalDetails: { driverCode: '23505' },
		})
		await expect(
			UniqueSource.createOne({
				data: {
					target: {
						connect: '0198a43e-2431-7000-8000-000000000999',
					},
				},
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('keeps explicit pointer transactions atomic', async () => {
		const app = getUltimaBase()
		const request = anonymous(app, {
			requestId: 'pointer-postgres-transaction',
			source: requestSources.internal,
		})
		const rollbackError = new Error('pointer transaction rollback fixture')
		const committed = await request.transaction(async () => {
			const author = await User.createOne({
				data: { name: 'Committed author' },
			})

			return Post.createOne({
				data: {
					author: { connect: author.id },
					title: 'Committed post',
				},
			})
		})

		expect(committed.author).toBeInstanceOf(Pointer)

		await expect(
			request.transaction(async () => {
				const author = await User.createOne({
					data: { name: 'Rolled back author' },
				})

				await Post.createOne({
					data: {
						author: { connect: author.id },
						title: 'Rolled back post',
					},
				})
				throw rollbackError
			}),
		).rejects.toBe(rollbackError)

		await expect(
			runWithRequestEngine(request, () =>
				User.exists({ where: { name: { eq: 'Rolled back author' } } }),
			),
		).resolves.toBe(false)
		await expect(
			runWithRequestEngine(request, () =>
				Post.exists({ where: { title: { eq: 'Rolled back post' } } }),
			),
		).resolves.toBe(false)
	})

	it('applies restrict, cascade, and setNull in PostgreSQL', async () => {
		const restrictedTarget = await RestrictedTarget.createOne({
			data: { label: 'restricted' },
		})
		const restrictedSource = await RestrictedSource.createOne({
			data: {
				target: { connect: restrictedTarget.id },
			},
		})

		await expect(
			RestrictedTarget.deleteOne({
				where: { id: { eq: restrictedTarget.id } },
			}),
		).rejects.toMatchObject({
			code: 'REFERENCE_VIOLATION',
			internalDetails: { driverCode: '23503' },
		})
		await expect(
			RestrictedSource.exists({ where: { id: { eq: restrictedSource.id } } }),
		).resolves.toBe(true)

		const cascadeTarget = await CascadeTarget.createOne({
			data: { label: 'cascade' },
		})
		const cascadeSource = await CascadeSource.createOne({
			data: { target: { connect: cascadeTarget.id } },
		})

		await CascadeTarget.deleteOne({ where: { id: { eq: cascadeTarget.id } } })
		await expect(
			CascadeSource.exists({ where: { id: { eq: cascadeSource.id } } }),
		).resolves.toBe(false)

		const nullableTarget = await NullableTarget.createOne({
			data: { label: 'set-null' },
		})
		const nullableSource = await NullableSource.createOne({
			data: { target: { connect: nullableTarget.id } },
		})

		await NullableTarget.deleteOne({ where: { id: { eq: nullableTarget.id } } })
		const detached = await NullableSource.findOne({
			where: { id: { eq: nullableSource.id } },
			select: { target: true },
			include: { target: { select: { label: true } } },
		})

		expect(detached?.target).toBeNull()
	})

	it('hides denied and deleted included targets behind the same null result', async () => {
		// A write-only schema answers only `select: { id: true }` (ADR-0306).
		const target = await PrivateTarget.createOne({
			data: { label: 'private' },
			select: { id: true },
		})
		const source = await PrivateSource.createOne(
			{ data: { target: { connect: target.id } } },
			{ useMasterKey: true },
		)
		const query = {
			where: { id: { eq: source.id } },
			select: { target: true },
			include: { target: { select: { label: true } } },
		} as const
		const denied = await PrivateSource.findOne(query)
		const allowed = await PrivateSource.findOne(query, {
			useMasterKey: true,
		})
		const deletedTarget = await NullableTarget.createOne({
			data: { label: 'deleted' },
		})
		const detachedSource = await NullableSource.createOne({
			data: { target: { connect: deletedTarget.id } },
		})

		await NullableTarget.deleteOne({ where: { id: { eq: deletedTarget.id } } })
		const detached = await NullableSource.findOne({
			where: { id: { eq: detachedSource.id } },
			select: { target: true },
			include: { target: { select: { label: true } } },
		})

		expect(denied?.target).toBeNull()
		expect(denied?.target).toBe(detached?.target)
		if (!isPlainResult(allowed?.target)) {
			throw new TypeError(
				'Expected the private target to be included for master',
			)
		}
		expect(allowed.target).toStrictEqual({
			id: target.id,
			label: 'private',
		})
	})

	it('persists and cleans circular pointers without transport infrastructure', async () => {
		const left = await CircularLeft.createOne({ data: {} })
		const right = await CircularRight.createOne({
			data: { left: { connect: left.id } },
		})
		const updatedLeft = await CircularLeft.updateOne({
			where: { id: { eq: left.id } },
			data: { right: { connect: CircularRight.pointer(right.id) } },
		})
		if (!Pointer.is(updatedLeft?.right)) {
			throw new TypeError(
				'Expected the circular right pointer to be materialized',
			)
		}

		expect(updatedLeft.right.id).toBe(right.id)
		await CircularLeft.deleteOne({ where: { id: { eq: left.id } } })
		const detachedRight = await CircularRight.findOne({
			where: { id: { eq: right.id } },
			select: { left: true },
		})

		expect(detachedRight?.left).toBeNull()
	})

	it('uses one closed application-local target graph in the worker namespace', async () => {
		const app = getUltimaBase()
		const graph = app.compile().schemas.schemaTargets
		const independentApp = new (PointerSchemaApplication.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
		))({ schemas: pointerSchemas })

		try {
			const independentGraph = independentApp.compile().schemas.schemaTargets

			expect(fixture?.schemaName).toMatch(/^ultimabase_test_\d+$/u)
			expect(graph.get(Post, ['author'])).toBe(User)
			expect(independentGraph.get(Post, ['author'])).toBe(User)
			expect(independentGraph).not.toBe(graph)
		} finally {
			await independentApp.dispose()
		}
	})
})
