import { describe, expect, it } from 'vitest'

import {
	contributeApplication,
	plugin as createPlugin,
	withPluginPrivileges,
} from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { UltimaBase } from './ultima-base.js'

const createLifecyclePlugin = (
	id: string,
	trace: string[],
	options: {
		readonly dependencies?: readonly {
			readonly pluginId: string
			readonly version: string
		}[]
		readonly instanceId?: string
	} = {},
) =>
	createPlugin({
		core: '^0.0.0',
		id,
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		...(options.dependencies === undefined
			? {}
			: { dependencies: options.dependencies }),
		version: '1.0.0',
		contributions: [
			contributeApplication(() => {
				trace.push(`${id}:setup`)
				return {
					exports: { id },
					connect: () => {
						trace.push(`${id}:connect`)
					},
					stop: () => {
						trace.push(`${id}:stop`)
					},
					dispose: () => {
						trace.push(`${id}:dispose`)
					},
				}
			}),
		],
	})

describe('configured UltimaBase factories', () => {
	it('appends one flat immutable tuple without mutating its parent', async () => {
		const trace: string[] = []
		const first = createLifecyclePlugin('fixture.factory-first', trace)
		const second = createLifecyclePlugin('fixture.factory-second', trace)
		const FirstApplication = UltimaBase.use(first)
		const BothApplication = FirstApplication.use(second)
		const Portable = UltimaBase.Schema.define({
			className: 'ConfiguredFactoryPortable',
			fields: (field) => ({ value: field.string() }),
		})
		const Ancestor = FirstApplication.Schema.define({
			className: 'ConfiguredFactoryAncestor',
			fields: (field) => ({ value: field.string() }),
		})
		const Detached = BothApplication.Schema.define({
			className: 'ConfiguredFactoryDetached',
			fields: (field) => ({ value: field.string() }),
		})

		expect(FirstApplication).not.toBe(BothApplication)
		expect(Object.isFrozen(FirstApplication)).toBe(true)
		expect(Object.isFrozen(BothApplication)).toBe(true)
		expect(FirstApplication.Schema).toBe(Schema)
		expect(BothApplication.Schema).toBe(Schema)

		const firstApplication = new FirstApplication({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		const bothApplication = new BothApplication({
			pluginPrivileges: { logger: false },
			schemas: [Portable, Ancestor],
		})
		const legacyApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [first],
			schemas: [],
		})
		const portableApplication = new UltimaBase({ schemas: [] })

		expect(
			firstApplication.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.pluginId,
			),
		).toStrictEqual(['fixture.factory-first'])
		expect(
			bothApplication.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.pluginId,
			),
		).toStrictEqual(['fixture.factory-first', 'fixture.factory-second'])
		expect(bothApplication.ownsSchema(Portable)).toBe(true)
		expect(bothApplication.ownsSchema(Ancestor)).toBe(true)
		expect(bothApplication.ownsSchema(Detached)).toBe(false)
		expect(legacyApplication.pluginPrivilegeReport).toStrictEqual(
			firstApplication.pluginPrivilegeReport,
		)
		expect(portableApplication.pluginPrivilegeReport.plugins).toStrictEqual([])
		expect(trace).toStrictEqual([])

		await firstApplication.dispose()
		await bothApplication.dispose()
		await legacyApplication.dispose()
		await portableApplication.dispose()
	})

	it('reuses one inert schema identity across isolated explicit roots', async () => {
		let declarationCalls = 0
		const Reusable = UltimaBase.Schema.define({
			className: 'ConfiguredFactoryReusable',
			fields: (field) => {
				declarationCalls += 1
				return { title: field.string({ required: true }) }
			},
		})
		const ownKeys = Reflect.ownKeys(Reusable)
		const prototype = Reflect.get(Reusable, 'prototype') as unknown
		const first = new UltimaBase({ schemas: [Reusable] })
		const second = new UltimaBase({ schemas: [Reusable] })

		expect(first.ownsSchema(Reusable)).toBe(true)
		expect(second.ownsSchema(Reusable)).toBe(true)
		expect(first.schema(Reusable).schema).toBe(Reusable)
		expect(second.schema(Reusable).schema).toBe(Reusable)
		expect(declarationCalls).toBe(1)
		expect(Reflect.ownKeys(Reusable)).toStrictEqual(ownKeys)
		expect(Reflect.get(Reusable, 'prototype') as unknown).toBe(prototype)
		expect(Object.isFrozen(Reusable)).toBe(true)

		await first.dispose()
		await second.dispose()
	})

	it('preserves dependency order and sequential lifecycle replacement', async () => {
		const trace: string[] = []
		const first = createLifecyclePlugin('fixture.factory-dependency', trace)
		const second = createLifecyclePlugin('fixture.factory-consumer', trace, {
			dependencies: [
				{ pluginId: 'fixture.factory-dependency', version: '^1.0.0' },
			],
		})
		const Application = UltimaBase.use(second).use(first)
		const application = new Application({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		const concurrent = new Application({
			pluginPrivileges: { logger: false },
			schemas: [],
		})

		await application.start()
		await expect(concurrent.start()).rejects.toThrow(
			'Another UltimaBase application is active',
		)
		await concurrent.dispose()
		await application.stop()
		await application.dispose()

		const replacement = new Application({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		await replacement.start()
		await replacement.dispose()

		expect(trace).toStrictEqual([
			'fixture.factory-dependency:setup',
			'fixture.factory-consumer:setup',
			'fixture.factory-dependency:connect',
			'fixture.factory-consumer:connect',
			'fixture.factory-consumer:stop',
			'fixture.factory-dependency:stop',
			'fixture.factory-consumer:dispose',
			'fixture.factory-dependency:dispose',
			'fixture.factory-dependency:setup',
			'fixture.factory-consumer:setup',
			'fixture.factory-dependency:connect',
			'fixture.factory-consumer:connect',
			'fixture.factory-consumer:stop',
			'fixture.factory-dependency:stop',
			'fixture.factory-consumer:dispose',
			'fixture.factory-dependency:dispose',
		])
	})

	it('retains duplicate and exact-instance validation', async () => {
		const trace: string[] = []
		const duplicate = createLifecyclePlugin('fixture.factory-duplicate', trace)
		const conflictingDuplicate = createLifecyclePlugin(
			'fixture.factory-duplicate',
			trace,
		)
		const DuplicateApplication =
			UltimaBase.use(duplicate).use(conflictingDuplicate)

		expect(
			() =>
				new DuplicateApplication({
					pluginPrivileges: { logger: false },
					schemas: [],
				}),
		).toThrow('Plugin "fixture.factory-duplicate" was declared more than once')

		const primary = createLifecyclePlugin('fixture.factory-instance', trace, {
			instanceId: 'primary',
		})
		const analytics = createLifecyclePlugin('fixture.factory-instance', trace, {
			instanceId: 'analytics',
		})
		const InstanceApplication = UltimaBase.use(primary).use(analytics)
		const application = new InstanceApplication({
			pluginPrivileges: { logger: false },
			schemas: [],
		})

		expect(
			application.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.instanceId,
			),
		).toStrictEqual(['primary', 'analytics'])
		await application.dispose()
	})

	it('rejects a second constructor installation path on configured factories', () => {
		const trace: string[] = []
		const configured = createLifecyclePlugin(
			'fixture.factory-configured',
			trace,
		)
		const extra = createLifecyclePlugin('fixture.factory-extra', trace)
		const Application = UltimaBase.use(configured)
		const RuntimeConstructor = Application as unknown as new (
			options: unknown,
		) => object

		expect(
			() => new RuntimeConstructor({ plugins: [extra], schemas: [] }),
		).toThrow(
			'Configured UltimaBase factories install plugins through use(), not constructor options',
		)
		expect(trace).toStrictEqual([])
	})

	it('denies privileges before configured plugin effects', () => {
		const trace: string[] = []
		const guarded = createPlugin({
			core: '^0.0.0',
			id: 'fixture.factory-privilege',
			permissions: {
				'runtime:observe': 'Exercises configured-factory denial timing.',
			},
			version: '1.0.0',
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => {
						trace.push('setup')
						return { exports: undefined }
					}),
					['runtime:observe'],
				),
			],
		})
		const Application = UltimaBase.use(guarded)

		expect(
			() =>
				new Application({
					pluginPrivileges: {
						deny: ['runtime:observe'],
						logger: false,
					},
					schemas: [],
				}),
		).toThrow('Plugin privilege policy denied 1 active request')
		expect(trace).toStrictEqual([])
	})
})
