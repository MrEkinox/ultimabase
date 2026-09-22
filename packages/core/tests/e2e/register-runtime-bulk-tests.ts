import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { increment, UltimaBase } from '@ultimabase/core'

import { expect, it } from 'vitest'

import {
	BulkAccountSchema,
	createInstant,
	getFixture,
} from './runtime-postgres-fixture.js'

/** Registers bulk database cases in the owning E2E file and worker. */
export const registerRuntimeBulkTests = (): void => {
	it('executes ordered atomic bulk, set writes, and unique upserts', async () => {
		const ultimabase = new UltimaBase({
			schemas: [BulkAccountSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})
		await ultimabase.start()

		try {
			const ordered = await BulkAccountSchema.createMany(
				{
					data: [
						{
							email: 'second@example.com',
							handle: 'second',
							tenantId: 'tenant-a',
						},
						{
							email: 'first@example.com',
							handle: 'first',
							tenantId: 'tenant-a',
						},
					],
					select: { email: true, id: true },
				},
				{ ultimabase },
			)

			expect(ordered.map(({ email }) => email)).toStrictEqual([
				'second@example.com',
				'first@example.com',
			])
			expect(ordered.map((account) => account.toJSON())).toStrictEqual([
				{ email: 'second@example.com', id: ordered[0]?.id },
				{ email: 'first@example.com', id: ordered[1]?.id },
			])
			const bulkUpdated = await BulkAccountSchema.updateMany(
				{
					data: ordered.map(({ id }) => ({
						where: { id: { eq: id } },
						data: { visits: increment(2) },
					})),
				},
				{ ultimabase },
			)

			expect(bulkUpdated.map(({ id }) => id).sort()).toStrictEqual(
				ordered.map(({ id }) => id).sort(),
			)

			const createdUpsert = await BulkAccountSchema.upsertOne(
				{
					where: { email: { eq: 'upsert@example.com' } },
					create: {
						email: 'upsert@example.com',
						handle: 'upsert',
						tenantId: 'tenant-b',
					},
					update: { visits: increment(1) },
					select: { email: true, visits: true },
				},
				{ ultimabase },
			)
			expect(createdUpsert.toJSON()).toStrictEqual({
				email: 'upsert@example.com',
				id: createdUpsert.id,
				visits: 0,
			})

			const updatedUpsert = await BulkAccountSchema.upsertOne(
				{
					where: { email: { eq: 'upsert@example.com' } },
					create: {
						email: 'upsert@example.com',
						handle: 'upsert',
						tenantId: 'tenant-b',
					},
					update: { visits: increment(1) },
					select: { email: true, visits: true },
				},
				{ ultimabase },
			)
			expect(updatedUpsert.toJSON()).toStrictEqual({
				email: 'upsert@example.com',
				id: updatedUpsert.id,
				visits: 1,
			})

			const bulkUpserted = await BulkAccountSchema.upsertMany(
				{
					data: [
						{
							where: { email: { eq: 'upsert@example.com' } },
							create: {
								email: 'upsert@example.com',
								handle: 'upsert',
								tenantId: 'tenant-b',
							},
							update: { visits: increment(1) },
						},
						{
							where: { email: { eq: 'bulk-upsert@example.com' } },
							create: {
								email: 'bulk-upsert@example.com',
								handle: 'bulk-upsert',
								tenantId: 'tenant-b',
							},
							update: { visits: increment(1) },
						},
					],
					select: { email: true, visits: true },
				},
				{ ultimabase },
			)
			expect(bulkUpserted.map((account) => account.toJSON())).toStrictEqual([
				{
					email: 'upsert@example.com',
					id: bulkUpserted[0]?.id,
					visits: 2,
				},
				{
					email: 'bulk-upsert@example.com',
					id: bulkUpserted[1]?.id,
					visits: 0,
				},
			])

			const composite = await BulkAccountSchema.upsertOne(
				{
					where: {
						handle: { eq: 'composite' },
						tenantId: { eq: 'tenant-c' },
					},
					create: {
						email: 'composite@example.com',
						handle: 'composite',
						tenantId: 'tenant-c',
					},
					update: { visits: increment(1) },
				},
				{ ultimabase },
			)
			expect(composite).toMatchObject({
				handle: 'composite',
				tenantId: 'tenant-c',
				visits: 0,
			})

			await expect(
				BulkAccountSchema.createMany(
					{
						data: [
							{
								email: 'atomic-duplicate@example.com',
								handle: 'atomic-first',
								tenantId: 'tenant-atomic',
							},
							{
								email: 'atomic-duplicate@example.com',
								handle: 'atomic-second',
								tenantId: 'tenant-atomic',
							},
						],
					},
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			await expect(
				BulkAccountSchema.exists(
					{ where: { tenantId: { eq: 'tenant-atomic' } } },
					{ ultimabase },
				),
			).resolves.toBe(false)

			const concurrent = await Promise.all([
				BulkAccountSchema.upsertOne(
					{
						where: { email: { eq: 'concurrent@example.com' } },
						create: {
							email: 'concurrent@example.com',
							handle: 'concurrent',
							tenantId: 'tenant-e',
						},
						update: { visits: increment(1) },
					},
					{ ultimabase },
				),
				BulkAccountSchema.upsertOne(
					{
						where: { email: { eq: 'concurrent@example.com' } },
						create: {
							email: 'concurrent@example.com',
							handle: 'concurrent',
							tenantId: 'tenant-e',
						},
						update: { visits: increment(1) },
					},
					{ ultimabase },
				),
			])
			expect(concurrent.map(({ visits }) => visits).sort()).toStrictEqual([
				0, 1,
			])
			await expect(
				BulkAccountSchema.deleteMany(
					{ where: [{ id: { eq: composite.id } }] },
					{ ultimabase },
				),
			).resolves.toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})
}
