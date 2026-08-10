import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	MasterAuthority,
	Pointer,
	Schema,
	UltimaBase,
	requestSources,
	runWithRequestEngine,
	type BaseItem,
	type OperationOptions,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const pointerTrace: string[] = []
const pointerRollbackError = new Error('pointer update rollback fixture')
const queuedPointerIds: string[] = []
let generatedPointerId = 0

const generatePointerId = (): string => {
	const queued = queuedPointerIds.shift()

	if (queued !== undefined) return queued

	generatedPointerId += 1

	return `0198a43e-2431-7000-8000-${generatedPointerId.toString(16).padStart(12, '0')}`
}

const User = Schema.define({
	className: 'PointerE2EUser',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})

const isUpdatableIncludedUser = (
	value: unknown,
): value is InstanceType<typeof User> &
	Readonly<{
		update: (
			input: Readonly<{ data: Readonly<{ name: string }> }>,
			options?: OperationOptions,
		) => Promise<BaseItem>
	}> =>
	value instanceof User && typeof Reflect.get(value, 'update') === 'function'

const Post = Schema.define({
	className: 'PointerE2EPost',
	fields: (field) => ({
		author: field.pointer({
			indexed: true,
			target: 'PointerE2EUser',
			validation: { required: true },
		}),
		title: field.string({ validation: { required: true } }),
	}),
	hooks: {
		afterOperation: {
			update: ({ operation }) => {
				pointerTrace.push('post:afterUpdate')

				// The write has happened at this point, so this failure proves transaction rollback.
				if (
					operation.update.operations.some(
						(update) =>
							update.kind === 'set' &&
							update.field === 'title' &&
							update.value === 'rollback-pointer',
					)
				) {
					throw pointerRollbackError
				}
			},
		},
		beforeOperation: {
			update: ({ operation }) => {
				pointerTrace.push('post:beforeUpdate')

				void operation
			},
		},
	},
})

const UniqueTarget = Schema.define({
	className: 'PointerE2EUniqueTarget',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
})
const UniqueSource = Schema.define({
	className: 'PointerE2EUniqueSource',
	fields: (field) => ({
		target: field.pointer({
			indexed: 'unique',
			target: 'PointerE2EUniqueTarget',
			validation: { required: true },
		}),
	}),
})

const RestrictedTarget = Schema.define({
	className: 'PointerE2ERestrictedTarget',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
})
const RestrictedSource = Schema.define({
	className: 'PointerE2ERestrictedSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'restrict',
			target: 'PointerE2ERestrictedTarget',
			validation: { required: true },
		}),
	}),
})

const CascadeTarget = Schema.define({
	className: 'PointerE2ECascadeTarget',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
})
const CascadeSource = Schema.define({
	className: 'PointerE2ECascadeSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'cascade',
			target: 'PointerE2ECascadeTarget',
			validation: { required: true },
		}),
	}),
})

const NullableTarget = Schema.define({
	className: 'PointerE2ENullableTarget',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
})
const NullableSource = Schema.define({
	className: 'PointerE2ENullableSource',
	fields: (field) => ({
		target: field.pointer({
			onDelete: 'setNull',
			target: 'PointerE2ENullableTarget',
		}),
	}),
})

const PrivateTarget = Schema.define({
	className: 'PointerE2EPrivateTarget',
	fields: (field) => ({
		label: field.string({ validation: { required: true } }),
	}),
	access: {
		read: ({ context }) => context.access.mode === 'master',
	},
})
const PrivateSource = Schema.define({
	className: 'PointerE2EPrivateSource',
	fields: (field) => ({
		target: field.pointer({
			target: 'PointerE2EPrivateTarget',
			validation: { required: true },
		}),
	}),
})

