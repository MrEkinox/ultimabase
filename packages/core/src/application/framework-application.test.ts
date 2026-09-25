import { applicationFixture } from '../../tests/application-fixture.js'
import { SchemaRegistry, Schema } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { plugin as createPlugin } from '../plugins/plugin.js'
import { contributeApplication } from '../plugins/plugin-contributions.js'
import {
	createApplication,
	FrameworkApplication,
} from './framework-application.js'

const applicationSchema = Schema.define({
	className: 'ApplicationFixture',
	fields: (field) => ({ name: field.string() }),
})

describe('FrameworkApplication', () => {
	it('compiles static schemas without running plugin setup', () => {
		let setupCalls = 0
		const StaticSchema = Schema.define({
			className: 'StaticCompilationOnly',
			fields: (field) => ({ title: field.string() }),
		})
		const application = applicationFixture(
			new FrameworkApplication({
				plugins: [
					createPlugin({
						version: '0.0.0',
						core: '^0.0.0',
						id: 'fixture.static-only',
						contributions: [
							contributeApplication((context) => {
								setupCalls += 1
								const exports = undefined
								const lifecycleContext = { ...context, pluginExports: exports }
								void lifecycleContext
								return { exports }
							}),
						],
					}),
				],
				schemas: [StaticSchema],
			}),
		)

		expect(application.compileSchemas()).toBe(application)
		expect(application.compileSchemas()).toBe(application)
		expect(StaticSchema.fields.title?.kind).toBe('string')
		expect(setupCalls).toBe(0)
		expect(application.state).toBe('idle')
	})

	it('reports one declaration failure without replaying its callback', () => {
		let declarationCalls = 0

		expect(() =>
			Schema.define({
				className: 'FailedStaticCompilation',
				fields() {
					declarationCalls += 1
					throw new TypeError('fixture static compilation failed')
				},
			}),
		).toThrow(
			expect.objectContaining({
				cause: new TypeError('fixture static compilation failed'),
			}),
		)
		expect(declarationCalls).toBe(1)
	})

	it('initializes a flat dependency graph without starting infrastructure', async () => {
		const events: string[] = []
		const child = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.child',
			dependencies: [{ pluginId: 'fixture.parent', version: '^0.0.0' }],
			contributions: [
				contributeApplication((context) => {
					events.push('setup:child')
					const exports = { ready: true as const }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						startTransports: () => {
							;(() => {
								events.push('transport:child')
							})()
						},
					}
				}),
			],
		})
		const parent = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.parent',
			contributions: [
				contributeApplication((context) => {
					events.push('setup:parent')
					const exports = { configured: true as const }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						startTransports: () => {
							;(() => {
								events.push('transport:parent')
							})()
						},
					}
				}),
			],
		})

		const application = await createApplication({
			schemas: [applicationSchema],
			plugins: [parent, child],
		})

		expect(application).toBeInstanceOf(FrameworkApplication)
		expect(application.state).toBe('ready')
		expect(application.schemas.get('ApplicationFixture')).toBe(
			applicationSchema,
		)
		expect(application.getPlugin('fixture.parent')).toStrictEqual({
			configured: true,
		})
		expect(application.getPlugin('fixture.child')).toStrictEqual({
			ready: true,
		})
		expect(events).toStrictEqual(['setup:parent', 'setup:child'])

		await application.start()
		expect(events).toStrictEqual([
			'setup:parent',
			'setup:child',
			'transport:parent',
			'transport:child',
		])
		await application.stop()
		await application.dispose()
	})

	it('keeps schemas and plugin exports application-scoped', async () => {
		let applicationId = 0
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.isolation',
			contributions: [
				contributeApplication((context) => {
					const marker = { applicationId: applicationId++ }
					const exports = { marker }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})

		const first = await createApplication({
			schemas: [applicationSchema],
			plugins: [plugin],
		})
		const firstExports = first.getPlugin('fixture.isolation')
		await first.dispose()
		const second = await createApplication({
			schemas: [applicationSchema],
			plugins: [plugin],
		})
		const secondExports = second.getPlugin('fixture.isolation')

		expect(first.schemas).not.toBe(second.schemas)
		expect(firstExports.marker).not.toBe(secondExports.marker)
		await Promise.all([first.dispose(), second.dispose()])
	})

	it('isolates repeated plugin instances by structured identity', async () => {
		const primary = createPlugin({
			id: 'fixture.repeated',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication((context) => {
					const exports = { instance: 'primary' as const }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const analytics = createPlugin({
			id: 'fixture.repeated',
			instanceId: 'analytics',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication((context) => {
					const exports = { instance: 'analytics' as const }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const application = await createApplication({
			schemas: [],
			plugins: [primary, analytics],
		})

		expect(
			application.getPlugin({
				pluginId: 'fixture.repeated',
				instanceId: 'primary',
			}),
		).toStrictEqual({ instance: 'primary' })
		expect(
			application.getPlugin({
				pluginId: 'fixture.repeated',
				instanceId: 'analytics',
			}),
		).toStrictEqual({ instance: 'analytics' })
		expect(() => application.getPlugin('fixture.repeated')).toThrow(
			new TypeError(
				'Plugin ID is ambiguous; provide pluginId and instanceId: fixture.repeated',
			),
		)

		await application.dispose()
	})

	it('checks schema ownership by exact application identity', () => {
		const matchingClassSchema = Schema.define({
			className: 'ApplicationFixture',
			fields: (field) => ({ name: field.string() }),
		})
		const unknownClassSchema = Schema.define({
			className: 'UnknownFixture',
			fields: (field) => ({ name: field.string() }),
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [applicationSchema],
				plugins: [],
			}),
		)

		expect(application.ownsSchema(applicationSchema)).toBe(true)
		expect(application.ownsSchema(matchingClassSchema)).toBe(false)
		expect(application.ownsSchema(unknownClassSchema)).toBe(false)
		expect(application.ownsSchema(undefined)).toBe(false)
	})

	it('validates graph configuration before plugin setup or transports', async () => {
		const events: string[] = []
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.invalid',
			dependencies: [{ pluginId: 'fixture.missing', version: '^0.0.0' }],
			contributions: [
				contributeApplication((context) => {
					events.push('setup')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						startTransports: () => {
							;(() => {
								events.push('transport')
							})()
						},
					}
				}),
			],
		})

		await expect(
			createApplication({ schemas: [applicationSchema], plugins: [plugin] }),
		).rejects.toMatchObject({ code: 'PLUGIN_DEPENDENCY_MISSING' })
		expect(events).toStrictEqual([])

		await expect(
			createApplication({
				schemas: [applicationSchema, applicationSchema],
				plugins: [],
			}),
		).rejects.toMatchObject({
			code: 'SCHEMA_DUPLICATE_CLASS_NAME',
			className: 'ApplicationFixture',
		})
	})

	it('supports direct construction while keeping setup lazy until requested', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.lazy',
			contributions: [
				contributeApplication((context) => {
					const exports = { initialized: true }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [applicationSchema],
				plugins: [plugin],
			}),
		)

		expect(application.state).toBe('idle')
		expect(() => application.getPlugin('fixture.lazy')).toThrow(
			new TypeError('Plugin setup has not completed: fixture.lazy'),
		)
		await application.start()
		expect(application.getPlugin('fixture.lazy')).toStrictEqual({
			initialized: true,
		})
		await application.dispose()
	})

	it('retains dependency-first setup order', async () => {
		const order: string[] = []
		const dependency = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.contribution-dependency',
			contributions: [
				contributeApplication((context) => {
					order.push('dependency')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const consumer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.contribution-consumer',
			dependencies: [
				{
					pluginId: 'fixture.contribution-dependency',
					version: '^0.0.0',
				},
			],
			contributions: [
				contributeApplication((context) => {
					order.push('consumer')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const application = await createApplication({
			schemas: [applicationSchema],
			plugins: [consumer, dependency],
		})

		expect(order).toStrictEqual(['dependency', 'consumer'])
		await application.dispose()
	})

	it('protects JavaScript callers from malformed option containers', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-object callers.
			applicationFixture(new FrameworkApplication(null))
		}).toThrow(new TypeError('application options must be a plain object'))
		expect(() => {
			applicationFixture(
				new FrameworkApplication({
					// @ts-expect-error -- Runtime validation protects non-array schemas.
					schemas: new SchemaRegistry(),
					plugins: [],
				}),
			)
		}).toThrow(new TypeError('schemas must be an array'))
		expect(() => {
			applicationFixture(
				new FrameworkApplication({
					schemas: [],
					// @ts-expect-error -- Runtime validation protects non-array plugins.
					plugins: {},
				}),
			)
		}).toThrow(new TypeError('plugins must be an array'))
	})
})
