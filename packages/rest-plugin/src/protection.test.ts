import { onTestFinished, afterEach, describe, expect, it, vi } from 'vitest'
import {
	UltimaBase,
	databaseAdapterCapability,
	protectedPolicy,
	provideRuntimeConstraint,
	type DatabaseAdapter,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'

import { restPlugin } from './plugin.js'

const unavailableAdapter: DatabaseAdapter = {
	kind: 'database-adapter',
	checkHealth: (): Promise<void> => Promise.resolve(),
	beginTransaction: () => {
		throw new TypeError('Protection diagnostics do not open transactions')
	},
	execute: () => {
		throw new TypeError('Protection diagnostics do not execute operations')
	},
}

const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.rest-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: unavailableAdapter }),
		}),
	],
})

const PublicSchema = UltimaBase.Schema.define({
	className: 'PublicProtectionDocument',
	fields: () => ({}),
})

const noHttpLine =
	'[@ultimabase/rest-plugin] REST has routes but no HTTP plugin to serve them: install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).'

afterEach(() => {
	vi.restoreAllMocks()
})

const policyPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.rest-policy',
	permissions: { 'runtime:constrain': 'Installs a protected policy.' },
	version: '1.0.0',
	contributions: [
		provideRuntimeConstraint({
			contributionId: 'policy',
			create: () => ({
				value: protectedPolicy({ evaluate: () => undefined }),
			}),
		}),
	],
})

const writesRefusal =
	/REST exposes writes \(POST \/api\/classes\/PublicProtectionDocument, PATCH \/api\/classes\/PublicProtectionDocument\/\{id\}, DELETE \/api\/classes\/PublicProtectionDocument\/\{id\}\) but no protected policy plugin is installed: install one, such as accessPlugin\(\), or pass restPlugin\(\{ publicWrites: true \}\) to let every client write\./u

// ADR-0294: public writes are an explicit choice; Core's unverified-protection
// warning is gone for REST.
describe('REST public writes', () => {
	it('refuses to start when it exposes writes without a protected policy', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		const Application = UltimaBase.use(restPlugin()).use(databasePlugin)
		const ultimabase = new Application({ schemas: [PublicSchema] })
		onTestFinished(() => ultimabase.dispose())

		await expect(ultimabase.start()).rejects.toThrow(writesRefusal)
	})

	it.each([
		['publicWrites: true', restPlugin({ publicWrites: true }), []],
		['a protected policy', restPlugin(), [policyPlugin]],
		[
			'read-only routes',
			restPlugin({
				default: { createOne: false, deleteOne: false, updateOne: false },
			}),
			[],
		],
	] as const)('starts with %s and no protection warning', async (_, rest, policies) => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const Application = UltimaBase.use(rest, databasePlugin, ...policies)
		const ultimabase = new Application({ schemas: [PublicSchema] })
		onTestFinished(() => ultimabase.dispose())

		await ultimabase.start()
		// ADR-0313: the missing HTTP plugin is the only line.
		expect(warning.mock.calls.map((call): unknown => call[0])).toStrictEqual([
			noHttpLine,
		])
		await ultimabase.dispose()
	})

	it('skips empty graphs with one line', async () => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const Disabled = UltimaBase.use(restPlugin({ default: false })).use(
			databasePlugin,
		)
		const disabled = new Disabled({ schemas: [PublicSchema] })
		onTestFinished(() => disabled.dispose())

		await disabled.start()
		expect(warning.mock.calls.map((call): unknown => call[0])).toStrictEqual([
			'[@ultimabase/rest-plugin] REST exposes no schema or operation: register application schemas in new App({ schemas }), or install a plugin or defineOperation() that declares public operations.',
		])
		await disabled.dispose()
	})
})
