import { definePlugin } from '../../foundation.js'
import { relationField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'

const createDatabasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		name: 'fixture.relation-inclusion-database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
	})

describe('relation Runtime inclusion', () => {
	it('hydrates filtered nested collections before returning the parent', async () => {
		const relationAccessTrace: string[] = []
		const reply = Schema.define({
			className: 'RelationIncludedReply',
			fields: {
				body: stringField({ validation: { required: true } }),
			},
		})
		const comment = Schema.define({
			className: 'RelationIncludedComment',
			access: {
				read: { where: ({ where }) => where.eq('status', 'visible') },
			},
			fields: {
				body: stringField({ validation: { required: true } }),
				replies: relationField({
					access: {
						read: () => {
							relationAccessTrace.push('comment:replies')

							return true
						},
					},
					target: () => reply,
				}),
				status: stringField(),
			},
		})
		const discussion = Schema.define({
			className: 'RelationIncludedDiscussion',
			fields: {
				comments: relationField({
					access: {
						read: () => {
							relationAccessTrace.push('discussion:comments')

							return true
						},
					},
					target: () => comment,
				}),
				title: stringField(),
			},
		})
		const sourceRecord = { title: 'Runtime relations' }
		const commentRecord = { body: 'first' }
		const replyRecord = { body: 'nested' }
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['comments'],
							record: sourceRecord,
							target: [commentRecord],
						},
						{
							fieldPath: ['replies'],
							record: commentRecord,
							target: [replyRecord],
						},
					],
					status: 'fulfilled',
					value: [sourceRecord],
				},
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [reply, comment, discussion],
		})

		try {
			await ultimabase.start()
			const results = await discussion.findMany(
				{
					select: { title: true },
					include: {
						comments: {
							include: { replies: { select: { body: true } } },
							limit: 2,
							offset: 3,
							orderBy: [{ createdAt: 'desc' }],
							select: { body: true },
							where: { body: { ne: '' } },
						},
					},
				},
				{ ultimabase },
			)

			expect(results[0]?.comments).toHaveLength(1)
			expect(results[0]?.comments[0]).toBeInstanceOf(comment)
			expect(results[0]?.comments[0]?.body).toBe('first')
			expect(results[0]?.comments[0]?.replies[0]).toBeInstanceOf(reply)
			expect(results[0]?.comments[0]?.replies[0]?.body).toBe('nested')
			expect(JSON.stringify(results[0])).toBe(
				'{"title":"Runtime relations","comments":[{"body":"first","replies":[{"body":"nested"}]}]}',
			)
			expect(relationAccessTrace).toStrictEqual([
				'discussion:comments',
				'comment:replies',
			])
			expect(adapter.rootRequests).toHaveLength(1)
			expect(adapter.rootRequests[0]?.inclusions?.[0]).toMatchObject({
				kind: 'relation',
				request: {
					operation: {
						kind: 'find-many',
						query: {
							limit: 2,
							pagination: { kind: 'offset-pagination', offset: 3 },
							selection: { fields: [{ field: 'body' }] },
						},
					},
					rowFilter: { field: 'status', kind: 'equal', value: 'visible' },
				},
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rejects denied source traversal and hides a denied target as an empty collection', async () => {
		const target = Schema.define({
			className: 'RelationIncludedRestrictedTarget',
			access: { read: false },
			fields: { name: stringField() },
		})
		const deniedSource = Schema.define({
			className: 'RelationIncludedDeniedSource',
			fields: {
				name: stringField(),
				targets: relationField({
					access: { read: false },
					target: () => target,
				}),
			},
		})
		const allowedSource = Schema.define({
			className: 'RelationIncludedAllowedSource',
			fields: {
				name: stringField(),
				targets: relationField({ target: () => target }),
			},
		})
		const deniedRecord = { name: 'denied' }
		const allowedRecord = { name: 'allowed' }
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [deniedRecord] },
				{ status: 'fulfilled', value: [allowedRecord] },
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, deniedSource, allowedSource],
		})

		try {
			await ultimabase.start()
			await expect(
				deniedSource.findMany(
					{
						include: { targets: { select: { name: true } } },
						select: { name: true },
					},
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			const allowed = await allowedSource.findMany(
				{
					include: { targets: { select: { name: true } } },
					select: { name: true },
				},
				{ ultimabase },
			)

			expect(allowed[0]?.targets).toStrictEqual([])
			expect(adapter.rootRequests).toHaveLength(1)
			expect(adapter.rootRequests[0]?.inclusions?.[0]).toMatchObject({
				kind: 'relation',
				unavailable: true,
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('fails before database execution when the adapter omits inclusion support', async () => {
		const target = Schema.define({
			className: 'RelationIncludedCapabilityTarget',
			fields: { name: stringField() },
		})
		const source = Schema.define({
			className: 'RelationIncludedCapabilitySource',
			fields: {
				name: stringField(),
				targets: relationField({ target: () => target }),
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [{ name: 'source' }] }],
			[],
			{},
			{ inclusions: false },
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, source],
		})

		try {
			await ultimabase.start()
			await expect(
				source.findMany(
					{
						include: { targets: { select: { name: true } } },
						select: { name: true },
					},
					{ ultimabase },
				),
			).rejects.toMatchObject({
				code: 'INTERNAL_ERROR',
				publicMessage: 'Relationship inclusion is not available.',
			})
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})
})
