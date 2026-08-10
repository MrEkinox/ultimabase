import { describe, expect, it } from 'vitest'

import {
	createApplication,
	FrameworkApplication,
	pointerField,
} from '../../index.js'
import { definePlugin } from '../../plugins/definition.js'
import { objectField } from '../fields/builtins/object.js'
import { Schema } from './definition.js'
import type { SchemaDefinition } from './definition.js'
import { SchemaRegistry } from './registry.js'
import { SchemaTargetResolutionError } from './targets.js'
import type { SchemaTarget } from './targets.js'

/** Keeps graph fixtures focused on target behavior through the public field API. */
const targetField = (target: SchemaTarget) => pointerField({ target })

describe('lazy schema targets', () => {
	it('resolves direct targets lazily into one immutable graph', () => {
		const target = Schema.define({
			className: 'Target',
			fields: (field) => ({ name: field.string() }),
		})
		let invocationCount = 0
		const source = Schema.define({
			className: 'Source',
			fields: () => ({
				target: targetField(() => {
					invocationCount += 1
					return target
				}),
			}),
		})
		const registry = new SchemaRegistry([source, target])

		expect(invocationCount).toBe(0)
		expect(() => registry.schemaTargets).toThrow(
			new TypeError('Schema targets have not been resolved'),
		)

		const graph = registry.resolveSchemaTargets()
		const entries = graph.values()

		expect(invocationCount).toBe(1)
		expect(registry.resolveSchemaTargets()).toBe(graph)
		expect(invocationCount).toBe(1)
		expect(graph.size).toBe(1)
		expect(graph.get(source, ['target'])).toBe(target)
		expect(graph.get(target, ['target'])).toBeUndefined()
		expect(entries).toStrictEqual([
			{
				fieldPath: ['target'],
				source,
				target,
			},
		])
		expect(Object.isFrozen(graph)).toBe(true)
		expect(Object.isFrozen(entries)).toBe(true)
		expect(Object.isFrozen(entries[0])).toBe(true)
		expect(Object.isFrozen(entries[0]?.fieldPath)).toBe(true)
		expect(() => {
			registry.register(target)
		}).toThrow(
			new TypeError('Cannot register schemas after static compilation'),
		)
	})

	it('resolves circular declarations only after both schemas exist', () => {
		function resolveSecondTarget(): SchemaDefinition {
			return second
		}

		const first: SchemaDefinition = Schema.define({
			className: 'First',
			fields: () => ({ second: targetField(resolveSecondTarget) }),
		})
		const second: SchemaDefinition = Schema.define({
			className: 'Second',
			fields: () => ({ first: targetField((): SchemaDefinition => first) }),
		})
		const graph = new SchemaRegistry([first, second]).resolveSchemaTargets()

		expect(graph.get(first, ['second'])).toBe(second)
		expect(graph.get(second, ['first'])).toBe(first)
		expect(
			graph.values().map(({ source, target }) => [source, target]),
		).toEqual([
			[first, second],
			[second, first],
		])
	})

	it('rejects schema pointers inside embedded objects', () => {
		const target = Schema.define({
			className: 'NestedTarget',
			fields: () => ({}),
		})

		expect(() => {
			Reflect.apply(objectField, undefined, [
				{ fields: { owner: targetField(() => target) } },
			])
		}).toThrow(
			new TypeError(
				'fields.owner cannot be a pointer or relation inside objectField',
			),
		)
	})

	it.each([
		{
			expectedMessage:
				'Schema target at InvalidSource.target threw during resolution',
			reason: 'callback-threw' as const,
			target: (): never => {
				throw new Error('private callback failure')
			},
		},
		{
			expectedMessage:
				'Schema target at InvalidSource.target must return a class created by Schema.define',
			reason: 'invalid-target' as const,
			target: (): string => 'not-a-schema',
		},
	])('reports $reason with the exact field path', (fixture) => {
		const source = Schema.define({
			className: 'InvalidSource',
			fields: () => ({
				// @ts-expect-error -- Runtime resolution protects JavaScript callers.
				target: targetField(fixture.target),
			}),
		})
		let thrown: unknown

		try {
			new SchemaRegistry([source]).resolveSchemaTargets()
		} catch (error: unknown) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(SchemaTargetResolutionError)
		expect(thrown).toMatchObject({
			code: 'SCHEMA_TARGET_RESOLUTION_FAILED',
			fieldPath: ['target'],
			message: fixture.expectedMessage,
			name: 'SchemaTargetResolutionError',
			reason: fixture.reason,
			sourceClassName: 'InvalidSource',
		})
	})

	it('distinguishes unregistered and foreign schema identities', () => {
		const unregistered = Schema.define({
			className: 'UnregisteredTarget',
			fields: () => ({}),
		})
		const missingSource = Schema.define({
			className: 'MissingSource',
			fields: () => ({ target: targetField(() => unregistered) }),
		})
		const foreign = Schema.define({
			className: 'SharedTarget',
			fields: (field) => ({ foreign: field.string() }),
		})
		const local = Schema.define({
			className: 'SharedTarget',
			fields: (field) => ({ local: field.string() }),
		})
		const foreignSource = Schema.define({
			className: 'ForeignSource',
			fields: () => ({ target: targetField(() => foreign) }),
		})

		expect(() =>
			new SchemaRegistry([missingSource]).resolveSchemaTargets(),
		).toThrow(
			expect.objectContaining({
				reason: 'unregistered-target',
				targetClassName: 'UnregisteredTarget',
			}),
		)
		expect(() =>
			new SchemaRegistry([foreignSource, local]).resolveSchemaTargets(),
		).toThrow(
			expect.objectContaining({
				reason: 'foreign-target',
				targetClassName: 'SharedTarget',
			}),
		)
	})

	it('guards malformed target declarations and graph lookups', () => {
		const invalidSource = Schema.define({
			className: 'InvalidCallbackSource',
			fields: () => ({
				// @ts-expect-error -- Runtime resolution protects JavaScript callers.
				target: targetField('not-a-function'),
			}),
		})

		expect(() =>
			new SchemaRegistry([invalidSource]).resolveSchemaTargets(),
		).toThrow(
			expect.objectContaining({
				message:
					'Schema target at InvalidCallbackSource.target must be a function',
				reason: 'invalid-target',
			}),
		)

		const schema = Schema.define({
			className: 'EmptyGraph',
			fields: () => ({}),
		})
		const graph = new SchemaRegistry([schema]).resolveSchemaTargets()

		expect(graph.size).toBe(0)
		expect(graph.values()).toStrictEqual([])
		expect(() => {
			// @ts-expect-error -- Runtime graph reads reject forged schema identities.
			graph.get({}, ['target'])
		}).toThrow(
			new TypeError('Schema target source must be created by Schema.define'),
		)
		expect(() => graph.get(schema, [])).toThrow(
			new TypeError('Schema target fieldPath must contain field names'),
		)
		expect(() => graph.get(schema, [''])).toThrow(
			new TypeError('Schema target fieldPath must contain field names'),
		)
	})

	it('resolves configured schemas before plugin setup and infrastructure', async () => {
		const events: string[] = []
		const target = Schema.define({
			className: 'PluginTarget',
			fields: () => ({}),
		})
		const source = Schema.define({
			className: 'PluginSource',
			fields: () => ({ target: targetField(() => target) }),
		})
		const plugin = definePlugin({
			name: 'fixture.schema-observer',
			setup: ({ schemas }) => {
				events.push('setup')
				expect(schemas.schemaTargets.get(source, ['target'])).toBe(target)
			},
			hooks: {
				connect: () => {
					events.push('connect')
				},
			},
		})
		const application = await createApplication({
			schemas: [source, target],
			plugins: [plugin],
		})

		expect(events).toStrictEqual(['setup'])
		expect(application.schemaTargets.get(source, ['target'])).toBe(target)
		await application.start()
		expect(events).toStrictEqual(['setup', 'connect'])
		await application.dispose()
	})

	it('fails target resolution before infrastructure and cleans setup', async () => {
		const events: string[] = []
		const missing = Schema.define({
			className: 'MissingTarget',
			fields: () => ({}),
		})
		const source = Schema.define({
			className: 'FailingSource',
			fields: () => ({ target: targetField(() => missing) }),
		})
		const plugin = definePlugin({
			name: 'fixture.target-failure',
			setup: () => {
				events.push('setup')
			},
			hooks: {
				connect: () => {
					events.push('connect')
				},
				dispose: () => {
					events.push('dispose')
				},
			},
		})
		const application = new FrameworkApplication({
			schemas: [source],
			plugins: [plugin],
		})

		await expect(application.start()).rejects.toMatchObject({
			reason: 'unregistered-target',
			sourceClassName: 'FailingSource',
		})
		expect(events).toStrictEqual([])
	})

	it.concurrent(
		'rejects one shared schema class when its target changes between applications',
		async () => {
			const firstTarget = Schema.define({
				className: 'IsolatedTarget',
				fields: (field) => ({ first: field.string() }),
			})
			const secondTarget = Schema.define({
				className: 'IsolatedTarget',
				fields: (field) => ({ second: field.string() }),
			})
			let currentTarget: SchemaDefinition = firstTarget
			const source = Schema.define({
				className: 'IsolatedSource',
				fields: () => ({ target: targetField(() => currentTarget) }),
			})
			const firstApplication = await createApplication({
				schemas: [source, firstTarget],
				plugins: [],
			})

			currentTarget = secondTarget
			await expect(
				createApplication({
					schemas: [source, secondTarget],
					plugins: [],
				}),
			).rejects.toMatchObject({
				className: 'IsolatedSource',
				reason: 'incompatible-definition',
			})
			expect(firstApplication.schemaTargets.get(source, ['target'])).toBe(
				firstTarget,
			)
			expect(source.fields.target?.options).toStrictEqual({
				onDelete: 'restrict',
			})

			await firstApplication.dispose()
		},
	)
})
