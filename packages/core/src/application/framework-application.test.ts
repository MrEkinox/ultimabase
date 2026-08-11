import { SchemaRegistry, Schema } from '../schema/index.js'
import { describe, expect, it } from 'vitest'

import { definePlugin } from '../plugins/definition.js'
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
		const application = new FrameworkApplication({
			plugins: [
				definePlugin({
					version: '0.0.0',
					core: '^0.0.0',
					pluginId: 'fixture.static-only',
					setup: () => {
						setupCalls += 1
					},
				}),
			],
			schemas: [StaticSchema],
		})

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

	it('initializes declarations without starting infrastructure', async () => {
		const events: string[] = []
		const child = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.child',
			setup: () => {
				events.push('setup:child')

				return { ready: true as const }
			},
			hooks: {
				startTransports: () => {
					events.push('transport:child')
				},
			},
		})
		const parent = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.parent',
			plugins: [child],
			setup: () => {
				events.push('setup:parent')

				return { configured: true as const }
			},
			hooks: {
				startTransports: () => {
					events.push('transport:parent')
				},
			},
		})

		const application = await createApplication({
			schemas: [applicationSchema],
			plugins: [parent],
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

	it.concurrent(
		'keeps schemas and plugin exports application-scoped',
		async () => {
			let applicationId = 0
			const plugin = definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: 'fixture.isolation',
				setup: () => {
					const marker = { applicationId: applicationId++ }

					return { marker }
				},
			})

			const [first, second] = await Promise.all([
				createApplication({ schemas: [applicationSchema], plugins: [plugin] }),
				createApplication({ schemas: [applicationSchema], plugins: [plugin] }),
			])
			const firstExports = first.getPlugin('fixture.isolation')
			const secondExports = second.getPlugin('fixture.isolation')

			expect(first.schemas).not.toBe(second.schemas)
			expect(firstExports.marker).not.toBe(secondExports.marker)
			await Promise.all([first.dispose(), second.dispose()])
		},
	)

	it('isolates repeated plugin instances by structured identity', async () => {
		const primary = definePlugin({
			pluginId: 'fixture.repeated',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			setup: () => ({ instance: 'primary' as const }),
		})
		const analytics = definePlugin({
			pluginId: 'fixture.repeated',
			instanceId: 'analytics',
			version: '1.0.0',
			core: '^0.0.0',
			setup: () => ({ instance: 'analytics' as const }),
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
		const application = new FrameworkApplication({
			schemas: [applicationSchema],
			plugins: [],
		})

		expect(application.ownsSchema(applicationSchema)).toBe(true)
		expect(application.ownsSchema(matchingClassSchema)).toBe(false)
		expect(application.ownsSchema(unknownClassSchema)).toBe(false)
		expect(application.ownsSchema(undefined)).toBe(false)
	})

	it('validates graph configuration before plugin setup or transports', async () => {
		const events: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.invalid',
			dependencies: [{ pluginId: 'fixture.missing', version: '^0.0.0' }],
			setup: () => {
				events.push('setup')
			},
			hooks: {
				startTransports: () => {
					events.push('transport')
				},
			},
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
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.lazy',
			setup: () => ({ initialized: true }),
		})
		const application = new FrameworkApplication({
			schemas: [applicationSchema],
			plugins: [plugin],
		})

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
		const dependency = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.contribution-dependency',
			setup: () => {
				order.push('dependency')
			},
		})
		const consumer = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.contribution-consumer',
			dependencies: [
				{
					pluginId: 'fixture.contribution-dependency',
					version: '^0.0.0',
				},
			],
			setup: () => {
				order.push('consumer')
			},
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
			new FrameworkApplication(null)
		}).toThrow(new TypeError('application options must be a plain object'))
		expect(() => {
			new FrameworkApplication({
				// @ts-expect-error -- Runtime validation protects non-array schemas.
				schemas: new SchemaRegistry(),
				plugins: [],
			})
		}).toThrow(new TypeError('schemas must be an array'))
		expect(() => {
			new FrameworkApplication({
				schemas: [],
				// @ts-expect-error -- Runtime validation protects non-array plugins.
				plugins: {},
			})
		}).toThrow(new TypeError('plugins must be an array'))
		expect(() => {
			new FrameworkApplication({
				// @ts-expect-error -- Runtime validation protects malformed Access options.
				access: null,
				schemas: [],
				plugins: [],
			})
		}).toThrow(new TypeError('application access must be a plain object'))
		expect(() => {
			new FrameworkApplication({
				access: {
					// @ts-expect-error -- Grouped defaults require boolean branches.
					default: { field: true },
				},
				schemas: [],
				plugins: [],
			})
		}).toThrow(
			new TypeError('application access.default.operation must be a boolean'),
		)
	})
})
