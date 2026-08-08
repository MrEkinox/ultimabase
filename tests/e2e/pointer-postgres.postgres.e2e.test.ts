import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	MasterAuthority,
	Pointer,
	Schema,
	UltimaBase,
	pointerField,
	requestSources,
	runWithRequestEngine,
	stringField,
	type PointerField,
	type ScalarFieldInferenceState,
	type SchemaClass,
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
	fields: {
		name: stringField({ validation: { required: true } }),
	},
})

const Post = Schema.define({
	className: 'PointerE2EPost',
	fields: {
		author: pointerField({
			indexed: true,
			target: () => User,
			validation: { required: true },
		}),
		title: stringField({ validation: { required: true } }),
	},
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
	fields: { label: stringField({ validation: { required: true } }) },
})
const UniqueSource = Schema.define({
	className: 'PointerE2EUniqueSource',
	fields: {
		target: pointerField({
			indexed: 'unique',
			target: () => UniqueTarget,
			validation: { required: true },
		}),
	},
})

const RestrictedTarget = Schema.define({
	className: 'PointerE2ERestrictedTarget',
	fields: { label: stringField({ validation: { required: true } }) },
})
const RestrictedSource = Schema.define({
	className: 'PointerE2ERestrictedSource',
	fields: {
		target: pointerField({
			onDelete: 'restrict',
			target: () => RestrictedTarget,
			validation: { required: true },
		}),
	},
})

const CascadeTarget = Schema.define({
	className: 'PointerE2ECascadeTarget',
	fields: { label: stringField({ validation: { required: true } }) },
})
const CascadeSource = Schema.define({
	className: 'PointerE2ECascadeSource',
	fields: {
		target: pointerField({
			onDelete: 'cascade',
			target: () => CascadeTarget,
			validation: { required: true },
		}),
	},
})

const NullableTarget = Schema.define({
	className: 'PointerE2ENullableTarget',
	fields: { label: stringField({ validation: { required: true } }) },
})
const NullableSource = Schema.define({
	className: 'PointerE2ENullableSource',
	fields: {
		target: pointerField({
			onDelete: 'setNull',
			target: () => NullableTarget,
		}),
	},
})

const PrivateTarget = Schema.define({
	className: 'PointerE2EPrivateTarget',
	access: {
		read: ({ context }) => context.access.mode === 'master',
	},
	fields: { label: stringField({ validation: { required: true } }) },
})
const PrivateSource = Schema.define({
	className: 'PointerE2EPrivateSource',
	fields: {
		target: pointerField({
			target: () => PrivateTarget,
			validation: { required: true },
		}),
	},
})

type CircularPointerState = ScalarFieldInferenceState<
	false,
	false,
	false,
	false
>
type CircularLeftSchema = SchemaClass<
	'PointerE2ECircularLeft',
	Readonly<{
		readonly right: PointerField<CircularRightSchema, CircularPointerState>
	}>,
	readonly []
>
type CircularRightSchema = SchemaClass<
	'PointerE2ECircularRight',
	Readonly<{
		readonly left: PointerField<CircularLeftSchema, CircularPointerState>
	}>,
	readonly []
>

function resolveCircularRight(): CircularRightSchema {
	return CircularRight
}

const CircularLeft: CircularLeftSchema = Schema.define({
	className: 'PointerE2ECircularLeft',
	fields: {
		right: pointerField({
			onDelete: 'setNull',
			target: resolveCircularRight,
		}),
	},
})
const CircularRight: CircularRightSchema = Schema.define({
	className: 'PointerE2ECircularRight',
	fields: {
		left: pointerField({
			onDelete: 'setNull',
			target: (): CircularLeftSchema => CircularLeft,
		}),
	},
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
					author: User.pointer(author.id),
					title: 'Cursor order fixture',
				},
			},
			{ ultimabase: app },
		)
		queuedPointerIds.push(lowerId)
		await Post.createOne(
			{
				data: {
					author: User.pointer(author.id),
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
		expect(page.map(({ author: included }) => included?.name)).toStrictEqual([
			'Cursor author',
			'Cursor author',
		])
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
		const firstPointer = User.pointer(firstAuthor.id)
		const secondPointer = User.pointer(secondAuthor.id)
		const created = await new Post({
			author: firstPointer,
			title: 'Typed pointer',
		}).create({}, { ultimabase: app })

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
		expect(included?.author?.toJSON()).toStrictEqual({ name: 'Ada' })

		if (included?.author === null || included?.author === undefined) {
			throw new TypeError('Expected an included author model')
		}

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

		expect(updated.author.equals(secondPointer)).toBe(true)
		expect(pointerTrace).toEqual(
			expect.arrayContaining(['post:beforeUpdate', 'post:afterUpdate']),
		)

		await expect(
			Post.updateOne(
				{
					where: (where) => where.eq('id', created.id),
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

		expect(afterRollback?.author.equals(secondPointer)).toBe(true)
		expect(afterRollback?.title).toBe('Updated pointer')

		const deleted = await updated.delete({}, { ultimabase: app })

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
		const targetPointer = UniqueTarget.pointer(target.id)

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
					author: User.pointer(author.id),
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
						author: User.pointer(author.id),
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
			{ data: { target: RestrictedTarget.pointer(restrictedTarget.id) } },
			{ ultimabase: app },
		)

		await expect(
			RestrictedTarget.deleteOne(
				{ where: (where) => where.eq('id', restrictedTarget.id) },
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
			{ data: { target: CascadeTarget.pointer(cascadeTarget.id) } },
			{ ultimabase: app },
		)

		await CascadeTarget.deleteOne(
			{ where: (where) => where.eq('id', cascadeTarget.id) },
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
			{ data: { target: NullableTarget.pointer(nullableTarget.id) } },
			{ ultimabase: app },
		)

		await NullableTarget.deleteOne(
			{ where: (where) => where.eq('id', nullableTarget.id) },
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
			{ data: { target: PrivateTarget.pointer(target.id) } },
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
			{ data: { target: NullableTarget.pointer(deletedTarget.id) } },
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
		expect(allowed?.target?.toJSON()).toStrictEqual({ label: 'private' })
	})

	it('persists and cleans circular pointers without transport infrastructure', async () => {
		const app = getUltimaBase()
		const left = await CircularLeft.createOne({ data: {} }, { ultimabase: app })
		const right = await CircularRight.createOne(
			{ data: { left: CircularLeft.pointer(left.id) } },
			{ ultimabase: app },
		)
		const updatedLeft = await CircularLeft.updateOne(
			{
				where: (where) => where.eq('id', left.id),
				data: { right: new Pointer(CircularRight, right.id) },
			},
			{ ultimabase: app },
		)

		expect(updatedLeft?.right?.id).toBe(right.id)
		await CircularLeft.deleteOne(
			{ where: (where) => where.eq('id', left.id) },
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
