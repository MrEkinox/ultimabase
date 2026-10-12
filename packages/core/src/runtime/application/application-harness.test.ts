import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { provideCapability } from '../../plugins/capabilities.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { MemoryPrivateAdapter } from '../../private-storage/runtime.test-support.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import {
	databaseResetCapability,
	databaseResetCapabilityVersion,
} from '../database/adapter-capabilities.js'
import { databaseAdapterCapability } from '../database/contracts.js'
import { openApplicationHarness } from './application-harness.js'
import { UltimaBase } from './ultima-base.js'

const HarnessRecord = UltimaBase.Schema.define({
	className: 'HarnessRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const createApplication = (reset?: () => Promise<void>) => {
	const logger = {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	}
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.harness-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new MemoryPrivateAdapter() }),
			}),
			...(reset === undefined
				? []
				: [
						provideCapability(databaseResetCapability, {
							contributionId: 'reset',
							create: () => ({
								value: {
									kind: 'reset' as const,
									version: databaseResetCapabilityVersion,
									reset,
								},
							}),
						}),
					]),
		],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database))({
			logger,
			logLevel: 'debug',
			schemas: [HarnessRecord],
		}),
	)
	return { logger, ultimabase }
}

describe('application harness (ADR-0327)', () => {
	it('opens only before start and only once', async () => {
		const { ultimabase } = createApplication()
		openApplicationHarness(ultimabase)
		expect(() => openApplicationHarness(ultimabase)).toThrow(
			'This application already has a harness',
		)
		const started = createApplication().ultimabase
		await started.start()
		expect(() => openApplicationHarness(started)).toThrow(
			'An application harness must be opened before the application starts; received started',
		)
		await started.dispose()
	})

	it('elevates to Master without a key and audits each elevation', async () => {
		const { logger, ultimabase } = createApplication()
		const harness = openApplicationHarness(ultimabase)
		await expect(
			harness.master({ requestId: 'early', source: 'test' }),
		).rejects.toThrow('UltimaBase must be started before request execution')
		await ultimabase.start()
		const engine = await harness.master({ requestId: 'r1', source: 'test' })
		expect(engine.context.access.mode).toBe('master')
		expect(
			await runWithRequestEngine(engine, () =>
				HarnessRecord.createOne({ data: { title: 'master' } }),
			),
		).toMatchObject({ title: 'master' })
		expect(logger.debug).toHaveBeenCalledWith(
			'Harness elevated to Master',
			immutableRecord({
				reason: 'Application harness (test)',
				requestId: 'r1',
			}),
		)
		// Outside the harness, application code still needs an authority.
		await expect(
			HarnessRecord.count({}, { useMasterKey: true }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await ultimabase.dispose()
	})

	it('resets through the database reset capability', async () => {
		const reset = vi.fn(() => Promise.resolve())
		const { ultimabase } = createApplication(reset)
		const harness = openApplicationHarness(ultimabase)
		await ultimabase.start()
		await harness.resetDatabase()
		expect(reset).toHaveBeenCalledOnce()
		await ultimabase.dispose()

		const without = createApplication().ultimabase
		const plain = openApplicationHarness(without)
		await without.start()
		await expect(plain.resetDatabase()).rejects.toThrow(
			'The database plugin of this application provides no data reset (ultimabase.database-reset)',
		)
		await without.dispose()
	})
})
