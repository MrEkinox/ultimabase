import { definePlugin } from '../../foundation.js'
import { relationField, Schema, stringField } from '../../schema/index.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
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
	it('hydrates filtered nested collections before the parent afterRead hook', async () => {
		const targetHookTrace: string[] = []
		const relationAccessTrace: string[] = []
		let parentObservedHydratedTargets = false
		const reply = Schema.define({
			className: 'RelationIncludedReply',
			fields: {
				body: stringField({
					hooks: { resolveOutput: ({ value }) => value.toUpperCase() },
					validation: { required: true },
				}),
			},
			hooks: {
				afterRead: ({ result }) => {
					targetHookTrace.push('reply:afterRead')

					return result
				},
				beforeRead: ({ query }) => {
					targetHookTrace.push('reply:beforeRead')

					return query
				},
			},
		})
		const comment = Schema.define({
			className: 'RelationIncludedComment',
			access: {
				filter: {
					read: ({ filter }) => filter.equalTo('status', 'visible'),
				},
			},
			fields: {
				body: stringField({
					hooks: { resolveOutput: ({ value }) => value.toUpperCase() },
					validation: { required: true },
				}),
				replies: relationField({
					access: {
						read: ({ kind }) => {
							relationAccessTrace.push(`comment:replies:${kind}`)

							return true
						},
					},
					target: () => reply,
				}),
				status: stringField(),
			},
			hooks: {
				afterRead: ({ result }) => {
					targetHookTrace.push('comment:afterRead')

					return result
				},
				beforeRead: ({ query }) => {
					targetHookTrace.push('comment:beforeRead')

					return query
				},
			},
		})
		const discussion = Schema.define({
			className: 'RelationIncludedDiscussion',
			fields: {
				comments: relationField({
					access: {
						read: ({ kind }) => {
							relationAccessTrace.push(`discussion:comments:${kind}`)

							return true
						},
					},
					target: () => comment,
				}),
				title: stringField(),
			},
			hooks: {
				afterRead: ({ kind, result }) => {
					const unknownResult: unknown = result

					if (
						kind === 'find-many' &&
						isUnknownArray(unknownResult) &&
						isPlainRecord(unknownResult[0]) &&
						isUnknownArray(unknownResult[0].comments) &&
						isPlainRecord(unknownResult[0].comments[0]) &&
						isUnknownArray(unknownResult[0].comments[0].replies)
					) {
						parentObservedHydratedTargets = true
					}

					return result
				},
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
			expect(results[0]?.comments[0]?.body).toBe('FIRST')
			expect(results[0]?.comments[0]?.replies[0]).toBeInstanceOf(reply)
			expect(results[0]?.comments[0]?.replies[0]?.body).toBe('NESTED')
			expect(JSON.stringify(results[0])).toBe(
				'{"title":"Runtime relations","comments":[{"body":"FIRST","replies":[{"body":"NESTED"}]}]}',
			)
			expect(parentObservedHydratedTargets).toBe(true)
			expect(targetHookTrace).toStrictEqual([])
			expect(relationAccessTrace).toStrictEqual([
				'discussion:comments:find-many',
				'comment:replies:find-many',
			])
			expect(adapter.rootRequests).toHaveLength(1)
			expect(adapter.rootRequests[0]?.inclusions?.[0]).toMatchObject({
				kind: 'relation',
				request: {
					operation: {
						kind: 'find-many',
						query: {
							limit: 2,
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
			access: { operation: { read: false } },
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
