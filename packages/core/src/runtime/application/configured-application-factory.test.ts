import { describe, expect, it } from 'vitest'

import {
	contributeApplication,
	withPluginPrivileges,
} from '../../plugins/plugin-contributions.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { type PluginDefinition } from '../../plugins/definition.js'
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
	it('installs a fixed tuple and a dynamic list through the same flat factory', async () => {
		const trace: string[] = []
		const first = createLifecyclePlugin('fixture.variadic-first', trace)
		const second = createLifecyclePlugin('fixture.variadic-second', trace)
		const tuple = [first, second] as const
		const dynamic: readonly PluginDefinition[] = tuple
		const Fixed = UltimaBase.use(...tuple)
		const Dynamic = UltimaBase.use(...dynamic)
		const Extended = Fixed.use(...([] as readonly PluginDefinition[]))
		const fixed = new Fixed({
			logger: false,
			schemas: [],
		})
		const variable = new Dynamic({
			logger: false,
			schemas: [],
		})

		expect(Extended).toBe(Fixed)
		expect(
			fixed.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.pluginId,
			),
		).toStrictEqual(['fixture.variadic-first', 'fixture.variadic-second'])
		expect(variable.pluginPrivilegeReport).toStrictEqual(
			fixed.pluginPrivilegeReport,
		)
		expect(trace).toStrictEqual([])

		await fixed.dispose()
		await variable.dispose()
	})

	it('flattens preset arrays in order (ADR-0340)', async () => {
		const trace: string[] = []
		const first = createLifecyclePlugin('fixture.preset-first', trace)
		const second = createLifecyclePlugin('fixture.preset-second', trace)
		const third = createLifecyclePlugin('fixture.preset-third', trace)
		const fourth = createLifecyclePlugin('fixture.preset-fourth', trace)
		const Preset = UltimaBase.use(first, [second, [third]], [])
		const Extended = Preset.use([fourth])
		const Empty = UltimaBase.use([])
		const application = new Extended({ logger: false, schemas: [] })

		expect(Empty).toBe(UltimaBase)
		expect(
			application.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.pluginId,
			),
		).toStrictEqual([
			'fixture.preset-first',
			'fixture.preset-second',
			'fixture.preset-third',
			'fixture.preset-fourth',
		])
		expect(() => UltimaBase.use([null] as never)).toThrow(TypeError)

		await application.dispose()
	})

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
		expect(FirstApplication.Schema).toBe(UltimaBase.Schema)
		expect(BothApplication.Schema).toBe(UltimaBase.Schema)
		expect(Object.isFrozen(UltimaBase.Schema)).toBe(true)
		expect(FirstApplication.Schema.is(Portable)).toBe(true)
		expect(typeof FirstApplication.Schema.defineSpecialized).toBe('function')
		expect(Object.hasOwn(Schema, 'define')).toBe(false)

		const firstApplication = new FirstApplication({
			logger: false,
			schemas: [],
		})
		const bothApplication = new BothApplication({
			logger: false,
			schemas: [Portable, Ancestor],
		})
		const equivalentApplication = new (UltimaBase.use(first))({
			logger: false,
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
		expect(equivalentApplication.pluginPrivilegeReport).toStrictEqual(
			firstApplication.pluginPrivilegeReport,
		)
		expect(portableApplication.pluginPrivilegeReport.plugins).toStrictEqual([])
		expect(trace).toStrictEqual([])

		await firstApplication.dispose()
		await bothApplication.dispose()
		await equivalentApplication.dispose()
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
			logger: false,
			schemas: [],
		})
		const concurrent = new Application({
			logger: false,
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
			logger: false,
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
					logger: false,
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
			logger: false,
			schemas: [],
		})

		expect(
			application.pluginPrivilegeReport.plugins.map(
				({ identity }) => identity.instanceId,
			),
		).toStrictEqual(['primary', 'analytics'])
		await application.dispose()
	})

	it('rejects constructor plugin installation on root and configured factories', () => {
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
		).toThrow('UltimaBase contains unknown option: plugins')
		const RootConstructor = UltimaBase as unknown as new (
			options: unknown,
		) => object
		expect(
			() => new RootConstructor({ plugins: [extra], schemas: [] }),
		).toThrow('UltimaBase contains unknown option: plugins')
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
					},
					logger: false,
					schemas: [],
				}),
		).toThrow('Plugin privilege policy denied 1 active request')
		expect(trace).toStrictEqual([])
	})
})