const CircularLeft = Schema.define({
	className: 'PointerE2ECircularLeft',
	fields: (field) => ({
		right: field.pointer({
			onDelete: 'setNull',
			target: 'PointerE2ECircularRight',
		}),
	}),
})
const CircularRight = Schema.define({
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
			readonly [ReturnType<typeof postgresPlugin>]
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
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'pointer-postgres-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
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
	it('stabilizes an eager first cursor page by id without explicit ordering', async () => {
		const app = getUltimaBase()
		const author = await User.createOne(
			{ data: { name: 'Cursor author' } },
			{ ultimabase: app },
		)
		const higherId = '0198a43e-2431-7000-8000-00000000f002'
		const lowerId = '0198a43e-2431-7000-8000-00000000f001'

		queuedPointerIds.push(higherId)
		await Post.createOne(
			{
				data: {
					author: User.pointer(author.id.toString()),
					title: 'Cursor order fixture',
				},
			},
			{ ultimabase: app },
		)
		queuedPointerIds.push(lowerId)
		await Post.createOne(
			{
				data: {
					author: User.pointer(author.id.toString()),
					title: 'Cursor order fixture',
				},
			},
			{ ultimabase: app },
		)

		const page = await Post.findMany(
			{
				where: { title: { eq: 'Cursor order fixture' } },
				select: { id: true },
				include: { author: { select: { name: true } } },
				limit: 2,
				cursor: true,
			},
			{ ultimabase: app },
		)

		expect(page.map(({ id }) => id)).toStrictEqual([lowerId, higherId])
		expect(
			page.map(({ author: included }) =>
				included instanceof User ? included.name : undefined,
			),
		).toStrictEqual(['Cursor author', 'Cursor author'])
	})

	it('executes public CRUD, model commands, selection-aware inclusion, and hooks', async () => {
		const app = getUltimaBase()
		pointerTrace.length = 0
		const firstAuthor = await User.createOne(
			{ data: { name: 'Ada' } },
			{ ultimabase: app },
		)
		const secondAuthor = await User.createOne(
			{ data: { name: 'Grace' } },
			{ ultimabase: app },
		)
		const firstPointer = User.pointer(firstAuthor.id.toString())
		const secondPointer = User.pointer(secondAuthor.id.toString())
		const created = await new Post({
			author: firstPointer,
			title: 'Typed pointer',
		}).create({}, { ultimabase: app })

		if (!Pointer.is(created.author)) {
			throw new TypeError(
				'Expected the created author pointer to be materialized',
			)
		}
		expect(created.author).toBeInstanceOf(Pointer)
		expect(created.author.equals(firstPointer)).toBe(true)

		const included = await Post.findOne(
			{
				where: { author: { eq: firstPointer.id } },
				select: { title: true },
				include: { author: { select: { name: true } } },
			},
			{ ultimabase: app },
		)

		expect(included?.title).toBe('Typed pointer')
		if (!isUpdatableIncludedUser(included?.author)) {
			throw new TypeError('Expected an included author model')
		}
		expect(included.author.toJSON()).toStrictEqual({ name: 'Ada' })

		const renamedAuthor = await included.author.update(
			{ data: { name: 'Ada Lovelace' } },
			{ ultimabase: app },
		)

		expect(renamedAuthor.name).toBe('Ada Lovelace')

		const directAuthor = await firstPointer.findOne(
			{ select: { name: true } },
			{ ultimabase: app },
		)

		expect(directAuthor?.toJSON()).toStrictEqual({ name: 'Ada Lovelace' })

		pointerTrace.length = 0
		const updated = await created.update(
			{ data: { author: secondPointer, title: 'Updated pointer' } },
			{ ultimabase: app },
		)
		if (!Pointer.is(updated.author)) {
			throw new TypeError(
				'Expected the updated author pointer to be materialized',
			)
		}

		expect(updated.author.equals(secondPointer)).toBe(true)
		expect(pointerTrace).toEqual(
			expect.arrayContaining(['post:beforeUpdate', 'post:afterUpdate']),
		)

		await expect(
			Post.updateOne(
				{
					where: { id: { eq: created.id } },
					data: {
						author: firstPointer,
						title: 'rollback-pointer',
					},
				},
				{ ultimabase: app },
			),
		).rejects.toBe(pointerRollbackError)

		const afterRollback = await Post.findOne(
			{
				where: { id: { eq: created.id } },
				select: { author: true, title: true },
			},
			{ ultimabase: app },
		)
		if (!Pointer.is(afterRollback?.author)) {
			throw new TypeError(
				'Expected the persisted author pointer to be materialized',
			)
		}

		expect(afterRollback.author.equals(secondPointer)).toBe(true)
		expect(afterRollback.title).toBe('Updated pointer')

		const deleted = await updated.delete({}, { ultimabase: app })
		if (!Pointer.is(deleted.author)) {
			throw new TypeError(
				'Expected the deleted author pointer to be materialized',
			)
		}

		expect(deleted.author.equals(secondPointer)).toBe(true)
		await expect(
			Post.exists({ where: { id: { eq: created.id } } }, { ultimabase: app }),
		).resolves.toBe(false)
	})

	it('enforces unique and foreign-key constraints through sanitized errors', async () => {
		const app = getUltimaBase()
		const target = await UniqueTarget.createOne(
			{ data: { label: 'unique' } },
			{ ultimabase: app },
		)
		const targetPointer = UniqueTarget.pointer(target.id.toString())

		await UniqueSource.createOne(
			{ data: { target: targetPointer } },
			{ ultimabase: app },
		)
		await expect(
			UniqueSource.createOne(
				{ data: { target: targetPointer } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23505' },
		})
		await expect(
			UniqueSource.createOne(
				{
					data: {
						target: UniqueTarget.pointer(
							'0198a43e-2431-7000-8000-000000000999',
						),
					},
				},
				{ ultimabase: app },
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23503' },
		})
	})

	it('keeps explicit pointer transactions atomic', async () => {
		const app = getUltimaBase()
		const request = app.engine.anonymous({
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
					author: User.pointer(author.id.toString()),
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
						author: User.pointer(author.id.toString()),
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
		const app = getUltimaBase()
		const restrictedTarget = await RestrictedTarget.createOne(
			{ data: { label: 'restricted' } },
			{ ultimabase: app },
		)
		const restrictedSource = await RestrictedSource.createOne(
			{
				data: {
					target: RestrictedTarget.pointer(restrictedTarget.id.toString()),
				},
			},
			{ ultimabase: app },
		)

		await expect(
			RestrictedTarget.deleteOne(
				{ where: { id: { eq: restrictedTarget.id } } },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23503' },
		})
		await expect(
			RestrictedSource.exists(
				{ where: { id: { eq: restrictedSource.id } } },
				{ ultimabase: app },
			),
		).resolves.toBe(true)

		const cascadeTarget = await CascadeTarget.createOne(
			{ data: { label: 'cascade' } },
			{ ultimabase: app },
		)
		const cascadeSource = await CascadeSource.createOne(
			{ data: { target: CascadeTarget.pointer(cascadeTarget.id.toString()) } },
			{ ultimabase: app },
		)

		await CascadeTarget.deleteOne(
			{ where: { id: { eq: cascadeTarget.id } } },
			{ ultimabase: app },
		)
		await expect(
			CascadeSource.exists(
				{ where: { id: { eq: cascadeSource.id } } },
				{ ultimabase: app },
			),
		).resolves.toBe(false)

		const nullableTarget = await NullableTarget.createOne(
			{ data: { label: 'set-null' } },
			{ ultimabase: app },
		)
		const nullableSource = await NullableSource.createOne(
			{
				data: { target: NullableTarget.pointer(nullableTarget.id.toString()) },
			},
			{ ultimabase: app },
		)

		await NullableTarget.deleteOne(
			{ where: { id: { eq: nullableTarget.id } } },
			{ ultimabase: app },
		)
		const detached = await NullableSource.findOne(
			{
				where: { id: { eq: nullableSource.id } },
				select: { target: true },
				include: { target: { select: { label: true } } },
			},
			{ ultimabase: app },
		)

		expect(detached?.target).toBeNull()
	})

	it('hides denied and deleted included targets behind the same null result', async () => {
		const app = getUltimaBase()
		const target = await PrivateTarget.createOne(
			{ data: { label: 'private' } },
			{ ultimabase: app },
		)
		const source = await PrivateSource.createOne(
			{ data: { target: PrivateTarget.pointer(target.id.toString()) } },
			{ ultimabase: app },
		)
		const query = {
			where: { id: { eq: source.id } },
			select: { target: true },
			include: { target: { select: { label: true } } },
		} as const
		const denied = await PrivateSource.findOne(query, { ultimabase: app })
		const allowed = await PrivateSource.findOne(query, {
			ultimabase: app,
			useMasterKey: true,
		})
		const deletedTarget = await NullableTarget.createOne(
			{ data: { label: 'deleted' } },
			{ ultimabase: app },
		)
		const detachedSource = await NullableSource.createOne(
			{ data: { target: NullableTarget.pointer(deletedTarget.id.toString()) } },
			{ ultimabase: app },
		)

		await deletedTarget.delete({}, { ultimabase: app })
		const detached = await NullableSource.findOne(
			{
				where: { id: { eq: detachedSource.id } },
				select: { target: true },
				include: { target: { select: { label: true } } },
			},
			{ ultimabase: app },
		)

		expect(denied?.target).toBeNull()
		expect(denied?.target).toBe(detached?.target)
		if (!(allowed?.target instanceof PrivateTarget)) {
			throw new TypeError(
				'Expected the private target to be included for master',
			)
		}
		expect(allowed.target.toJSON()).toStrictEqual({ label: 'private' })
	})

	it('persists and cleans circular pointers without transport infrastructure', async () => {
		const app = getUltimaBase()
		const left = await CircularLeft.createOne({ data: {} }, { ultimabase: app })
		const right = await CircularRight.createOne(
			{ data: { left: CircularLeft.pointer(left.id.toString()) } },
			{ ultimabase: app },
		)
		const updatedLeft = await CircularLeft.updateOne(
			{
				where: { id: { eq: left.id } },
				data: { right: new Pointer(CircularRight, right.id.toString()) },
			},
			{ ultimabase: app },
		)
		if (!Pointer.is(updatedLeft?.right)) {
			throw new TypeError(
				'Expected the circular right pointer to be materialized',
			)
		}

		expect(updatedLeft.right.id).toBe(right.id)
		await CircularLeft.deleteOne(
			{ where: { id: { eq: left.id } } },
			{ ultimabase: app },
		)
		const detachedRight = await CircularRight.findOne(
			{
				where: { id: { eq: right.id } },
				select: { left: true },
			},
			{ ultimabase: app },
		)

		expect(detachedRight?.left).toBeNull()
	})

	it('uses one closed application-local target graph in the worker namespace', async () => {
		const app = getUltimaBase()
		const graph = app.application.schemaTargets
		const independentApp = new UltimaBase({
			plugins: [],
			schemas: pointerSchemas,
		})

		await independentApp.application.initialize()

		try {
			const independentGraph = independentApp.application.schemaTargets

			expect(fixture?.schemaName).toMatch(/^ultimabase_test_\d+$/u)
			expect(graph.get(Post, ['author'])).toBe(User)
			expect(independentGraph.get(Post, ['author'])).toBe(User)
			expect(independentGraph).not.toBe(graph)
		} finally {
			await independentApp.dispose()
		}
	})
})
