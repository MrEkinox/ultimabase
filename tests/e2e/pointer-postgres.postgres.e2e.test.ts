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

const User = Schema.define({
	className: 'PointerE2EUser',
	fields: {
		name: stringField({ validation: { required: true } }),
	},
	hooks: {
		afterFind: ({ result }) => {
			pointerTrace.push('user:afterFind')

			return result
		},
		beforeFind: ({ query }) => {
			pointerTrace.push('user:beforeFind')

			return query
		},
	},
})

const Post = Schema.define({
	className: 'PointerE2EPost',
	fields: {
		author: pointerField({
			hooks: {
				resolveOutput: ({ value }) => {
					pointerTrace.push('post:author:resolveOutput')

					return value
				},
			},
			indexed: true,
			target: () => User,
			validation: { required: true },
		}),
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		afterUpdate: ({ operation, result }) => {
			pointerTrace.push('post:afterUpdate')

			// The write has happened at this point, so this failure proves transaction rollback.
			if (
				operation.kind === 'update-one' &&
				operation.update.operations.some(
					(update) =>
						update.kind === 'set' &&
						update.field === 'title' &&
						update.value === 'rollback-pointer',
				)
			) {
				throw pointerRollbackError
			}

			return result
		},
		beforeUpdate: ({ operation }) => {
			pointerTrace.push('post:beforeUpdate')

			return operation
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
		operation: {
			read: ({ context }) => context.access.mode === 'master',
		},
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
	true,
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
	it('executes public CRUD, model commands, selection-aware inclusion, and hooks', async () => {
		const app = getUltimaBase()
		pointerTrace.length = 0
		const firstAuthor = await User.create({ name: 'Ada' }, { ultimabase: app })
		const secondAuthor = await User.create(
			{ name: 'Grace' },
			{ ultimabase: app },
		)
		const firstPointer = User.pointer(firstAuthor.id)
		const secondPointer = User.pointer(secondAuthor.id)
		const created = await new Post({
			author: firstPointer,
			title: 'Typed pointer',
		}).create({ ultimabase: app })

		expect(created.author).toBeInstanceOf(Pointer)
		expect(created.author.equals(firstPointer)).toBe(true)

		const included = await Post.query()
			.equalTo('author', firstPointer)
			.select('title')
			.include('author', (query) => query.select('name'))
			.first({ ultimabase: app })

		expect(included?.title).toBe('Typed pointer')
		expect(included?.author?.toJSON()).toStrictEqual({ name: 'Ada' })
		expect(pointerTrace).toEqual(
			expect.arrayContaining([
				'post:author:resolveOutput',
				'user:beforeFind',
				'user:afterFind',
			]),
		)

		const directAuthor = await firstPointer
			.query()
			.select('name')
			.first({ ultimabase: app })

		expect(directAuthor?.toJSON()).toStrictEqual({ name: 'Ada' })

		pointerTrace.length = 0
		const updated = await created.update(
			{ author: secondPointer, title: 'Updated pointer' },
			{ ultimabase: app },
		)

		expect(updated?.author.equals(secondPointer)).toBe(true)
		expect(pointerTrace).toEqual(
			expect.arrayContaining(['post:beforeUpdate', 'post:afterUpdate']),
		)

		await expect(
			Post.updateOne(
				{
					where: (where) => where.equalTo('id', created.id),
					data: {
						author: firstPointer,
						title: 'rollback-pointer',
					},
				},
				{ ultimabase: app },
			),
		).rejects.toBe(pointerRollbackError)

		const afterRollback = await Post.query()
			.byId(created.id)
			.select('author', 'title')
			.first({ ultimabase: app })

		expect(afterRollback?.author.equals(secondPointer)).toBe(true)
		expect(afterRollback?.title).toBe('Updated pointer')

		const deleted = await updated?.delete({ ultimabase: app })

		expect(deleted?.author.equals(secondPointer)).toBe(true)
		await expect(
			Post.query().byId(created.id).exists({ ultimabase: app }),
		).resolves.toBe(false)
	})

	it('enforces unique and foreign-key constraints through sanitized errors', async () => {
		const app = getUltimaBase()
		const target = await UniqueTarget.create(
			{ label: 'unique' },
			{ ultimabase: app },
		)
		const targetPointer = UniqueTarget.pointer(target.id)

		await UniqueSource.create({ target: targetPointer }, { ultimabase: app })
		await expect(
			UniqueSource.create({ target: targetPointer }, { ultimabase: app }),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23505' },
		})
		await expect(
			UniqueSource.create(
				{
					target: UniqueTarget.pointer('0198a43e-2431-7000-8000-000000000999'),
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
			const author = await User.create({ name: 'Committed author' })

			return Post.create({
				author: User.pointer(author.id),
				title: 'Committed post',
			})
		})

		expect(committed.author).toBeInstanceOf(Pointer)

		await expect(
			request.transaction(async () => {
				const author = await User.create({ name: 'Rolled back author' })

				await Post.create({
					author: User.pointer(author.id),
					title: 'Rolled back post',
				})
				throw rollbackError
			}),
		).rejects.toBe(rollbackError)

		await expect(
			runWithRequestEngine(request, () =>
				User.query().equalTo('name', 'Rolled back author').exists(),
			),
		).resolves.toBe(false)
		await expect(
			runWithRequestEngine(request, () =>
				Post.query().equalTo('title', 'Rolled back post').exists(),
			),
		).resolves.toBe(false)
	})

	it('applies restrict, cascade, and setNull in PostgreSQL', async () => {
		const app = getUltimaBase()
		const restrictedTarget = await RestrictedTarget.create(
			{ label: 'restricted' },
			{ ultimabase: app },
		)
		const restrictedSource = await RestrictedSource.create(
			{ target: RestrictedTarget.pointer(restrictedTarget.id) },
			{ ultimabase: app },
		)

		await expect(
			RestrictedTarget.deleteOne(
				{ where: (where) => where.equalTo('id', restrictedTarget.id) },
				{ ultimabase: app },
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23503' },
		})
		await expect(
			RestrictedSource.query()
				.byId(restrictedSource.id)
				.exists({ ultimabase: app }),
		).resolves.toBe(true)

		const cascadeTarget = await CascadeTarget.create(
			{ label: 'cascade' },
			{ ultimabase: app },
		)
		const cascadeSource = await CascadeSource.create(
			{ target: CascadeTarget.pointer(cascadeTarget.id) },
			{ ultimabase: app },
		)

		await CascadeTarget.deleteOne(
			{ where: (where) => where.equalTo('id', cascadeTarget.id) },
			{ ultimabase: app },
		)
		await expect(
			CascadeSource.query().byId(cascadeSource.id).exists({ ultimabase: app }),
		).resolves.toBe(false)

		const nullableTarget = await NullableTarget.create(
			{ label: 'set-null' },
			{ ultimabase: app },
		)
		const nullableSource = await NullableSource.create(
			{ target: NullableTarget.pointer(nullableTarget.id) },
			{ ultimabase: app },
		)

		await NullableTarget.deleteOne(
			{ where: (where) => where.equalTo('id', nullableTarget.id) },
			{ ultimabase: app },
		)
		const detached = await NullableSource.query()
			.byId(nullableSource.id)
			.select('target')
			.include('target', (query) => query.select('label'))
			.first({ ultimabase: app })

		expect(detached?.target).toBeNull()
	})

	it('hides denied and deleted included targets behind the same null result', async () => {
		const app = getUltimaBase()
		const target = await PrivateTarget.create(
			{ label: 'private' },
			{ ultimabase: app },
		)
		const source = await PrivateSource.create(
			{ target: PrivateTarget.pointer(target.id) },
			{ ultimabase: app },
		)
		const query = PrivateSource.query()
			.byId(source.id)
			.select('target')
			.include('target', (targetQuery) => targetQuery.select('label'))
		const denied = await query.first({ ultimabase: app })
		const allowed = await query.first({ ultimabase: app, useMasterKey: true })
		const deletedTarget = await NullableTarget.create(
			{ label: 'deleted' },
			{ ultimabase: app },
		)
		const detachedSource = await NullableSource.create(
			{ target: NullableTarget.pointer(deletedTarget.id) },
			{ ultimabase: app },
		)

		await deletedTarget.delete({ ultimabase: app })
		const detached = await NullableSource.query()
			.byId(detachedSource.id)
			.select('target')
			.include('target', (targetQuery) => targetQuery.select('label'))
			.first({ ultimabase: app })

		expect(denied?.target).toBeNull()
		expect(denied?.target).toBe(detached?.target)
		expect(allowed?.target?.toJSON()).toStrictEqual({ label: 'private' })
	})

	it('persists and cleans circular pointers without transport infrastructure', async () => {
		const app = getUltimaBase()
		const left = await CircularLeft.create({}, { ultimabase: app })
		const right = await CircularRight.create(
			{ left: CircularLeft.pointer(left.id) },
			{ ultimabase: app },
		)
		const updatedLeft = await CircularLeft.updateOne(
			{
				where: (where) => where.equalTo('id', left.id),
				data: { right: new Pointer(CircularRight, right.id) },
			},
			{ ultimabase: app },
		)

		expect(updatedLeft?.right?.id).toBe(right.id)
		await CircularLeft.deleteOne(
			{ where: (where) => where.equalTo('id', left.id) },
			{ ultimabase: app },
		)
		const detachedRight = await CircularRight.query()
			.byId(right.id)
			.select('left')
			.first({ ultimabase: app })

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
