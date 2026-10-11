import { describe, expect, it, onTestFinished } from 'vitest'

import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	protectedPolicy,
	provideRuntimeConstraint,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type SchemaDefinition,
} from '../../index.js'
import {
	holdsSchemaPermission,
	plugin,
	provideCapability,
	provideSchemaPermissions,
} from '../../plugin.js'
import type { PluginDefinition } from '../../plugins/definition.js'

class EmptyReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = { persistencePlans: databasePersistencePlanCapability }

	readonly #rows: unknown = []

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		// Every test reads one `findMany`, whose result is an array.
		return Promise.resolve(this.#rows as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Empty read adapter does not execute mutations')
	}
}

const databasePlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.permissions.database',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database-adapter',
			create: () => ({ value: new EmptyReadAdapter() }),
		}),
	],
})

const Archive = UltimaBase.Schema.define({
	className: 'PermissionArchive',
	fields: (field) => ({ title: field.string() }),
})
const Other = UltimaBase.Schema.define({
	className: 'PermissionOther',
	fields: (field) => ({ title: field.string() }),
})
const Foreign = UltimaBase.Schema.define({
	className: 'PermissionForeign',
	fields: (field) => ({ title: field.string() }),
})

/** Declares `readArchived` on Archive and records what Core answers on reads. */
const declaringPlugin = (
	answers: boolean[],
	permission = 'readArchived',
	declared: (schemas: readonly SchemaDefinition[]) => readonly unknown[] = (
		schemas,
	) =>
		schemas
			.filter(({ className }) => className === 'PermissionArchive')
			.map((schema) => ({ permission: 'readArchived', schema })),
) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.permissions.declaring',
		contributions: [
			provideSchemaPermissions({
				contributionId: 'permissions',
				create: ({ schemas }) => ({
					// Invalid declarations are part of what this fixture tests.
					value: declared(schemas.values()) as never,
				}),
			}),
			provideRuntimeConstraint({
				contributionId: 'reader',
				create: ({ schemas }) => ({
					value: protectedPolicy({
						master: 'enforce',
						operations: ['find-many'],
						evaluate: async ({ context }) => {
							const schema = schemas.get('PermissionArchive')
							if (schema === undefined) throw new TypeError('missing')
							answers.push(
								await holdsSchemaPermission(context, schema, permission),
							)
							return undefined
						},
					}),
				}),
			}),
		],
	})

const answeringPlugin = (
	id: string,
	answer: boolean | undefined,
	schema?: SchemaDefinition,
) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id,
		contributions: [
			provideRuntimeConstraint({
				contributionId: 'answers',
				create: () => ({
					value: protectedPolicy({
						...(schema === undefined ? {} : { schema }),
						permission: ({ permission }) =>
							permission === 'readArchived' ? answer : undefined,
					}),
				}),
			}),
		],
	})

const readArchive = async (
	plugins: readonly PluginDefinition[],
	options: { readonly useMasterKey?: true } = {},
): Promise<readonly boolean[]> => {
	const answers: boolean[] = []
	const application = new (UltimaBase.use(
		declaringPlugin(answers),
		...plugins,
		databasePlugin,
	))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'permissions-master', value: 'unused-by-terminal' }],
			onUse: () => undefined,
		}),
		schemas: [Archive, Other],
	})
	try {
		await application.start()
		await Archive.findMany(undefined, options)
		return answers
	} finally {
		await application.dispose()
	}
}

describe('schema permissions (ADR-0317)', () => {
	it('refuses a permission no installed policy answers (fail-closed)', async () => {
		await expect(readArchive([])).resolves.toEqual([false])
		await expect(
			readArchive([answeringPlugin('fixture.silent', undefined)]),
		).resolves.toEqual([false])
	})

	it('holds a permission one policy grants and none refuses', async () => {
		await expect(
			readArchive([answeringPlugin('fixture.grant', true)]),
		).resolves.toEqual([true])
		await expect(
			readArchive([
				answeringPlugin('fixture.grant', true),
				answeringPlugin('fixture.refuse', false),
			]),
		).resolves.toEqual([false])
		await expect(
			readArchive([
				answeringPlugin('fixture.grant', true),
				answeringPlugin('fixture.other-schema', false, Other),
			]),
		).resolves.toEqual([true])
	})

	it('lets Master hold every declared permission without asking policies', async () => {
		await expect(
			readArchive([answeringPlugin('fixture.refuse', false)], {
				useMasterKey: true,
			}),
		).resolves.toEqual([true])
	})

	it('rejects a question about an undeclared permission', async () => {
		const application = new (UltimaBase.use(
			declaringPlugin([], 'readEverything'),
			databasePlugin,
		))({ logger: false, schemas: [Archive, Other] })
		onTestFinished(() => application.dispose())
		await application.start()
		await expect(Archive.findMany(undefined)).rejects.toThrow(
			'Permission readEverything is not declared for PermissionArchive',
		)
	})

	it('validates declarations when the application starts', async () => {
		for (const [declared, message] of [
			[
				(schemas: readonly SchemaDefinition[]) =>
					schemas.map((schema) => ({ permission: 'read deleted', schema })),
				'schema permission must name an identifier and a schema',
			],
			[
				() => [{ permission: 'readArchived', schema: Foreign }],
				'Permission readArchived targets a schema outside its application',
			],
			[
				(schemas: readonly SchemaDefinition[]) => {
					const [schema] = schemas
					return [
						{ permission: 'readArchived', schema },
						{ permission: 'readArchived', schema },
					]
				},
				'Permission readArchived is declared twice for PermissionArchive',
			],
		] as const) {
			const application = new (UltimaBase.use(
				declaringPlugin([], 'readArchived', declared),
				databasePlugin,
			))({ logger: false, schemas: [Archive, Other] })
			await expect(application.start()).rejects.toThrow(message)
			await application.dispose()
		}
	})
})
