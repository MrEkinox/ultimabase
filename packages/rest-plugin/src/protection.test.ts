import { onTestFinished, afterEach, describe, expect, it, vi } from 'vitest'
import {
	UltimaBase,
	databaseAdapterCapability,
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

describe('REST public protection reporting', () => {
	it('uses the shared Core diagnostic exactly once for an enabled surface', async () => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const Application = UltimaBase.use(restPlugin()).use(databasePlugin)
		const ultimabase = new Application({
			schemas: [PublicSchema],
		})
		onTestFinished(() => ultimabase.dispose())

		await ultimabase.start()
		// ADR-0313: the missing HTTP plugin is a REST line; protection is Core's.
		expect(warning).toHaveBeenCalledTimes(2)
		expect(warning.mock.calls[0]?.[0]).toBe(noHttpLine)
		expect(warning.mock.calls[1]?.[1]).toMatchObject({
			code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
			transport: { name: 'ultimabase.rest', version: '1.0.0' },
		})
		await ultimabase.dispose()
	})

	it('honors only the exact application acknowledgement and skips empty graphs', async () => {
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const Acknowledged = UltimaBase.use(
			restPlugin({ acknowledgeUnverifiedProtection: true }),
		).use(databasePlugin)
		const acknowledged = new Acknowledged({
			schemas: [PublicSchema],
		})
		onTestFinished(() => acknowledged.dispose())
		const Disabled = UltimaBase.use(restPlugin({ default: false })).use(
			databasePlugin,
		)
		const disabled = new Disabled({
			schemas: [PublicSchema],
		})
		onTestFinished(() => disabled.dispose())

		await acknowledged.start()
		await acknowledged.dispose()
		await disabled.start()
		expect(warning.mock.calls.map((call): unknown => call[0])).toStrictEqual([
			noHttpLine,
			'[@ultimabase/rest-plugin] REST exposes no schema or operation: register application schemas in new App({ schemas }) or pass restPlugin({ operations }).',
		])
		await disabled.dispose()
	})
})
