import {
	ACL,
	aclPlugin,
	type ACLNormalizedUpdateInput,
} from '@ultimabase/acl-permissions-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import type { PluginSourceState } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { immutableRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

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

const ACLSchemaApplication = UltimaBase.use(aclPlugin())
const publicRead = new ACL().grantPublic('read')
const ResolutionPost = ACLSchemaApplication.Schema.define({
	className: 'ACLInputResolutionPost',
	fields: (field) => ({
		balance: field.decimal({ default: '10.00' }),
		labels: field.string({ default: ['current'], list: true }),
		note: field.string(),
		status: field.string({ default: 'unchanged' }),
		title: field.string({ required: true }),
		views: field.int({ default: 2 }),
	}),
	postgres: { table: 'acl_input_resolution_posts' },
})
	.acl()
	.with({
		acl: {
			default: emptyACL,
			// ADR-0321: recomputes the ACL from the row's data on each write
			// that carries no explicit ACL.
			resolveInput: (input) => {
				resolutionCount += 1

				if (input.operation === 'create') {
					createResolution = immutableRecord({
						currentData: input.currentData,
						data: input.data,
						update: input.update,
					})

					return undefined
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

				return input.data.title === 'resolved-candidate'
					? publicRead
					: undefined
			},
		},
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof ResolutionPost],
			readonly [
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined
let postId: string | undefined

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
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		aclPlugin(),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-input-resolution-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [ResolutionPost],
	})
	await ultimabase.start()
	const created = await ResolutionPost.createOne(
		{ data: { note: 'remove-me', title: 'current' } },
		{ useMasterKey: true },
	)

	postId = created.id
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL input resolution with PostgreSQL', { concurrent: false }, () => {
	it('exposes honest create and update candidates inside the mutation transaction', async () => {
		const id = getPostId()
		const masterOptions = { useMasterKey: true } as const

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
					labels: ['stable', 'typed'],
					title: 'resolved-candidate',
					note: null,
					balance: { increment: '1.50' },
					views: { increment: 3 },
				},
			},
			masterOptions,
		)

		expect(updated.acl.toJSON()).toStrictEqual(publicRead.toJSON())
		expect(updated).toMatchObject({
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

	it('rolls back resolver failures and recomputes on ordinary updates', async () => {
		const id = getPostId()
		const masterOptions = { useMasterKey: true } as const
		const countBeforeRollback = resolutionCount

		await expect(
			ResolutionPost.updateOne(
				{
					where: { id: { eq: id } },
					data: {
						balance: { decrement: '0.25' },
						views: { decrement: 1 },
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
		expect(resolutionCount).toBe(countBeforeOrdinaryUpdate + 1)

		// Master's explicit ACL is written as is, without resolveInput.
		const explicit = new ACL().grantAuthenticated('read')
		await expect(
			ResolutionPost.updateOne(
				{ where: { id: { eq: id } }, data: { acl: explicit } },
				masterOptions,
			),
		).resolves.toMatchObject({ acl: explicit })
		expect(resolutionCount).toBe(countBeforeOrdinaryUpdate + 1)
	})
})
