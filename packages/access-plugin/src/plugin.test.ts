import { onTestFinished, describe, expect, it } from 'vitest'
import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

import {
	accessPlugin,
	accessDiagnosticsObserverCapability,
	provideAccessContributions,
	schemaAccess,
} from './index.js'

const AccessApplication = UltimaBase.use(accessPlugin())

class StaticReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	constructor(private readonly result: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Static read adapter does not execute mutations')
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.access.database',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
	})

const SecretDocument = AccessApplication.Schema.define({
	className: 'AccessPluginSecretDocument',
	fields: (field) => ({
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
}).with({ access: { read: true } })

const PlainDocument = AccessApplication.Schema.define({
	className: 'AccessPluginPlainDocument',
	fields: (field) => ({ title: field.string() }),
})

const ObservedDocument = AccessApplication.Schema.define({
	className: 'AccessPluginObservedDocument',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { read: () => true } })

const CountOnlyDocument = AccessApplication.Schema.define({
	className: 'AccessPluginCountOnlyDocument',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { read: { count: true } } })

const MasterBypassDocument = AccessApplication.Schema.define({
	className: 'AccessPluginMasterBypassDocument',
	fields: (field) => ({
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
}).with({ access: { read: false } })

const VirtualDocument = AccessApplication.Schema.define({
	className: 'AccessPluginVirtualDocument',
	fields: (field) => ({
		label: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `Label: ${String(item.title)}`,
			select: { title: true },
		}),
		privateLabel: field.virtual({
			access: { read: false },
			output: (output) => output.string({ nullable: false }),
			resolve: ({ item }) => `Private: ${String(item.title)}`,
			select: { title: true },
		}),
		title: field.string(),
	}),
}).with({ access: { read: true } })

const row = {
	createdAt: '2026-08-20T10:00:00.000Z',
	id: '019c0000-0000-7000-8000-000000000001',
	secret: 'hidden',
	title: 'visible',
	updatedAt: '2026-08-20T10:00:00.000Z',
}
const plainRow = {
	createdAt: row.createdAt,
	id: row.id,
	title: row.title,
	updatedAt: row.updatedAt,
}

describe('accessPlugin', () => {
	it('keeps the access namespace unavailable until the plugin is configured', async () => {
		const application = new UltimaBase({ schemas: [SecretDocument] })
		onTestFinished(() => application.dispose())

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: access',
		)
	})

	it('enforces official declarations through the protected Core policy kernel', async () => {
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			databasePlugin(new StaticReadAdapter([row])),
		))({ schemas: [SecretDocument] })
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(SecretDocument.findMany(undefined)).resolves.toEqual([
				expect.not.objectContaining({ secret: 'hidden' }),
			])
			await expect(
				SecretDocument.findMany({ select: { secret: true } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps virtual read policy separate from persisted adapter projection', async () => {
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			databasePlugin(new StaticReadAdapter([{ id: row.id, title: 'visible' }])),
		))({ schemas: [VirtualDocument] })
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			const result = await VirtualDocument.findMany({
				select: { label: true, title: true },
			})
			expect(result).toEqual([
				expect.objectContaining({ label: 'Label: visible', title: 'visible' }),
			])
			await expect(
				VirtualDocument.findMany({ select: { privateLabel: true } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('bypasses operation and field Access for audited master requests', async () => {
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			databasePlugin(new StaticReadAdapter([row])),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'access-unit-master', value: 'unused-by-terminal' }],
				onUse: () => undefined,
			}),
			schemas: [MasterBypassDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(
				MasterBypassDocument.findMany(undefined),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				MasterBypassDocument.findMany(undefined, {
					useMasterKey: true,
				}),
			).resolves.toEqual([
				expect.objectContaining({ secret: 'hidden', title: 'visible' }),
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('denies without a rule and isolates openings between applications', async () => {
		const allowed = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			databasePlugin(new StaticReadAdapter([plainRow])),
		))({ schemas: [PlainDocument] })
		onTestFinished(() => allowed.dispose())
		const denied = new (UltimaBase.use(
			accessPlugin(),
			databasePlugin(new StaticReadAdapter([plainRow])),
		))({ schemas: [PlainDocument] })
		onTestFinished(() => denied.dispose())

		try {
			await allowed.start()
			await expect(PlainDocument.findMany(undefined)).resolves.toHaveLength(1)
			await allowed.dispose()
			await denied.start()
			await expect(PlainDocument.findMany(undefined)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
		} finally {
			await Promise.all([allowed.dispose(), denied.dispose()])
		}
	})

	it('opens every operation except count', async () => {
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true, count: false } }),
			databasePlugin(new StaticReadAdapter([plainRow])),
		))({
			schemas: [PlainDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(PlainDocument.findMany(undefined)).resolves.toHaveLength(1)
			await expect(PlainDocument.count({})).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('prefers exact schema rules and lets omitted reads use allowWithoutRule', async () => {
		const deniedByDefault = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { count: false } }),
			databasePlugin(new StaticReadAdapter(1)),
		))({
			schemas: [CountOnlyDocument],
		})
		onTestFinished(() => deniedByDefault.dispose())
		const allowedByConfiguredDefault = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			databasePlugin(new StaticReadAdapter([plainRow])),
		))({
			schemas: [CountOnlyDocument],
		})
		onTestFinished(() => allowedByConfiguredDefault.dispose())

		try {
			await deniedByDefault.start()
			await expect(CountOnlyDocument.count({})).resolves.toBe(1)
			await expect(CountOnlyDocument.findMany(undefined)).rejects.toMatchObject(
				{ code: 'PERMISSION_DENIED' },
			)
			await deniedByDefault.dispose()
			await allowedByConfiguredDefault.start()
			await expect(CountOnlyDocument.findMany(undefined)).resolves.toHaveLength(
				1,
			)
		} finally {
			await Promise.all([
				deniedByDefault.dispose(),
				allowedByConfiguredDefault.dispose(),
			])
		}
	})

	it('keeps provider contributions deny-only after schema rules and openings', async () => {
		const peer = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.access.peer',
			peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
			permissions: {
				'runtime:constrain': 'Contributes a deny-only official Access policy.',
			},
			contributions: [
				provideAccessContributions('monotonic-read-policies', () => [
					schemaAccess(CountOnlyDocument, {
						read: { count: false },
					}),
					schemaAccess(PlainDocument, {
						read: { many: true },
					}),
				]),
			],
		})
		const ultimabase = new (UltimaBase.use(
			peer,
			accessPlugin(),
			databasePlugin(new StaticReadAdapter([row])),
		))({
			schemas: [CountOnlyDocument, PlainDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(PlainDocument.findMany(undefined)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			await expect(CountOnlyDocument.count({})).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('owns callback diagnostics without depending on the Hooks plugin', async () => {
		const events: string[] = []
		const observer = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.access.diagnostics',
			permissions: {
				'runtime:observe': 'Observes official Access callback diagnostics.',
			},
			contributions: [
				provideCapability(accessDiagnosticsObserverCapability, {
					contributionId: 'access-diagnostics',
					create: () => ({
						value: (event) => {
							events.push(`${event.status}:${event.identity.phase}`)
						},
					}),
				}),
			],
		})
		const ultimabase = new (UltimaBase.use(
			observer,
			accessPlugin(),
			databasePlugin(new StaticReadAdapter([plainRow])),
		))({
			schemas: [ObservedDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await ObservedDocument.findMany(undefined)
			expect(events).toContain('fulfilled:access-operation')
		} finally {
			await ultimabase.dispose()
		}
	})
})
