import {
	UltimaBase,
	databaseAdapterCapability,
	dateTimeField,
	isAuthenticated,
	type PolicyPredicate,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreparedMutationTestAdapter } from '../../../tooling/vitest/prepared-mutation-adapter.js'
import { accessPlugin, type AllowWithoutRule } from '../src/index.js'

// ADR-0317, decision 2: openings for operations that have no schema rule.
const archivePlugin = definePlugin({
	name: '@fixture/openings-archive',
	features: {
		archivable: feature({
			fields: { archivedAt: dateTimeField() },
			commands: {
				archiveOne: command({
					authority: 'request',
					effect: 'update',
					data: () => ({ archivedAt: '2026-10-18T00:00:00.000Z' }),
				}),
			},
		}),
	},
})
const database = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database-adapter',
			create: () => ({
				value: new PreparedMutationTestAdapter({
					description: 'Openings fixture',
					prepare: () => Promise.reject(new TypeError('Unexpected storage')),
				}),
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.openings-database',
	version: '1.0.0',
})

const App = UltimaBase.use(accessPlugin(), archivePlugin)
const Member = App.Schema.define({
	className: 'OpeningMember',
	fields: (field) => ({ name: field.string() }),
}).with({ access: { read: true } })
const Document = App.Schema.define({
	className: 'OpeningDocument',
	fields: (field) => ({ title: field.string() }),
	archivable: true,
})
const Ruled = App.Schema.define({
	className: 'OpeningRuled',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { update: false } })

const operations = [
	'findOne',
	'findMany',
	'count',
	'exists',
	'create',
	'update',
	'upsert',
	'delete',
	'archive',
] as const

const start = async (allowWithoutRule: AllowWithoutRule) => {
	const logger = createCapturingLogger()
	const ultimabase = new (UltimaBase.use(
		accessPlugin({ allowWithoutRule }),
		archivePlugin,
		database,
	))({ logger, logLevel: 'debug', schemas: [Member, Document, Ruled] })
	await ultimabase.start()
	return { logger, ultimabase }
}

