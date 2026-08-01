import { createApplication } from '@ultimabase/core'
import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres'
import {
	booleanField,
	defineSchema,
	intField,
	stringField,
} from '@ultimabase/schema'
import { createFrameworkEngine, requestSources } from '@ultimabase/runtime'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const PostSchema = defineSchema({
	className: 'RuntimePost',
	fields: {
		published: booleanField({ default: false }),
		title: stringField({ validation: { required: true } }),
		views: intField({ default: 0 }),
	},
})

const createInstant = '2026-08-01T08:00:00.000Z'
const updateInstant = '2026-08-01T09:30:00.000Z'
const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL worker fixture has not started')
	}

	return fixture
}

// The global Testcontainer is shared, but this file owns one reset worker namespace.
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('Runtime to PostgreSQL', { concurrent: false }, () => {
	it('executes the complete public singular CRUD flow against live rows', async () => {
		const application = await createApplication({
			schemas: [PostSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
		})
		const connection = application.getService(postgresConnectionServiceToken)
		const instants = [createInstant, updateInstant]
		const clock = (): Date => {
			const instant = instants.shift()

			if (instant === undefined) {
				throw new TypeError('Runtime E2E clock received an unexpected mutation')
			}

			return new Date(instant)
		}

		try {
			await application.start()

			const framework = createFrameworkEngine(application, {
				validation: { clock, timezone: 'UTC' },
			})
			const request = framework.anonymous({
				requestId: 'runtime-postgres-e2e',
				source: requestSources.internal,
			})
			const created = await request.query(PostSchema).create({
				title: 'First real E2E',
			})

			expect(created).toMatchObject({
				createdAt: createInstant,
				published: false,
				title: 'First real E2E',
				updatedAt: createInstant,
				views: 0,
			})
			expect(created.id).toMatch(uuidV7Pattern)

			const found = await request
				.query(PostSchema)
				.equalTo('published', false)
				.greaterThanOrEqualTo('views', 0)
				.select('id', 'title')
				.find()

			expect(found).toStrictEqual([{ id: created.id, title: 'First real E2E' }])

			const updated = await request
				.query(PostSchema)
				.equalTo('id', created.id)
				.select('id', 'published', 'title', 'updatedAt', 'views')
				.updateOne({
					increment: { views: 2 },
					set: { published: true, title: 'Persisted E2E' },
				})

			expect(updated).toStrictEqual({
				id: created.id,
				published: true,
				title: 'Persisted E2E',
				updatedAt: updateInstant,
				views: 2,
			})

			await expect(
				request
					.query(PostSchema)
					.equalTo('id', created.id)
					.select('id', 'title')
					.deleteOne(),
			).resolves.toStrictEqual({ id: created.id, title: 'Persisted E2E' })
			await expect(
				request.query(PostSchema).equalTo('id', created.id).find(),
			).resolves.toStrictEqual([])
			await expect(request.query(PostSchema).count()).resolves.toBe(0)
			await expect(request.query(PostSchema).exists()).resolves.toBe(false)
		} finally {
			await application.dispose()
		}

		expect(connection.state).toBe('closed')
	})
})
