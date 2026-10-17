import {
	MasterAuthority,
	Schema,
	UltimaBase,
	getOperationSchema,
	protectedPolicy,
	provideRuntimeConstraint,
} from '@ultimabase/core'
import { holdsSchemaPermission } from '@ultimabase/core/plugin'
import { definePlugin, feature } from '@ultimabase/plugin-kit'
import { describe, expect, it } from 'vitest'

import {
	accessPlugin,
	type AccessPluginOptions,
	type SchemaAccess,
} from '../src/index.js'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

// ADR-0317, decision 7: Access grants plugin permissions without knowing
// their owner; neither package imports the other.
const database = testDatabasePlugin(
	// Every test reads one `findMany`, whose result is an array.
	new ScriptedTestDatabase({ description: 'Empty read adapter', result: [] }),
	{ contributionId: 'database-adapter', id: 'fixture.permissions-database' },
)

/** Declares `readArchived` and records Core's answer on every read. */
const answers: boolean[] = []
const archivePlugin = definePlugin({
	name: '@fixture/archive-permissions',
	features: {
		archivable: feature({ permissions: ['readArchived'] }),
	},
	contributions: [
		provideRuntimeConstraint({
			contributionId: 'archive-visibility',
			create: () => ({
				value: protectedPolicy({
					master: 'enforce',
					operations: ['find-many'],
					evaluate: async ({ context, operation }) => {
						const schema: unknown = getOperationSchema(operation)
						if (
							Schema.is(schema) &&
							schema.className === 'PermissionArchived'
						) {
							answers.push(
								await holdsSchemaPermission(context, schema, 'readArchived'),
							)
						}
						return undefined
					},
				}),
			}),
		}),
	],
})

const App = UltimaBase.use(accessPlugin(), archivePlugin)
const declareArchived = (
	access: SchemaAccess<typeof Archived>,
): typeof Archived =>
	App.Schema.define({
		className: 'PermissionArchived',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	}).with({ access: { read: true, ...access } })
const Archived = App.Schema.define({
	className: 'PermissionArchived',
	fields: (field) => ({ title: field.string() }),
	archivable: true,
}).with({ access: { read: true } })

const readOnce = async (
	schema: typeof Archived,
	options: AccessPluginOptions = {},
	useMasterKey = false,
): Promise<boolean | undefined> => {
	answers.length = 0
	const ultimabase = new (UltimaBase.use(
		accessPlugin(options),
		archivePlugin,
		database,
	))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'permissions-master', value: 'unused' }],
			onUse: () => undefined,
		}),
		schemas: [schema],
	})
	try {
		await ultimabase.start()
		await schema.findMany(undefined, useMasterKey ? { useMasterKey } : {})
		return answers[0]
	} finally {
		await ultimabase.dispose()
	}
}

describe('plugin permissions through Access (ADR-0317)', () => {
	it('refuses a permission without a rule or its own opening', async () => {
		await expect(readOnce(Archived)).resolves.toBe(false)
		// `all`, `read` and `write` never include plugin permissions.
		await expect(
			readOnce(Archived, {
				allowWithoutRule: { all: true, read: true, write: true },
			}),
		).resolves.toBe(false)
	})

	it('grants it by a rule of the same name, which always wins', async () => {
		await expect(
			readOnce(declareArchived({ readArchived: true })),
		).resolves.toBe(true)
		await expect(
			readOnce(declareArchived({ readArchived: () => false }), {
				allowWithoutRule: { readArchived: true },
			}),
		).resolves.toBe(false)
		let calls = 0
		await expect(
			readOnce(
				declareArchived({
					readArchived: function isAuditor({ operation, schema }) {
						calls += 1
						return (
							operation === 'readArchived' && schema === 'PermissionArchived'
						)
					},
				}),
			),
		).resolves.toBe(true)
		expect(calls).toBe(1)
	})

	it('grants it by its own allowWithoutRule key', async () => {
		await expect(
			readOnce(Archived, { allowWithoutRule: { readArchived: true } }),
		).resolves.toBe(true)
		await expect(
			readOnce(Archived, { allowWithoutRule: { readArchived: () => false } }),
		).resolves.toBe(false)
	})

	it('lets Master hold it whatever Access says', async () => {
		await expect(
			readOnce(declareArchived({ readArchived: false }), {}, true),
		).resolves.toBe(true)
	})

	it('rejects a detailed rule for a permission', async () => {
		const Detailed = App.Schema.define({
			className: 'PermissionArchived',
			fields: (field) => ({ title: field.string() }),
			archivable: true,
		}).with({
			access: {
				read: true,
				readArchived: { where: true, item: () => true } as never,
			},
		})
		await expect(readOnce(Detailed)).rejects.toThrow(
			'access.readArchived is a permission: use true, false or a predicate',
		)
	})
})