/** Lists the operations `can()` allows on Document for one caller. */
const opened = async (
	allowWithoutRule: AllowWithoutRule,
	principal?: ReturnType<typeof Member.pointer>,
): Promise<readonly string[]> => {
	const { ultimabase } = await start(allowWithoutRule)
	try {
		const allowed: string[] = []
		for (const operation of operations) {
			if (await ultimabase.can({ operation, principal, schema: Document })) {
				allowed.push(operation)
			}
		}
		return allowed
	} finally {
		await ultimabase.dispose()
	}
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('allowWithoutRule (ADR-0317)', () => {
	it('denies every operation without a rule unless opened', async () => {
		await expect(opened({})).resolves.toEqual([])
		await expect(opened({ all: false })).resolves.toEqual([])
	})

	it('opens all, a group or one operation, the most specific key winning', async () => {
		await expect(opened({ all: true })).resolves.toEqual(operations)
		await expect(opened({ all: true, write: false })).resolves.toEqual([
			'findOne',
			'findMany',
			'count',
			'exists',
		])
		await expect(opened({ read: true, count: false })).resolves.toEqual([
			'findOne',
			'findMany',
			'exists',
		])
		await expect(
			opened({ all: false, write: true, delete: false }),
		).resolves.toEqual(['create', 'update', 'upsert', 'archive'])
		await expect(opened({ archive: true })).resolves.toEqual(['archive'])
		await expect(opened({ findMany: true })).resolves.toEqual(['findMany'])
		await expect(opened({ read: true, findMany: false })).resolves.toEqual([
			'findOne',
			'count',
			'exists',
		])
		await expect(opened({ write: true, archive: false })).resolves.toEqual([
			'create',
			'update',
			'upsert',
			'delete',
		])
	})

	it('never lets an opening override a schema rule', async () => {
		const { ultimabase } = await start({ all: true })
		try {
			await expect(
				ultimabase.can({ operation: 'update', schema: Ruled }),
			).resolves.toBe(false)
			await expect(
				ultimabase.can({ operation: 'create', schema: Ruled }),
			).resolves.toBe(true)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('opens with a predicate that receives the policy context', async () => {
		const seen: string[] = []
		const isNamed: PolicyPredicate = function isNamed({
			operation,
			principal,
			schema,
		}) {
			seen.push(`${schema}:${operation}`)
			return principal !== undefined
		}
		await expect(opened({ write: isAuthenticated })).resolves.toEqual([])
		await expect(
			opened({ write: isAuthenticated }, Member.pointer('member-1')),
		).resolves.toEqual(['create', 'update', 'upsert', 'delete', 'archive'])
		await expect(
			opened({ read: isNamed }, Member.pointer('member-1')),
		).resolves.toEqual(['findOne', 'findMany', 'count', 'exists'])
		expect(seen).toEqual([
			'OpeningDocument:one',
			'OpeningDocument:many',
			'OpeningDocument:count',
			'OpeningDocument:exists',
		])
	})

	it("opens 'development' outside production and refuses to start in production", async () => {
		vi.stubEnv('NODE_ENV', 'development')
		await expect(opened({ all: 'development' })).resolves.toEqual(operations)

		vi.stubEnv('NODE_ENV', 'production')
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { read: 'development', create: true } }),
			archivePlugin,
			database,
		))({ logger: false, schemas: [Member, Document, Ruled] })
		try {
			await expect(ultimabase.start()).rejects.toThrow(
				"Access allowWithoutRule opens read (find, count, exists) with 'development', which production refuses (NODE_ENV is production).",
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('logs one warn line per opening, production included', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const { logger, ultimabase } = await start({
			all: true,
			count: false,
			write: isAuthenticated,
		})
		await ultimabase.dispose()
		expect(logger.messages('warn')).toEqual([
			'[@ultimabase/access-plugin] allowWithoutRule.all opens every operation and request plugin command on schemas without a rule, for every caller, production included.',
			'[@ultimabase/access-plugin] allowWithoutRule.write opens write (create, update, upsert, delete and request plugin commands) on schemas without a rule, when predicate isAuthenticated allows.',
		])
	})

	it('rejects unknown keys and values', async () => {
		// A write rule never depends on cardinality (ADR-0347).
		expect(() =>
			accessPlugin({ allowWithoutRule: { createMany: true } as never }),
		).toThrow(
			'Access allowWithoutRule.createMany names a write method: use its operation create',
		)
		expect(() =>
			accessPlugin({ allowWithoutRule: { read: 'production' } as never }),
		).toThrow(
			"Access allowWithoutRule.read must be true, false, 'development' or a predicate",
		)
		expect(() => accessPlugin({ default: true } as never)).toThrow(
			'Unknown Access plugin option: default (replaced by allowWithoutRule)',
		)
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { archiveAll: true } }),
			archivePlugin,
			database,
		))({ logger: false, schemas: [Member, Document, Ruled] })
		try {
			await expect(ultimabase.start()).rejects.toThrow(
				'Unknown Access allowWithoutRule key: archiveAll is neither an operation, a request plugin command nor a plugin permission',
			)
		} finally {
			await ultimabase.dispose()
		}
		for (const [key, message] of [
			[
				'archiveOne',
				'Access allowWithoutRule.archiveOne names a write method: use its operation archive',
			],
			[
				'one',
				'Unknown Access allowWithoutRule key: one is neither an operation, a request plugin command nor a plugin permission',
			],
		] as const) {
			const application = new (UltimaBase.use(
				accessPlugin({ allowWithoutRule: { [key]: true } }),
				archivePlugin,
				database,
			))({ logger: false, schemas: [Member, Document, Ruled] })
			try {
				await expect(application.start()).rejects.toThrow(message)
			} finally {
				await application.dispose()
			}
		}
	})
})
