import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { UltimaBase } from '@ultimabase/core'

import { expect, it } from 'vitest'

import {
	BulkAccountSchema,
	createInstant,
	getFixture,
} from './runtime-postgres-fixture.js'

/** Registers bulk database cases in the owning E2E file and worker. */
export const registerRuntimeBulkTests = (): void => {
	it('executes ordered atomic bulk, set writes, and unique upserts', async () => {
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({
			schemas: [BulkAccountSchema],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})
		await ultimabase.start()

		try {
			const ordered = await BulkAccountSchema.createMany({
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
			})

			expect(ordered.map(({ email }) => email)).toStrictEqual([
				'second@example.com',
				'first@example.com',
			])
			expect(ordered).toStrictEqual([
				{ email: 'second@example.com', id: ordered[0]?.id },
				{ email: 'first@example.com', id: ordered[1]?.id },
			])
			const bulkUpdated = await BulkAccountSchema.updateMany({
				data: ordered.map(({ id }) => ({
					where: { id: { eq: id } },
					data: { visits: { increment: 2 } },
				})),
			})

			expect(bulkUpdated.map(({ id }) => id).sort()).toStrictEqual(
				ordered.map(({ id }) => id).sort(),
			)

			const createdUpsert = await BulkAccountSchema.upsertOne({
				where: { email: { eq: 'upsert@example.com' } },
				create: {
					email: 'upsert@example.com',
					handle: 'upsert',
					tenantId: 'tenant-b',
				},
				update: { visits: { increment: 1 } },
				select: { email: true, visits: true },
			})
			expect(createdUpsert).toStrictEqual({
				email: 'upsert@example.com',
				id: createdUpsert.id,
				visits: 0,
			})

			const updatedUpsert = await BulkAccountSchema.upsertOne({
				where: { email: { eq: 'upsert@example.com' } },
				create: {
					email: 'upsert@example.com',
					handle: 'upsert',
					tenantId: 'tenant-b',
				},
				update: { visits: { increment: 1 } },
				select: { email: true, visits: true },
			})
			expect(updatedUpsert).toStrictEqual({
				email: 'upsert@example.com',
				id: updatedUpsert.id,
				visits: 1,
			})

			const bulkUpserted = await BulkAccountSchema.upsertMany({
				data: [
					{
						where: { email: { eq: 'upsert@example.com' } },
						create: {
							email: 'upsert@example.com',
							handle: 'upsert',
							tenantId: 'tenant-b',
						},
						update: { visits: { increment: 1 } },
					},
					{
						where: { email: { eq: 'bulk-upsert@example.com' } },
						create: {
							email: 'bulk-upsert@example.com',
							handle: 'bulk-upsert',
							tenantId: 'tenant-b',
						},
						update: { visits: { increment: 1 } },
					},
				],
				select: { email: true, visits: true },
			})
			expect(bulkUpserted).toStrictEqual([
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

			const composite = await BulkAccountSchema.upsertOne({
				where: {
					handle: { eq: 'composite' },
					tenantId: { eq: 'tenant-c' },
				},
				create: {
					email: 'composite@example.com',
					handle: 'composite',
					tenantId: 'tenant-c',
				},
				update: { visits: { increment: 1 } },
			})
			expect(composite).toMatchObject({
				handle: 'composite',
				tenantId: 'tenant-c',
				visits: 0,
			})

			await expect(
				BulkAccountSchema.createMany({
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
				}),
			).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			await expect(
				BulkAccountSchema.exists({
					where: { tenantId: { eq: 'tenant-atomic' } },
				}),
			).resolves.toBe(false)

			// Each pair races on email while also sharing an independent composite
			// unique index; either physical index may detect the competing insert.
			for (let attempt = 0; attempt < 100; attempt += 1) {
				const suffix = String(attempt)
				const email = `concurrent-${suffix}@example.com`
				const handle = `concurrent-${suffix}`
				const upsert = () =>
					BulkAccountSchema.upsertOne({
						where: { email: { eq: email } },
						create: { email, handle, tenantId: 'tenant-e' },
						update: { visits: { increment: 1 } },
						select: { visits: true },
					})
				const concurrent = await Promise.all([upsert(), upsert()])
				expect(concurrent.map(({ visits }) => visits).sort()).toStrictEqual([
					0, 1,
				])
			}
			await expect(
				BulkAccountSchema.upsertOne({
					where: { email: { eq: 'foreign@example.com' } },
					create: {
						email: 'foreign@example.com',
						handle: 'concurrent-0',
						tenantId: 'tenant-e',
					},
					update: { visits: { increment: 1 } },
				}),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'postgres-upsert-target-inaccessible' },
			})
			await expect(
				BulkAccountSchema.exists({
					where: { email: { eq: 'foreign@example.com' } },
				}),
			).resolves.toBe(false)
			await expect(
				BulkAccountSchema.findOne({
					where: { email: { eq: 'concurrent-0@example.com' } },
				}),
			).resolves.toMatchObject({ visits: 1 })
			await expect(
				BulkAccountSchema.deleteMany({ where: [{ id: { eq: composite.id } }] }),
			).resolves.toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})
}
