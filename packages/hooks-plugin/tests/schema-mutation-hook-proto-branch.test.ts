import {
	databaseAdapterCapability,
	plugin,
	provideCapability,
	UltimaBase,
} from '@ultimabase/core'
import { describe, expect, it, onTestFinished } from 'vitest'

import { PreparedMutationTestAdapter } from '../../../tooling/vitest/prepared-mutation-adapter.js'
import {
	hooksPlugin,
	provideHookContributions,
	schemaHooks,
} from '../src/index.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference accumulated custom schema-mutation Hook branches in a plain
// object (`mutations[branch] ?? {}` then `mutation[group] = value`). A branch
// literally keyed `__proto__` (only reachable through `JSON.parse` or
// `defineProperty`) passes the identifier check, so `mutations.__proto__`
// resolved to `Object.prototype`: the handler was written onto
// `Object.prototype.beforeOperation` (prototype pollution) and the declaration
// was silently dropped. The rebuild keeps `__proto__` as an ordinary command
// name, which startup rejects like any other unknown schema mutation branch.

const pollutedKeys = ['afterOperation', 'beforeOperation'] as const

/** Removes any pollution so a failing run cannot leak into later tests. */
const restoreObjectPrototype = (): void => {
	for (const key of pollutedKeys) {
		if (Object.hasOwn(Object.prototype, key)) {
			Reflect.deleteProperty(Object.prototype, key)
		}
	}
}

describe('schema mutation Hook branch keyed __proto__ (reference defect regression)', () => {
	it('rejects the branch at startup without writing to Object.prototype', async () => {
		onTestFinished(restoreObjectPrototype)
		const handler = (): undefined => undefined
		// A native branch keeps the declaration non-empty, so the reference
		// started normally with the `__proto__` branch silently dropped.
		const beforeOperation = { create: handler }
		// Object literals cannot declare an own `__proto__` data key; this is the
		// shape `JSON.parse('{"__proto__": ...}')` produces.
		Object.defineProperty(beforeOperation, '__proto__', {
			configurable: true,
			enumerable: true,
			value: handler,
			writable: true,
		})
		const Document = UltimaBase.Schema.define({
			className: 'SchemaMutationHookProtoBranchDocument',
			fields: (field) => ({ title: field.string() }),
		})
		// A compatible provider plugin hands the branch map to Hooks verbatim.
		const provider = plugin({
			contributions: [
				provideHookContributions('proto-branch', () =>
					schemaHooks(Document, { beforeOperation }),
				),
			],
			core: '^0.0.0',
			id: 'fixture.schema-mutation-hook-proto-provider',
			peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
			permissions: { 'runtime:intercept': 'Observes Document mutations.' },
			version: '1.0.0',
		})
		const database = plugin({
			contributions: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({
						value: new PreparedMutationTestAdapter({
							description: 'Hook __proto__ branch fixture',
							prepare: () =>
								Promise.reject(new TypeError('Unexpected prepared work')),
						}),
					}),
				}),
			],
			core: '^0.0.0',
			id: 'fixture.schema-mutation-hook-proto-database',
			version: '1.0.0',
		})
		const ultimabase = new (UltimaBase.use(hooksPlugin(), provider, database))({
			logger: false,
			schemas: [Document],
		})
		onTestFinished(() => ultimabase.dispose())

		// The provider factory, and so declaration normalization, runs at startup.
		const failure = await ultimabase.start().then(
			() => undefined,
			(error: unknown) => error,
		)

		for (const key of pollutedKeys) {
			expect(Object.hasOwn(Object.prototype, key), key).toBe(false)
		}
		expect(failure).toBeInstanceOf(Error)
		expect(failure).toHaveProperty(
			'message',
			expect.stringContaining(
				'Unknown schema mutation Hook branch: SchemaMutationHookProtoBranchDocument.hooks.beforeOperation.__proto__',
			),
		)
	})
})
