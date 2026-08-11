import { definePlugin } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { isUnknownArray } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'

const createDatabasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.relation-inclusion-database',
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
			fields: (field) => ({
				body: field.string({ validation: { required: true } }),
			}),
		})
		const comment = Schema.define({
			className: 'RelationIncludedComment',
			fields: (field) => ({
				body: field.string({ validation: { required: true } }),
				replies: field.relation({
					access: {
						read: () => {
							relationAccessTrace.push('comment:replies')
							return true
						},
					},
					target: 'RelationIncludedReply',
				}),
				status: field.string(),
			}),
			access: {
				read: { where: ({ where }) => where.eq('status', 'visible') },
			},
		})
		const discussion = Schema.define({
			className: 'RelationIncludedDiscussion',
			fields: (field) => ({
				comments: field.relation({
					access: {
						read: () => {
							relationAccessTrace.push('discussion:comments')
							return true
						},
					},
					target: 'RelationIncludedComment',
				}),
				title: field.string(),
			}),
		})
		const sourceRecord = {
			id: '0198a43e-2431-7000-8000-000000000501',
			title: 'Runtime relations',
		}
		const commentRecord = {
			body: 'first',
			id: '0198a43e-2431-7000-8000-000000000502',
		}
		const replyRecord = {
			body: 'nested',
			id: '0198a43e-2431-7000-8000-000000000503',
		}
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
							orderBy: { createdAt: 'desc' },
							select: { body: true },
							where: { body: { ne: '' } },
						},
					},
				},
				{ ultimabase },
			)

			const comments: unknown = results[0]?.comments
			expect(comments).toHaveLength(1)
			if (!isUnknownArray(comments)) {
				throw new TypeError('Expected an included comment collection')
			}
			const firstComment: unknown = comments[0]
			expect(firstComment).toBeInstanceOf(comment)
			if (!(firstComment instanceof comment)) {
				throw new TypeError('Expected an included comment model')
			}
			expect(firstComment.body).toBe('first')
			const replies: unknown = firstComment.replies
			if (!isUnknownArray(replies)) {
				throw new TypeError('Expected an included reply collection')
			}
			expect(replies[0]).toBeInstanceOf(reply)
			if (!(replies[0] instanceof reply)) {
				throw new TypeError('Expected an included reply model')
			}
			expect(replies[0].body).toBe('nested')
			expect(JSON.stringify(results[0])).toBe(
				`{"title":"Runtime relations","id":"${sourceRecord.id}","comments":[{"body":"first","id":"${commentRecord.id}","replies":[{"body":"nested","id":"${replyRecord.id}"}]}]}`,
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
							selection: { fields: [{ field: 'body' }, { field: 'id' }] },
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
			fields: (field) => ({ name: field.string() }),
			access: { read: false },
		})
		const deniedSource = Schema.define({
			className: 'RelationIncludedDeniedSource',
			fields: (field) => ({
				name: field.string(),
				targets: field.relation({
					access: { read: false },
					target: 'RelationIncludedRestrictedTarget',
				}),
			}),
		})
		const allowedSource = Schema.define({
			className: 'RelationIncludedAllowedSource',
			fields: (field) => ({
				name: field.string(),
				targets: field.relation({
					target: 'RelationIncludedRestrictedTarget',
				}),
			}),
		})
		const deniedRecord = {
			id: '0198a43e-2431-7000-8000-000000000504',
			name: 'denied',
		}
		const allowedRecord = {
			id: '0198a43e-2431-7000-8000-000000000505',
			name: 'allowed',
		}
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
			fields: (field) => ({ name: field.string() }),
		})
		const source = Schema.define({
			className: 'RelationIncludedCapabilitySource',
			fields: (field) => ({
				name: field.string(),
				targets: field.relation({
					target: 'RelationIncludedCapabilityTarget',
				}),
			}),
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
