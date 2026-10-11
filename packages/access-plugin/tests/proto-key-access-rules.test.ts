import {
	databaseAdapterCapability,
	UltimaBase,
	type SchemaDefinition,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import { PreparedMutationTestAdapter } from '../../../tooling/vitest/prepared-mutation-adapter.js'
import {
	accessPlugin,
	provideAccessContributions,
	schemaAccess,
	type SchemaAccessContributionDefinition,
} from '../src/index.js'

// Regressions for two reference defects (documented in
// docs/rebuild/DIFFERENCES.md). Both concern an own `__proto__` key, which only
// `JSON.parse` or `defineProperty` can produce. The reference copied Access
// declarations with plain assignment, so the inherited `__proto__` setter
// swallowed the key and the rule silently disappeared: Access failed open.
// The rebuild keeps the key as ordinary data, so Core or the Access compiler
// rejects it instead.

/** Adds an own enumerable `__proto__` data key, as `JSON.parse` would. */
const defineOwnProtoKey = (target: object, value: unknown): void => {
	Object.defineProperty(target, '__proto__', {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	})
}

/** Fails loudly if the query reaches storage instead of being rejected first. */
const createUnreachableAdapter = () =>
	new PreparedMutationTestAdapter({
		description: 'Access __proto__ fixture',
		prepare: () => Promise.reject(new TypeError('Unexpected prepared work')),
	})

const createApplication = (
	fixture: string,
	schema: SchemaDefinition,
	contribution: () => SchemaAccessContributionDefinition,
) => {
	const provider = plugin({
		contributions: [provideAccessContributions('proto-policy', contribution)],
		core: '^0.0.0',
		id: `fixture.access-proto-${fixture}-provider`,
		peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
		permissions: { 'runtime:constrain': 'Narrows the fixture policy.' },
		version: '1.0.0',
	})
	const database = plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: createUnreachableAdapter() }),
			}),
		],
		core: '^0.0.0',
		id: `fixture.access-proto-${fixture}-database`,
		version: '1.0.0',
	})
	const ultimabase = new (UltimaBase.use(
		accessPlugin({ default: true }),
		provider,
		database,
	))({ logger: false, schemas: [schema] })
	onTestFinished(() => ultimabase.dispose())
	return ultimabase
}

describe('Access declarations with an own __proto__ key (reference defect regression)', () => {
	it('keeps a static where __proto__ key so Core rejects it instead of dropping the row filter', async () => {
		const Document = UltimaBase.Schema.define({
			className: 'AccessProtoStaticWhereDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const where = {}
		defineOwnProtoKey(where, { title: { eq: 'visible' } })
		const ultimabase = createApplication('where', Document, () =>
			schemaAccess(Document, { read: { allow: true, where } }),
		)
		await ultimabase.start()

		// The reference compiled this rule to an empty restriction and sent an
		// unfiltered read to storage (the adapter rejects any storage access).
		await expect(Document.findMany()).rejects.toThrow(
			'where.__proto__ must reference a schema field',
		)
	})

	it('keeps a custom-mutation branch keyed __proto__ so compilation rejects it', async () => {
		const Document = UltimaBase.Schema.define({
			className: 'AccessProtoMutationBranchDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const access = { read: true }
		defineOwnProtoKey(access, false)
		const ultimabase = createApplication('branch', Document, () =>
			schemaAccess(Document, access),
		)

		// The reference dropped the `__proto__` rule and started normally.
		await expect(ultimabase.start()).rejects.toThrow(
			'Unknown request schema mutation Access branch: access.__proto__',
		)
	})
})
