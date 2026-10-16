import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0318 amendment: `all` covers plugin commands, named by `kind`, before
// the command's own branch. An audit hook sees every Soft Delete command.
const audit: string[] = []

const Application = UltimaBase.use(
	softDeletePlugin(),
	hooksPlugin({
		global: {
			afterCommit: {
				all: ({ kind, schema }) => {
					audit.push(`global:afterCommit:${schema}:${kind}`)
				},
			},
		},
	}),
)

const Document = Application.Schema.define({
	className: 'SoftDeleteAllHooksDocument',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
}).with((plugins) =>
	plugins.hooks({
		beforeOperation: {
			all: ({ kind }) => {
				// `kind` names the native operations and every Soft Delete command.
				expectTypeOf(kind).toEqualTypeOf<
					| 'create'
					| 'delete'
					| 'purgeMany'
					| 'purgeOne'
					| 'restoreMany'
					| 'restoreOne'
					| 'softDeleteMany'
					| 'softDeleteOne'
					| 'update'
					| 'upsert'
				>()
				audit.push(`beforeOperation:all:${kind}`)
			},
			softDeleteOne: ({ originalItem }) => {
				audit.push(`beforeOperation:softDeleteOne:${originalItem.title}`)
			},
		},
		afterOperation: {
			all: (input) => {
				if (input.kind === 'restoreOne') {
					audit.push(
						`afterOperation:all:restoreOne:${String(input.item.isDeleted)}`,
					)
					return
				}
				audit.push(`afterOperation:all:${input.kind}`)
			},
		},
		afterCommit: {
			all: ({ kind }) => {
				audit.push(`afterCommit:all:${kind}`)
			},
		},
	}),
)

let fixture: PostgresWorkerFixture | undefined
let ultimabase: { dispose(): Promise<void> } | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'soft_delete_all' })
	const app = new (Application.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'soft-delete-all-hooks', value: 'all-hooks-key' }],
			onUse: () => undefined,
		}),
		schemas: [Document],
	})
	ultimabase = app
	try {
		await app.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

beforeEach(() => {
	audit.length = 0
})

describe('`all` hooks and Soft Delete commands (ADR-0318 amendment)', () => {
	it('runs `all` for every command, before the command branch', async () => {
		const row = await Document.createOne({ data: { title: 'audited' } })
		await waitForAfterCommit()
		expect(audit).toStrictEqual([
			'beforeOperation:all:create',
			'afterOperation:all:create',
			// Global hooks run before the schema's own hooks.
			'global:afterCommit:SoftDeleteAllHooksDocument:create',
			'afterCommit:all:create',
		])

		audit.length = 0
		await Document.softDeleteOne({ id: row.id })
		await waitForAfterCommit()
		expect(audit).toStrictEqual([
			'beforeOperation:all:softDeleteOne',
			'beforeOperation:softDeleteOne:audited',
			'afterOperation:all:softDeleteOne',
			'global:afterCommit:SoftDeleteAllHooksDocument:softDeleteOne',
			'afterCommit:all:softDeleteOne',
		])

		audit.length = 0
		await Document.restoreOne({ id: row.id })
		await waitForAfterCommit()
		expect(audit).toStrictEqual([
			'beforeOperation:all:restoreOne',
			'afterOperation:all:restoreOne:false',
			'global:afterCommit:SoftDeleteAllHooksDocument:restoreOne',
			'afterCommit:all:restoreOne',
		])
	})

	it('names the many-row commands and purge in `kind`', async () => {
		await Document.createOne({ data: { title: 'batch' } })
		audit.length = 0
		await Document.softDeleteMany({ where: { title: { eq: 'batch' } } })
		await Document.purgeMany(
			{ where: { title: { eq: 'batch' } } },
			{ useMasterKey: true },
		)
		await waitForAfterCommit()
		const kinds = new Set(
			audit
				.filter((line) => line.startsWith('afterCommit:all:'))
				.map((line) => line.slice('afterCommit:all:'.length)),
		)
		expect([...kinds].sort()).toStrictEqual(['purgeMany', 'softDeleteMany'])
	})
})
