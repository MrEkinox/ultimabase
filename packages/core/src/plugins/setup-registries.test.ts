import { SchemaRegistry } from '../schema/index.js'
import { guard } from '../runtime/enforcement/definitions.js'
import { postCommitEvent } from '../runtime/hooks/definitions.js'
import { runtimePipelineStage } from '../runtime/pipeline/definitions.js'
import { describe, expect, it } from 'vitest'

import type { PluginPrivilege } from './manifest.js'
import { PluginSetupRegistries } from './setup-registries.js'

describe('PluginSetupRegistries', () => {
	it('exposes only exact frozen setup facades', () => {
		const registries = new PluginSetupRegistries(new SchemaRegistry([]))
		const context = registries.forPlugin('fixture.plugin')

		expect(Object.keys(context).sort()).toStrictEqual([
			'access',
			'capabilities',
			'constraintCompilers',
			'events',
			'fieldBuilderMethods',
			'hooks',
			'pipeline',
			'runtime',
			'schemas',
		])
		expect(context).not.toHaveProperty('registries')
		expect(context).not.toHaveProperty('services')
		expect(Object.isFrozen(context)).toBe(true)
		expect(registries.forPlugin('fixture.plugin')).toBe(context)
	})

	it('enforces the exact privilege selected by each Runtime facade', () => {
		const privileges: PluginPrivilege[] = []
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([]),
			undefined,
			undefined,
			(_owner, privilege) => privileges.push(privilege),
		)
		const context = registries.forPlugin('fixture.plugin')

		context.runtime.register('guard', guard({ handler: () => undefined }))
		context.events.register(
			'post-commit',
			postCommitEvent({ handler: () => undefined }),
		)
		context.pipeline.register(
			'normalization',
			runtimePipelineStage({
				stage: 'normalization',
				handler: ({ operation }) => operation,
			}),
		)

		expect(privileges).toStrictEqual([
			'runtime:constrain',
			'runtime:observe',
			'runtime:intercept',
		])
		expect(registries.getRuntimeContributions()).toHaveLength(1)
		expect(registries.getEventContributions()).toHaveLength(1)
		expect(registries.getPipelineContributions()).toHaveLength(1)
	})

	it('rejects forged definitions and setup writes after closure', () => {
		const registries = new PluginSetupRegistries(new SchemaRegistry([]))
		const context = registries.forPlugin('fixture.plugin')

		expect(() => {
			context.runtime.register('forged', { kind: 'guard' } as never)
		}).toThrow(
			'must be created by a Runtime interception or enforcement factory',
		)

		registries.closeSetup()
		expect(() => {
			context.events.register(
				'late',
				postCommitEvent({ handler: () => undefined }),
			)
		}).toThrow('Event contributions can only be registered during setup')
	})

	it('keeps exact contribution stores isolated per application', () => {
		const first = new PluginSetupRegistries(new SchemaRegistry([]))
		const second = new PluginSetupRegistries(new SchemaRegistry([]))

		first
			.forPlugin('fixture.plugin')
			.runtime.register('guard', guard({ handler: () => undefined }))

		expect(first.getRuntimeContributions()).toHaveLength(1)
		expect(second.getRuntimeContributions()).toStrictEqual([])
	})
})
