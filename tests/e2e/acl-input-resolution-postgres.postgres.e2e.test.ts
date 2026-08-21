import {
	ACL,
	acl,
	aclPlugin,
	type ACLNormalizedUpdateInput,
} from '@ultimabase/acl-permissions-plugin'
import {
	decrement,
	increment,
	MasterAuthority,
	Schema,
	UltimaBase,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { immutableRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

interface CapturedCreateResolution {
	readonly currentData: undefined
	readonly data: Readonly<Record<string, unknown>>
	readonly update: undefined
}

interface CapturedUpdateResolution {
	readonly currentData: Readonly<Record<string, unknown>>
	readonly data: Readonly<Record<string, unknown>>
	readonly update: ACLNormalizedUpdateInput
}

const emptyACL = new ACL()
let createResolution: CapturedCreateResolution | undefined
let updateResolution: CapturedUpdateResolution | undefined
let rollbackResolution: CapturedUpdateResolution | undefined
let resolutionCount = 0

const ResolutionPost = Schema.define({
	className: 'ACLInputResolutionPost',
	fields: (field) => ({
		balance: field.decimal({ default: '10.00' }),
		labels: field.string({ default: ['current'], list: true }),
		note: field.string(),
		status: field.string({ default: 'unchanged' }),
		title: field.string({ validation: { required: true } }),
		views: field.int({ default: 2 }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: (input) => {
				resolutionCount += 1

				if (input.operation === 'create') {
					createResolution = immutableRecord({
						currentData: input.currentData,
						data: input.data,
						update: input.update,
					})

					return input.inputAcl ?? emptyACL
				}

				const captured = immutableRecord({
					currentData: input.currentData,
					data: input.data,
					update: input.update,
				})

				if (input.data.title === 'rollback-candidate') {
					rollbackResolution = captured
					throw new Error('ACL resolver requested rollback')
				}

				updateResolution = captured

				return input.inputAcl ?? input.currentAcl
			},
		}),
		postgresTable({ name: 'acl_input_resolution_posts' }),
	],
})

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof ResolutionPost],
			readonly [ReturnType<typeof aclPlugin>, ReturnType<typeof postgresPlugin>]
	  >
	| undefined
let postId: string | undefined

const getApplication = (): NonNullable<typeof ultimabase> => {
	if (ultimabase === undefined) {
		throw new TypeError('ACL input-resolution application is missing')
	}

	return ultimabase
}

const getFixture = (): NonNullable<typeof fixture> => {
	if (fixture === undefined) {
		throw new TypeError('ACL input-resolution PostgreSQL fixture is missing')
	}

	return fixture
}

const getPostId = (): string => {
	if (postId === undefined) {
		throw new TypeError('ACL input-resolution row is missing')
	}

	return postId
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-input-resolution-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			hooksPlugin(),
			aclPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
		schemas: [ResolutionPost],
	})
	await ultimabase.start()
	const created = await ResolutionPost.createOne(
		{ data: { acl: emptyACL, note: 'remove-me', title: 'current' } },
		{ ultimabase, useMasterKey: true },
	)

	postId = created.id
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL input resolution with PostgreSQL', { concurrent: false }, () => {
	it('exposes honest create and update candidates inside the mutation transaction', async () => {
		const app = getApplication()
		const id = getPostId()
		const replacement = new ACL().grantPublic('read')
		const masterOptions = { ultimabase: app, useMasterKey: true } as const

		expect(createResolution).toStrictEqual({
			currentData: undefined,
			data: {
				balance: '10.00',
				labels: ['current'],
				note: 'remove-me',
				status: 'unchanged',
				title: 'current',
				views: 2,
			},
			update: undefined,
		})

		const updated = await ResolutionPost.updateOne(
			{
				where: { id: { eq: id } },
				data: {
					acl: replacement,
					labels: ['stable', 'typed'],
					title: 'resolved-candidate',
					note: null,
					balance: increment('1.50'),
					views: increment(3),
				},
			},
			masterOptions,
		)

		expect(updated).toMatchObject({
			acl: replacement,
			balance: '11.50',
			labels: ['stable', 'typed'],
			status: 'unchanged',
			title: 'resolved-candidate',
			views: 5,
		})
		expect(updateResolution?.currentData).toStrictEqual({
			balance: '10.00',
			labels: ['current'],
			note: 'remove-me',
			status: 'unchanged',
			title: 'current',
			views: 2,
		})
		expect(updateResolution?.data).toStrictEqual({
			balance: '11.50',
			labels: ['stable', 'typed'],
			note: null,
			status: 'unchanged',
			title: 'resolved-candidate',
			views: 5,
		})
		expect(updateResolution?.update.operations.slice(0, -1)).toStrictEqual([
			{ field: 'labels', kind: 'set', value: ['stable', 'typed'] },
			{ field: 'title', kind: 'set', value: 'resolved-candidate' },
			{ field: 'note', kind: 'set', value: null },
			{ field: 'balance', kind: 'increment', value: '1.50' },
			{ field: 'views', kind: 'increment', value: 3 },
		])
		const timestampOperation = updateResolution?.update.operations.at(-1)

		expect(timestampOperation).toMatchObject({
			field: 'updatedAt',
			kind: 'set',
		})
		expect(typeof timestampOperation?.value).toBe('string')
		expect(Object.isFrozen(updateResolution?.currentData)).toBe(true)
		expect(Object.isFrozen(updateResolution?.data)).toBe(true)
		expect(Object.isFrozen(updateResolution?.update)).toBe(true)
		expect(updateResolution?.update.operations.every(Object.isFrozen)).toBe(
			true,
		)

		const persisted = await getFixture().pool.query<{
			readonly note: string | null
		}>('SELECT "note" FROM "acl_input_resolution_posts" WHERE "id" = $1', [id])

		expect(persisted.rows[0]?.note).toBeNull()
	})

	it('rolls back resolver failures and skips ordinary object updates', async () => {
		const app = getApplication()
		const id = getPostId()
		const masterOptions = { ultimabase: app, useMasterKey: true } as const
		const countBeforeRollback = resolutionCount

		await expect(
			ResolutionPost.updateOne(
				{
					where: { id: { eq: id } },
					data: {
						balance: decrement('0.25'),
						views: decrement(1),
						acl: new ACL(),
						title: 'rollback-candidate',
					},
				},
				masterOptions,
			),
		).rejects.toThrow('ACL resolver requested rollback')
		expect(rollbackResolution?.data).toMatchObject({
			balance: '11.25',
			title: 'rollback-candidate',
			views: 4,
		})
		expect(resolutionCount).toBe(countBeforeRollback + 1)
		await expect(
			ResolutionPost.findOne(
				{
					where: { id: { eq: id } },
					select: {
						acl: true,
						balance: true,
						status: true,
						title: true,
						views: true,
					},
				},
				masterOptions,
			),
		).resolves.toMatchObject({
			balance: '11.50',
			title: 'resolved-candidate',
			views: 5,
		})

		const countBeforeOrdinaryUpdate = resolutionCount
		await expect(
			ResolutionPost.updateOne(
				{
					where: { id: { eq: id } },
					data: { status: 'ordinary' },
				},
				masterOptions,
			),
		).resolves.toMatchObject({ status: 'ordinary' })
		expect(resolutionCount).toBe(countBeforeOrdinaryUpdate)
	})
})
