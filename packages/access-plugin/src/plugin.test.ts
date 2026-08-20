import {
	FrameworkApplication,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineFieldExtension,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	accessPlugin,
	accessDiagnosticsObserverCapability,
	fieldExtensionAccess,
	provideAccessContributions,
	schemaAccess,
	type FieldAccessOption,
	type SchemaAccessOption,
} from './index.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedFieldOptions {
		readonly access?: FieldAccessOption<this>
	}

	interface UltimaBaseGeneratedSchemaOptions {
		readonly access?: SchemaAccessOption<this>
	}
}

class StaticReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
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
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.access.database',
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({ value: adapter }),
				}),
			],
		},
	})

const SecretDocument = Schema.define({
	className: 'AccessPluginSecretDocument',
	fields: (field) => ({
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
	access: { read: true },
})

const PlainDocument = Schema.define({
	className: 'AccessPluginPlainDocument',
	fields: (field) => ({ title: field.string() }),
})

const ObservedDocument = Schema.define({
	className: 'AccessPluginObservedDocument',
	fields: (field) => ({ title: field.string() }),
	access: { read: () => true },
})

const privateField = defineFieldExtension(
	'private-field',
	{},
	'fixture.access.extension-provider',
)
const ExtendedDocument = Schema.define({
	className: 'AccessPluginExtendedDocument',
	fields: (field) => ({
		secret: field.string({ extensions: [privateField] }),
		title: field.string(),
	}),
})

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
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [SecretDocument],
		})

		await expect(application.initialize()).rejects.toThrow(
			'Unknown schema option: access',
		)
	})

	it('enforces official declarations through the protected Core policy kernel', async () => {
		const ultimabase = new UltimaBase({
			plugins: [accessPlugin(), databasePlugin(new StaticReadAdapter([row]))],
			schemas: [SecretDocument],
		})

		try {
			await ultimabase.start()
			await expect(
				SecretDocument.findMany(undefined, { ultimabase }),
			).resolves.toEqual([expect.not.objectContaining({ secret: 'hidden' })])
			await expect(
				SecretDocument.findMany({ select: { secret: true } }, { ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('isolates defaults between applications that share one schema', async () => {
		const allowed = new UltimaBase({
			plugins: [
				accessPlugin({ default: true }),
				databasePlugin(new StaticReadAdapter([plainRow])),
			],
			schemas: [PlainDocument],
		})
		const denied = new UltimaBase({
			plugins: [
				accessPlugin({ default: false }),
				databasePlugin(new StaticReadAdapter([plainRow])),
			],
			schemas: [PlainDocument],
		})

		try {
			await Promise.all([allowed.start(), denied.start()])
			await expect(
				PlainDocument.findMany(undefined, { ultimabase: allowed }),
			).resolves.toHaveLength(1)
			await expect(
				PlainDocument.findMany(undefined, { ultimabase: denied }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await Promise.all([allowed.dispose(), denied.dispose()])
		}
	})

	it('consumes official-compatible peer contributions without setup ordering', async () => {
		const peer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.access.peer',
			peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Contributes a deny-only official Access policy.',
				},
			],
			capabilities: {
				provides: [
					provideAccessContributions('deny-plain-reads', () =>
						schemaAccess(PlainDocument, { read: false }),
					),
				],
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [
				peer,
				accessPlugin(),
				databasePlugin(new StaticReadAdapter([row])),
			],
			schemas: [PlainDocument],
		})

		try {
			await ultimabase.start()
			await expect(
				PlainDocument.findMany(undefined, { ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('owns callback diagnostics without depending on the Hooks plugin', async () => {
		const events: string[] = []
		const observer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.access.diagnostics',
			privileges: [
				{
					name: 'runtime:observe',
					reason: 'Observes official Access callback diagnostics.',
				},
			],
			capabilities: {
				provides: [
					provideCapability(accessDiagnosticsObserverCapability, {
						contributionId: 'access-diagnostics',
						create: () => ({
							value: (event) => {
								events.push(`${event.status}:${event.identity.phase}`)
							},
						}),
					}),
				],
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [
				observer,
				accessPlugin(),
				databasePlugin(new StaticReadAdapter([plainRow])),
			],
			schemas: [ObservedDocument],
		})

		try {
			await ultimabase.start()
			await ObservedDocument.findMany(undefined, { ultimabase })
			expect(events).toContain('fulfilled:access-operation')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('expands owner-checked extension targets through one provider helper', async () => {
		const provider = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.access.extension-provider',
			peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Protects fields carrying this plugin extension.',
				},
			],
			capabilities: {
				provides: [
					provideAccessContributions('private-fields', () =>
						fieldExtensionAccess(privateField, () => ({ read: false })),
					),
				],
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [
				accessPlugin(),
				provider,
				databasePlugin(new StaticReadAdapter([row])),
			],
			schemas: [ExtendedDocument],
		})

		try {
			await ultimabase.start()
			await expect(
				ExtendedDocument.findMany(undefined, { ultimabase }),
			).resolves.toEqual([expect.not.objectContaining({ secret: 'hidden' })])
		} finally {
			await ultimabase.dispose()
		}
	})
})
