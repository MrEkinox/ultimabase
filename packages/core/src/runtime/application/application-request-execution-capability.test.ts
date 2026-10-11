import { plugin } from '../../plugins/plugin.js'
import {
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import { describe, expect, it } from 'vitest'

import { CapabilityInventory } from '../../plugins/capability-inventory.js'
import { normalizePlugins } from '../../plugins/normalization.js'
import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from './application-request-execution.js'

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const consumer = plugin({
	core: '^0.0.0',
	id: 'fixture.application-request-consumer',
	version: '0.0.0',
	contributions: [requestExecutionRequirement],
})

describe('application request execution capability ownership', () => {
	it('installs one Core-owned provider only when a plugin consumes it', () => {
		const withoutConsumer = new CapabilityInventory(normalizePlugins([]))
		expect(
			withoutConsumer.entries.some(
				({ token }) => token === applicationRequestExecutionCapability,
			),
		).toBe(false)

		const withConsumer = new CapabilityInventory(normalizePlugins([consumer]))
		const entry = withConsumer.entries.find(
			({ token }) => token === applicationRequestExecutionCapability,
		)
		expect(entry).toMatchObject({
			providers: [
				{
					contributionId: 'application-request-executor',
					owner: { pluginId: '@ultimabase/core' },
				},
			],
			requirements: [
				{
					active: true,
					owner: { pluginId: 'fixture.application-request-consumer' },
				},
			],
		})
		expect(applicationRequestExecutionCapability).toMatchObject({
			capabilityId: 'ultimabase.application-request-execution',
			cardinality: 'single',
			lifetime: 'application',
			version: '1.0.0',
		})
	})

	it('cannot be provided by plugins', () => {
		const fakeExecutor = {} as ApplicationRequestExecutor
		const declarations = [
			provideCapability(applicationRequestExecutionCapability, {
				contributionId: 'forged-provider',
				create: () => ({ value: fakeExecutor }),
			}),
		] as const

		for (const declaration of declarations) {
			expect(
				() =>
					new FrameworkApplication({
						schemas: [],
						plugins: [
							plugin({
								core: '^0.0.0',
								id: `fixture.${declaration.contributionId}`,
								version: '0.0.0',
								contributions: [declaration, requestExecutionRequirement],
							}),
						],
					}),
			).toThrow(/Application request execution/u)
		}
	})
})
