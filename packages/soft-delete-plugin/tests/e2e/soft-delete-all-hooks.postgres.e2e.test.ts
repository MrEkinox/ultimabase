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
}).with({
	hooks: {
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
	},
})

// ADR-0347: a plugin operation key runs for its One command and for each
// row of its Many command, after `all`.
const OperationDocument = Application.Schema.define({
	className: 'SoftDeleteOperationHooksDocument',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
}).with({
	hooks: {
		beforeOperation: {
			all: ({ kind }) => {
				audit.push(`operation:beforeOperation:all:${kind}`)
			},
			softDelete: ({ originalItem }) => {
				audit.push(`operation:beforeOperation:softDelete:${originalItem.title}`)
			},
		},
		afterOperation: {
			restore: ({ item, target }) => {
				audit.push(
					`operation:afterOperation:restore:${item.title}:${String(item.isDeleted)}:${String(target.id.length > 0)}`,
				)
			},
			purge: ({ originalItem }) => {
				audit.push(`operation:afterOperation:purge:${originalItem.title}`)
			},
		},
		afterCommit: {
			restore: ({ originalItem }) => {
				audit.push(`operation:afterCommit:restore:${originalItem.title}`)
			},
		},
	},
})

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
		schemas: [Document, OperationDocument],
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

describe('plugin operation hook keys (ADR-0347)', () => {
	const operationAudit = () =>
		audit.filter((line) => line.startsWith('operation:'))

	it('runs softDelete for softDeleteOne and each row of softDeleteMany', async () => {
		const one = await OperationDocument.createOne({ data: { title: 'one' } })
		await OperationDocument.createMany({
			data: [{ title: 'many-a' }, { title: 'many-b' }],
		})
		await waitForAfterCommit()
		audit.length = 0

		await OperationDocument.softDeleteOne({ id: one.id })
		expect(operationAudit()).toStrictEqual([
			'operation:beforeOperation:all:softDeleteOne',
			'operation:beforeOperation:softDelete:one',
		])

		audit.length = 0
		await OperationDocument.softDeleteMany({
			where: { title: { startsWith: 'many-' } },
		})
		const lines = operationAudit()
		expect(
			lines.filter((line) => line.includes(':softDelete:')).sort(),
		).toStrictEqual([
			'operation:beforeOperation:softDelete:many-a',
			'operation:beforeOperation:softDelete:many-b',
		])
		// `all` still runs before the operation branch of each row.
		expect(lines.filter((line) => line.includes(':all:'))).toStrictEqual([
			'operation:beforeOperation:all:softDeleteMany',
			'operation:beforeOperation:all:softDeleteMany',
		])
		expect(lines[0]).toBe('operation:beforeOperation:all:softDeleteMany')
	})

	it('runs restore for restoreOne and each row of restoreMany', async () => {
		const one = await OperationDocument.createOne({
			data: { title: 'restore-one' },
		})
		await OperationDocument.createMany({
			data: [{ title: 'restore-a' }, { title: 'restore-b' }],
		})
		await OperationDocument.softDeleteMany({
			where: { title: { startsWith: 'restore-' } },
		})
		await waitForAfterCommit()
		audit.length = 0

		await OperationDocument.restoreOne({ id: one.id })
		await waitForAfterCommit()
		expect(
			operationAudit().filter((line) => !line.includes(':all:')),
		).toStrictEqual([
			'operation:afterOperation:restore:restore-one:false:true',
			'operation:afterCommit:restore:restore-one',
		])

		audit.length = 0
		await OperationDocument.restoreMany({
			where: { title: { in: ['restore-a', 'restore-b'] } },
		})
		await waitForAfterCommit()
		expect(
			operationAudit()
				.filter((line) => !line.includes(':all:'))
				.sort(),
		).toStrictEqual([
			'operation:afterCommit:restore:restore-a',
			'operation:afterCommit:restore:restore-b',
			'operation:afterOperation:restore:restore-a:false:true',
			'operation:afterOperation:restore:restore-b:false:true',
		])
	})

	it('runs purge for each row of purgeMany', async () => {
		await OperationDocument.createMany({
			data: [{ title: 'purge-a' }, { title: 'purge-b' }],
		})
		await waitForAfterCommit()
		audit.length = 0
		await OperationDocument.purgeMany(
			{ where: { title: { startsWith: 'purge-' } } },
			{ useMasterKey: true },
		)
		expect(
			operationAudit()
				.filter((line) => line.includes(':purge:'))
				.sort(),
		).toStrictEqual([
			'operation:afterOperation:purge:purge-a',
			'operation:afterOperation:purge:purge-b',
		])
	})
})
