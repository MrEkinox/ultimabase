import {
	FrameworkError,
	getCurrentRequest,
	UltimaBase,
	type JsonObject,
} from '@ultimabase/core'
import {
	anonymous,
	defineCapability,
	plugin,
	provideCapability,
	waitForAfterCommitWork,
	withPluginPrivileges,
	type PluginContribution,
	type PluginDefinition,
} from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'
import {
	createPluginEventDispatcher,
	definePluginEvent,
	definePluginEventCapability,
	observePluginEvent,
	optionalPluginEvents,
	providePluginEvent,
	type PluginEventDispatcher,
	type PluginEventHandlerInput,
	type PluginEventObserver,
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

	it('derives runtime:observe for observer providers', async () => {
		const observer = observePluginEvent(published, () => undefined)
		const provider = providePluginEvent(events, 'fixture-observer', observer)
		expect(
			plugin({
				id: 'fixture.unauthorized-event-observer',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [provider],
			}).manifest.privileges.find(({ name }) => name === 'runtime:observe'),
		).toStrictEqual({
			name: 'runtime:observe',
			reason: 'Provides the "fixture.plugin-events" capability.',
		})

		const authorized = plugin({
			id: 'fixture.authorized-event-observer',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Observes committed fixture events.' },
			contributions: [provider],
		})
		const application = new (UltimaBase.use(authorized))({
			schemas: [],
		})
		await application.initialize()

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

describe('plugin event definitions', () => {
	const defineUntyped = (...parameters: unknown[]): unknown =>
		Reflect.apply(definePluginEvent(), undefined, parameters)

	it.for([
		['a name', ['', { delivery: 'optional' }], 'plugin event name'],
		[
			'plain options',
			['fixture.event', null],
			'plugin event options must be a plain object',
		],
		[
			'known options',
			['fixture.event', { delivery: 'optional', retries: 3 }],
			'plugin event contains unknown option: retries',
		],
		[
			'a delivery mode',
			['fixture.event', { delivery: 'eventual' }],
			'plugin event delivery must be optional or required',
		],
	] as const)('requires %s', ([, parameters, message]) => {
		expect(() => {
			defineUntyped(...parameters)
		}).toThrow(message)
	})

	it('requires a handler function', () => {
		expect(() => {
			Reflect.apply(observePluginEvent, undefined, [published, 'handler'])
		}).toThrow('plugin event handler must be a function')
	})
})

const anyString: unknown = expect.any(String)
const removed = definePluginEvent<PublishedPayload>()('fixture.removed', {
	delivery: 'required',
})
const producerReady = defineCapability<Readonly<{ ready: true }>>()({
	capabilityId: 'fixture.plugin-events.producer',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})

/** One producer that may publish, and observers recording what they get. */
const startEvents = async (
	options: Readonly<{
		publish?: boolean
		observers?: readonly PluginDefinition[]
	}> = {},
) => {
	const holder: { dispatcher?: PluginEventDispatcher } = {}
	const requirement = optionalPluginEvents(events, '^1.0.0')
	const grant = <TContribution extends PluginContribution>(
		contribution: TContribution,
	) =>
		options.publish === false
			? contribution
			: withPluginPrivileges(contribution, ['event:publish'])
	const producer = plugin({
		core: '^0.0.0',
		id: 'fixture.event-producer',
		version: '1.0.0',
		...(options.publish === false
			? {}
			: { permissions: { 'event:publish': 'Publishes fixture events.' } }),
		contributions: [
			requirement,
			grant(
				provideCapability(producerReady, {
					contributionId: 'producer',
					create: ({ assertPrivilege, capabilities, owner }) => {
						holder.dispatcher = createPluginEventDispatcher({
							assertPrivilege,
							capabilities,
							owner,
							requirement,
						})
						return { value: Object.freeze({ ready: true as const }) }
					},
				}),
			),
		],
	})
	const ultimabase = new (UltimaBase.use(
		testDatabasePlugin(new ScriptedTestDatabase({ transactions: 'empty' }), {
			id: 'fixture.database',
		}),
		producer,
		...(options.observers ?? []),
	))({ logger: false, schemas: [] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const { dispatcher } = holder
	if (dispatcher === undefined) throw new TypeError('No event dispatcher')
	return { dispatcher, ultimabase }
}

const observerPlugin = (
	id: string,
	observers: readonly PluginEventObserver[],
): PluginDefinition =>
	plugin({
		core: '^0.0.0',
		id,
		version: '1.0.0',
		permissions: { 'runtime:observe': 'Observes fixture events.' },
		contributions: observers.map((observer, index) =>
			providePluginEvent(events, `observer-${String(index)}`, observer),
		),
	})

describe('createPluginEventDispatcher', () => {
	it('delivers each committed event to the observers of its name, in order', async () => {
		const received: PluginEventHandlerInput[] = []
		const trace: string[] = []
		const { dispatcher, ultimabase } = await startEvents({
			observers: [
				observerPlugin('fixture.first-observer', [
					observePluginEvent(published, (input) => {
						trace.push('first')
						received.push(input)
					}),
					observePluginEvent(removed, () => {
						trace.push('removed')
					}),
				]),
				observerPlugin('fixture.second-observer', [
					observePluginEvent(published, () => {
						trace.push('second')
						throw new Error('observer failed')
					}),
					observePluginEvent(published, () => {
						trace.push('third')
					}),
				]),
			],
		})
		const payload = { id: 'post-1' }
		await ultimabase.transaction(() => {
			const context = getCurrentRequest()
			dispatcher.emit(context, published, payload)
			// The payload is detached when emitted.
			payload.id = 'changed'
			expect(trace).toStrictEqual([])
		})
		await waitForAfterCommitWork()
		// A failing observer is logged; the next one still runs.
		expect(trace).toStrictEqual(['first', 'second', 'third'])
		expect(received[0]?.event).toMatchObject({
			emittedBy: { pluginId: 'fixture.event-producer' },
			name: 'fixture.published',
			payload: { id: 'post-1' },
			transactionId: anyString,
		})
		expect(received[0]?.event.requestId).toBe(received[0]?.context.requestId)
		expect(Object.isFrozen(received[0]?.event)).toBe(true)
	})

	it('delivers nothing when the transaction rolls back', async () => {
		const trace: string[] = []
		const { dispatcher, ultimabase } = await startEvents({
			observers: [
				observerPlugin('fixture.observer', [
					observePluginEvent(published, () => {
						trace.push('delivered')
					}),
				]),
			],
		})
		await expect(
			ultimabase.transaction(() => {
				dispatcher.emit(getCurrentRequest(), published, { id: 'post-1' })
				throw new Error('rolled back')
			}),
		).rejects.toThrow('rolled back')
		await waitForAfterCommitWork()
		expect(trace).toStrictEqual([])
	})

	it('needs a transaction and an observer for a required event', async () => {
		const { dispatcher, ultimabase } = await startEvents({
			observers: [
				observerPlugin('fixture.observer', [
					observePluginEvent(published, () => undefined),
				]),
			],
		})
		await ultimabase.transaction(() => {
			const context = getCurrentRequest()
			// An optional event without observer is dropped; a required one fails.
			expect(() => {
				dispatcher.emit(context, removed, { id: 'post-1' })
			}).toThrow(
				new FrameworkError(
					'SERVICE_NOT_FOUND',
					'No plugin event observer is registered for "fixture.removed".',
				),
			)
			expect(() => {
				dispatcher.emit(
					context,
					{ delivery: 'optional', name: 'fixture.published' },
					{ id: 'forged' },
				)
			}).toThrow('Invalid plugin event contract')
		})
		expect(() => {
			dispatcher.emit(
				anonymous(ultimabase, { requestId: 'outside', source: 'fixture' })
					.context,
				published,
				{ id: 'post-1' },
			)
		}).toThrow('Plugin events require an active transaction.')
		await ultimabase.dispose()
		// Without any observer, an optional event is dropped.
		const silent = await startEvents()
		await silent.ultimabase.transaction(() => {
			silent.dispatcher.emit(getCurrentRequest(), published, { id: 'post-1' })
		})
	})

	it('requires the event:publish privilege to emit', async () => {
		const { dispatcher, ultimabase } = await startEvents({ publish: false })
		await ultimabase.transaction(() => {
			expect(() => {
				dispatcher.emit(getCurrentRequest(), published, { id: 'post-1' })
			}).toThrow(expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }))
		})
	})

	it('refuses an observer that observePluginEvent did not create', async () => {
		const forged = plugin({
			core: '^0.0.0',
			id: 'fixture.forged-observer',
			version: '1.0.0',
			permissions: { 'runtime:observe': 'Provides a forged observer.' },
			contributions: [
				provideCapability(events, {
					contributionId: 'forged',
					create: () => ({
						value: Object.freeze({
							kind: 'plugin-event-observer' as const,
							name: 'fixture.published',
						}),
					}),
				}),
			],
		})
		await expect(startEvents({ observers: [forged] })).rejects.toThrow(
			'Plugin event capability contains an invalid observer',
		)
	})
})
