import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import { requestSources, anonymous } from '@ultimabase/core/plugin'

// Conformance of the referential-integrity contract of ADR-0299 on
// PostgreSQL. These cases move into the adapter-parameterized suite when a
// second database adapter exists.
const App = UltimaBase.use(hooksPlugin(), softDeletePlugin())

let cascadedHooks = 0

const Parent = App.Schema.define({
	className: 'IntegrityParent',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({})

const RestrictChild = App.Schema.define({
	className: 'IntegrityRestrictChild',
	fields: (field) => ({ parent: field.pointer({ target: () => Parent }) }),
}).with({})

const CascadeChild = App.Schema.define({
	className: 'IntegrityCascadeChild',
	fields: (field) => ({
		parent: field.pointer({ target: () => Parent, onDelete: 'cascade' }),
	}),
}).with({
	hooks: {
		beforeOperation: {
			delete: () => {
				cascadedHooks += 1
			},
		},
	},
})

const CascadeGrandchild = App.Schema.define({
	className: 'IntegrityCascadeGrandchild',
	fields: (field) => ({
		child: field.pointer({ target: () => CascadeChild, onDelete: 'cascade' }),
	}),
}).with({})

const SetNullChild = App.Schema.define({
	className: 'IntegritySetNullChild',
	fields: (field) => ({
		parent: field.pointer({ target: () => Parent, onDelete: 'setNull' }),
	}),
}).with({})

const ChainRoot = App.Schema.define({
	className: 'IntegrityChainRoot',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({})

const ChainMiddle = App.Schema.define({
	className: 'IntegrityChainMiddle',
	fields: (field) => ({
		root: field.pointer({ target: () => ChainRoot, onDelete: 'cascade' }),
	}),
}).with({})

const ChainLeaf = App.Schema.define({
	className: 'IntegrityChainLeaf',
	fields: (field) => ({ middle: field.pointer({ target: () => ChainMiddle }) }),
}).with({})

const SoftParent = App.Schema.define({
	className: 'IntegritySoftParent',
	fields: (field) => ({ name: field.string({ required: true }) }),
})
	.softDelete()
	.with({})

const SoftChild = App.Schema.define({
	className: 'IntegritySoftChild',
	fields: (field) => ({
		parent: field.pointer({ target: () => SoftParent, onDelete: 'cascade' }),
	}),
}).with({})

const createApplication = (fixture: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		hooksPlugin(),
		softDeletePlugin(),
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		pluginPrivileges: { logger: false },
		schemas: [
			Parent,
			RestrictChild,
			CascadeChild,
			CascadeGrandchild,
			SetNullChild,
			ChainRoot,
			ChainMiddle,
			ChainLeaf,
			SoftParent,
			SoftChild,
		],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const application = (): ReturnType<typeof createApplication> => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'integrity' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

const createParent = async (name: string): Promise<string> =>
	(await Parent.createOne({ data: { name } })).id

const deferred = <TValue = void>(): PromiseWithResolvers<TValue> =>
	Promise.withResolvers<TValue>()

/** Gives the competing statement time to block on PostgreSQL's row lock. */
const letCompetitorBlock = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 150))

/** Captures a settled outcome without leaving a rejected promise unobserved. */
const settle = <TValue>(
	promise: Promise<TValue>,
): Promise<PromiseSettledResult<TValue>> =>
	promise.then(
		(value): PromiseSettledResult<TValue> => ({ status: 'fulfilled', value }),
		(reason: unknown): PromiseSettledResult<TValue> => ({
			reason,
			status: 'rejected',
		}),
	)

/** Runs `work` in an explicit transaction kept open until `release` resolves. */
const holdTransaction = (
	requestId: string,
	work: () => Promise<void>,
	release: Promise<void>,
): Promise<void> =>
	anonymous(application(), {
		requestId,
		source: requestSources.internal,
	}).transaction(async () => {
		await work()
		await release
	})

describe(
	'adapter-enforced referential integrity (ADR-0299)',
	{ concurrent: false },
	() => {
		it('restricts deleting a referenced row by default and rolls back', async () => {
			const parentId = await createParent('restricted')
			const child = await RestrictChild.createOne({
				data: { parent: { connect: parentId } },
			})

			await expect(
				Parent.deleteOne({ where: { id: parentId } }),
			).rejects.toMatchObject({
				code: 'REFERENCE_VIOLATION',
				publicDetails: { schema: 'IntegrityParent' },
				retryable: false,
			})
			await expect(
				Parent.exists({ where: { id: { eq: parentId } } }),
			).resolves.toBe(true)
			await expect(
				RestrictChild.exists({ where: { id: { eq: child.id } } }),
			).resolves.toBe(true)
		})

		it('cascades transitively without running hooks on cascaded children', async () => {
			const parentId = await createParent('cascaded')
			const child = await CascadeChild.createOne({
				data: { parent: { connect: parentId } },
			})
			const grandchild = await CascadeGrandchild.createOne({
				data: { child: { connect: child.id } },
			})
			cascadedHooks = 0

			await Parent.deleteOne({ where: { id: parentId } })

			await expect(
				CascadeChild.exists({ where: { id: { eq: child.id } } }),
			).resolves.toBe(false)
			await expect(
				CascadeGrandchild.exists({ where: { id: { eq: grandchild.id } } }),
			).resolves.toBe(false)
			expect(cascadedHooks).toBe(0)
		})

		it('fails the whole deletion when a cascade chain reaches a restrict', async () => {
			const root = await ChainRoot.createOne({ data: { name: 'chain' } })
			const middle = await ChainMiddle.createOne({
				data: { root: { connect: root.id } },
			})
			await ChainLeaf.createOne({ data: { middle: { connect: middle.id } } })

			await expect(
				ChainRoot.deleteOne({ where: { id: root.id } }),
			).rejects.toMatchObject({
				code: 'REFERENCE_VIOLATION',
				publicDetails: { schema: 'IntegrityChainRoot' },
			})
			await expect(
				ChainMiddle.exists({ where: { id: { eq: middle.id } } }),
			).resolves.toBe(true)
		})

		it('sets optional pointers to null', async () => {
			const parentId = await createParent('nulled')
			const child = await SetNullChild.createOne({
				data: { parent: { connect: parentId } },
			})

			await Parent.deleteOne({ where: { id: parentId } })

			await expect(
				SetNullChild.findOne({ where: { id: { eq: child.id } } }),
			).resolves.toMatchObject({ parent: null })
		})

		it('applies no referential action on soft deletion', async () => {
			const parent = await SoftParent.createOne({ data: { name: 'soft' } })
			const child = await SoftChild.createOne({
				data: { parent: { connect: parent.id } },
			})

			await SoftParent.deleteOne({ where: { id: parent.id } })

			await expect(
				SoftChild.findOne({ where: { id: { eq: child.id } } }),
			).resolves.toMatchObject({ parent: { id: parent.id } })
		})

		it('rejects a link to a missing row before the adapter', async () => {
			await expect(
				RestrictChild.createOne({
					data: { parent: { connect: '0198f090-2a50-7000-8000-00000000dead' } },
				}),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		describe('under concurrent writes', () => {
			const children = [
				['restrict', RestrictChild],
				['cascade', CascadeChild],
				['setNull', SetNullChild],
			] as const

			it.each(children)(
				'fails a child insert racing a committed %s deletion',
				async (_action, Child) => {
					const parentId = await createParent('deleted-first')
					const deleted = deferred()
					const release = deferred()
					const deletion = holdTransaction(
						'delete-first',
						async () => {
							await Parent.deleteOne({ where: { id: parentId } })
							deleted.resolve()
						},
						release.promise,
					)
					await deleted.promise
					const insert = settle<unknown>(
						Child.createOne({ data: { parent: { connect: parentId } } }),
					)
					await letCompetitorBlock()
					release.resolve()
					await deletion

					const outcome = await insert
					expect(outcome.status).toBe('rejected')
					expect(outcome).toMatchObject({
						reason: { code: 'REFERENCE_VIOLATION' },
					})
					await expect(
						Child.count({ where: { parent: { eq: parentId } } }),
					).resolves.toBe(0)
				},
			)

			it.each(children)(
				'applies %s to a child committed before the deletion',
				async (action, Child) => {
					const parentId = await createParent('inserted-first')
					const inserted = deferred<string>()
					const release = deferred()
					const insertion = holdTransaction(
						'insert-first',
						async () => {
							const child = await Child.createOne({
								data: { parent: { connect: parentId } },
							})
							inserted.resolve(child.id)
						},
						release.promise,
					)
					const childId = await inserted.promise
					const deletion = settle(Parent.deleteOne({ where: { id: parentId } }))
					await letCompetitorBlock()
					release.resolve()
					await insertion

					const outcome = await deletion
					const remaining = await Child.findOne({
						where: { id: { eq: childId } },
					})
					if (action === 'restrict') {
						expect(outcome).toMatchObject({
							reason: { code: 'REFERENCE_VIOLATION' },
							status: 'rejected',
						})
						expect(remaining).not.toBeNull()
					} else if (action === 'cascade') {
						expect(outcome.status).toBe('fulfilled')
						expect(remaining).toBeNull()
					} else {
						expect(outcome.status).toBe('fulfilled')
						expect(remaining).toMatchObject({ parent: null })
					}
				},
			)
		})
	},
)
