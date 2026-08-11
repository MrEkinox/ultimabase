import { describe, expect, it } from 'vitest'

import {
	RequestContext,
	RequestContextValue,
	Schema,
	UltimaBase,
	definePlugin,
	requestSources,
} from '../../index.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'

interface FixturePrincipal {
	readonly id: string
}

const principal = new RequestContextValue<FixturePrincipal>(
	'fixture.auth.principal',
	(value: unknown): FixturePrincipal => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('Invalid fixture principal')
		}

		return Object.freeze({ id: value.id })
	},
)

const PrivateNote = Schema.define({
	className: 'OptionalSubjectPrivateNote',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	access: {
		// An absent plugin-owned principal denies rather than granting anonymous access.
		read: ({ context }) => context.getValue(principal) !== undefined,
	},
})

const row = {
	createdAt: '2026-08-03T00:00:00.000Z',
	id: '0198a43e-2431-7000-8000-000000000021',
	title: 'Private',
	updatedAt: '2026-08-03T00:00:00.000Z',
}

describe('dynamic Access subject capabilities', () => {
	it('fails closed until a plugin-owned context supplies the required subject', async () => {
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [row] }],
			[],
		)
		const database = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.optional-subject-database',
			capabilities: {
				provides: [provideTestDatabaseAdapter(adapter)],
			},
		})
		const ultimabase = new UltimaBase({
			schemas: [PrivateNote],
			plugins: [database],
		})

		try {
			await ultimabase.start()

			await expect(
				PrivateNote.findMany(undefined, { ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(adapter.rootRequests).toHaveLength(0)

			const authenticatedContext = RequestContext.anonymous({
				requestId: 'optional-subject-request',
				source: requestSources.internal,
			}).withValue(principal, { id: 'user-1' })
			const result = await PrivateNote.findMany(undefined, {
				context: authenticatedContext,
				ultimabase,
			})

			expect(result.map((note) => note.toJSON())).toStrictEqual([row])
			expect(adapter.rootRequests).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})
})
