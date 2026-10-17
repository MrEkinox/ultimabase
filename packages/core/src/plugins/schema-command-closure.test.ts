import { describe, expect, it, onTestFinished } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { MasterAuthority } from '../runtime/master/master-authority.js'
import { readSchemaCommandClosure } from '../index.js'
import {
	closeSchemaCommand,
	contributeDeclarations,
	plugin as createPlugin,
} from '../plugin.js'
import { MemoryPrivateAdapter } from '../private-storage/runtime.test-support.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { databaseAdapterCapability } from '../runtime/database/contracts.js'
import { provideCapability } from './capabilities.js'
import { contributeOperation } from './plugin-command-contributions.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'

// ADR-0341 decision 3: a plugin closes a generic command of a schema it
// contributes to; Core refuses it to every caller but that plugin.
const reason = 'Ledger entries are created by the ledger plugin.'
const Entry = UltimaBase.Schema.define({
	className: 'ClosedLedgerEntry',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const title = defineOperationValue((value) => {
	if (typeof value !== 'string') throw new TypeError('title must be a string')
	return value
})
const record = defineOperation({
	input: title,
	name: 'fixture.closure.record',
	result: title,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const ledgerPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.closure',
	permissions: { 'schema:declare': 'Closes ledger entry creation.' },
	version: '1.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ schemas }) => {
				schemas.patch({
					operations: [
						closeSchemaCommand({
							command: 'create',
							contributionId: 'entry-creation',
							reason,
						}),
					],
					targets: schemas.select({ className: Entry.className }),
				})
				return undefined
			},
		}),
		// The closing plugin's own path still creates.
		contributeOperation({
			execute: async ({ input }) => {
				await Entry.createOne({ data: { title: input }, select: { id: true } })
				return input
			},
			operation: record,
		}),
	],
})

const database = createPlugin({
	core: '^0.0.0',
	id: 'fixture.closure-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new MemoryPrivateAdapter() }),
		}),
	],
})

const start = async () => {
	const ultimabase = new (UltimaBase.use(database, ledgerPlugin))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'closure', value: 'closure-master-key' }],
			onUse: () => undefined,
		}),
		schemas: [Entry],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	return ultimabase
}

const closed = {
	code: 'VALIDATION_ERROR',
	publicDetails: {
		issues: [{ code: 'command.closed', message: reason, path: [] }],
	},
}

describe('closed schema commands (ADR-0341)', () => {
	it('records the closure on the compiled schema', async () => {
		await start()
		for (const method of [
			'createOne',
			'createMany',
			'upsertOne',
			'upsertMany',
		] as const) {
			expect(readSchemaCommandClosure(Entry, method)).toEqual({
				owner: {
					kind: 'plugin',
					pluginId: 'fixture.closure',
					version: '1.0.0',
				},
				reason,
			})
		}
		for (const method of ['findMany', 'updateOne', 'deleteMany'] as const) {
			expect(readSchemaCommandClosure(Entry, method)).toBeUndefined()
		}
	})

	it('refuses every command that may create, Master included', async () => {
		const ultimabase = await start()
		const master = { useMasterKey: true } as const
		const attempts = [
			() => Entry.createOne({ data: { title: 'direct' } }),
			() => Entry.createOne({ data: { title: 'master' } }, master),
			() => Entry.createMany({ data: [{ title: 'many' }] }, master),
			() =>
				Entry.upsertOne(
					{
						create: { title: 'upsert' },
						update: { title: 'upsert' },
						where: { id: '0199325a-0c00-7000-8000-000000000341' },
					},
					master,
				),
		]
		for (const attempt of attempts) {
			await expect(attempt()).rejects.toMatchObject(closed)
		}
		await expect(
			ultimabase.can({ operation: 'create', schema: Entry }),
		).resolves.toBe(false)
		expect(await Entry.count({}, master)).toBe(0)
	})

	it('keeps the closing plugin and other commands working', async () => {
		const ultimabase = await start()
		await expect(
			ultimabase.operation(record).execute('from the plugin'),
		).resolves.toBe('from the plugin')
		const [entry] = await Entry.findMany()
		if (entry === undefined) throw new TypeError('The entry was not created')
		await expect(
			Entry.updateOne({
				data: { title: 'renamed' },
				select: { title: true },
				where: { id: entry.id },
			}),
		).resolves.toEqual({ title: 'renamed' })
		await expect(
			ultimabase.can({ operation: 'update', schema: Entry }),
		).resolves.toBe(true)
	})

	it('validates the declaration', async () => {
		expect(() =>
			closeSchemaCommand({
				command: 'update' as never,
				contributionId: 'entry-update',
				reason,
			}),
		).toThrow("Schema command closure command must be 'create'")
		expect(() =>
			closeSchemaCommand({
				command: 'create',
				contributionId: 'x',
				reason: '',
			}),
		).toThrow('Schema command closure reason must be a non-empty string')
		const second = createPlugin({
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.closure', version: '^1.0.0' }],
			id: 'fixture.closure-second',
			permissions: { 'schema:declare': 'Closes creation again.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.patch({
							operations: [
								closeSchemaCommand({
									command: 'create',
									contributionId: 'again',
									reason,
								}),
							],
							targets: schemas.select({ className: Entry.className }),
						})
						return undefined
					},
				}),
			],
		})
		await expect(
			createApplication({ plugins: [ledgerPlugin, second], schemas: [Entry] }),
		).rejects.toThrow(
			'Duplicate schema command closure: ClosedLedgerEntry.create',
		)
	})
})
