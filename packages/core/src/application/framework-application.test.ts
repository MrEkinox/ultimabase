import { SchemaRegistry, defineSchema, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { createServiceToken } from '../services/service-token.js'
import { definePlugin } from '../plugins/definition.js'
import {
	createApplication,
	FrameworkApplication,
} from './framework-application.js'

const applicationSchema = defineSchema({
	className: 'ApplicationFixture',
	fields: { name: stringField() },
})

describe('FrameworkApplication', () => {
	it('initializes declarations without starting infrastructure', async () => {
		const events: string[] = []
		const child = definePlugin({
			name: 'fixture.child',
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
			name: 'fixture.parent',
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
		'keeps schemas, services, and plugin exports application-scoped',
		async () => {
			interface MarkerService {
				readonly applicationId: number
			}

			const MarkerServiceToken = createServiceToken<MarkerService>(
				'fixture.application-marker',
			)
			let applicationId = 0
			const plugin = definePlugin({
				name: 'fixture.isolation',
				setup: ({ services, registries }) => {
					const marker = { applicationId: applicationId++ }

					services.provide(MarkerServiceToken, marker)
					registries.commands.register('fixture.command', marker)

					return { marker, services, commands: registries.commands }
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
			expect(firstExports.services.get(MarkerServiceToken)).toBe(
				firstExports.marker,
			)
			expect(secondExports.services.get(MarkerServiceToken)).toBe(
				secondExports.marker,
			)
			expect(firstExports.commands.get('fixture.command')?.value).toBe(
				firstExports.marker,
			)
			expect(secondExports.commands.get('fixture.command')?.value).toBe(
				secondExports.marker,
			)

			await Promise.all([first.dispose(), second.dispose()])
		},
	)

	it('validates graph configuration before plugin setup or transports', async () => {
		const events: string[] = []
		const plugin = definePlugin({
			name: 'fixture.invalid',
			dependencies: ['fixture.missing'],
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
			name: 'fixture.lazy',
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
	})
})
