import {
	createApplication,
	definePlugin,
	type JsonObject,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import {
	definePluginEvent,
	definePluginEventCapability,
	observePluginEvent,
	providePluginEvent,
} from './plugin-events.js'

interface PublishedPayload extends JsonObject {
	readonly id: string
}

const published = definePluginEvent<PublishedPayload>()('fixture.published', {
	delivery: 'optional',
})
const events = definePluginEventCapability({
	capabilityId: 'fixture.plugin-events',
	version: '1.0.0',
})

describe('plugin event authoring helpers', () => {
	it('creates inert immutable contracts and observers', () => {
		const handler = vi.fn()
		const observer = observePluginEvent(published, handler)

		expect(published).toStrictEqual({
			delivery: 'optional',
			name: 'fixture.published',
		})
		expect(observer).toStrictEqual({
			kind: 'plugin-event-observer',
			name: 'fixture.published',
		})
		expect(Object.isFrozen(published)).toBe(true)
		expect(Object.isFrozen(observer)).toBe(true)
		expect(handler).not.toHaveBeenCalled()
	})

	it('keeps observer execution behind runtime:observe provider privilege', async () => {
		const observer = observePluginEvent(published, () => undefined)
		const provider = providePluginEvent(events, 'fixture-observer', observer)
		const unauthorized = definePlugin({
			pluginId: 'fixture.unauthorized-event-observer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { provides: [provider] },
		})

		await expect(
			createApplication({ plugins: [unauthorized], schemas: [] }),
		).rejects.toMatchObject({ code: 'PLUGIN_CAPABILITY_CONFLICT' })

		const authorized = definePlugin({
			pluginId: 'fixture.authorized-event-observer',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'runtime:observe',
					reason: 'Observes committed fixture events.',
				},
			],
			capabilities: { provides: [provider] },
		})
		const application = await createApplication({
			plugins: [authorized],
			schemas: [],
		})

		await application.dispose()
	})

	it('rejects forged contracts and observers', () => {
		expect(() =>
			observePluginEvent(
				{ delivery: 'optional', name: 'fixture.forged' },
				() => undefined,
			),
		).toThrow('Invalid plugin event contract')
		expect(() =>
			providePluginEvent(events, 'forged', {
				kind: 'plugin-event-observer',
				name: 'fixture.forged',
			}),
		).toThrow('Invalid plugin event observer')
	})
})
