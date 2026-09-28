import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'

import {
	plugin as createPlugin,
	contributeApplication,
} from '../../foundation.js'
import { createApplication } from '../../application/framework-application.js'
import {
	Schema,
	SchemaRegistry,
	stringField,
	type SchemaFields,
} from '../index.js'

describe('deferred schema compilation', () => {
	it('captures field callbacks once and materializes Core fields immediately', async () => {
		const events: string[] = []
		let callbackCalls = 0
		const DeferredPost = Schema.define({
			className: 'DeferredPost',
			fields: (field) => {
				callbackCalls += 1
				events.push('fields')
				return {
					title: field.string({ required: true }),
				}
			},
			indexes: [{ fields: ['title', 'createdAt'] }],
		})
		const observer = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.compiled-schema-observer',
			contributions: [
				contributeApplication(({ schemas }) => {
					const compiledSchema = schemas.get('DeferredPost')
					if (compiledSchema === undefined) {
						throw new TypeError('DeferredPost must be compiled before setup')
					}
					events.push(`setup:${compiledSchema.fields.title?.kind ?? 'missing'}`)
					const exports = undefined
					return { exports }
				}),
			],
		})

		expect(callbackCalls).toBe(1)
		expect(DeferredPost.className).toBe('DeferredPost')
		expect(DeferredPost.fields.title?.kind).toBe('string')
		expect(new DeferredPost({ title: 'Before compilation' }).title).toBe(
			'Before compilation',
		)

		const application = applicationFixture(
			await createApplication({
				plugins: [observer],
				schemas: [DeferredPost],
			}),
		)
		await application.dispose()

		expect(callbackCalls).toBe(1)
		expect(events).toStrictEqual(['fields', 'setup:string'])
		expect(DeferredPost.fields.title?.kind).toBe('string')
		expect(DeferredPost.indexes).toContainEqual({
			fields: ['title', 'createdAt'],
			unique: false,
		})
		expect(new DeferredPost({ title: 'After compilation' }).title).toBe(
			'After compilation',
		)
		await application.dispose()
	})

	it('rejects an invalid callback without affecting prior declarations', () => {
		const First = Schema.define({
			className: 'AtomicFirst',
			fields: (field) => ({ title: field.string() }),
		})
		expect(() =>
			Schema.define({
				className: 'AtomicInvalid',
				fields: () => 'invalid' as unknown as SchemaFields,
			}),
		).toThrow(new TypeError('AtomicInvalid.fields must return a field map'))
		expect(First.fields.title?.kind).toBe('string')
	})

	it('reuses one captured declaration across applications', async () => {
		let callbackCalls = 0
		let incompatible = false
		const Shared = Schema.define({
			className: 'SharedDeferredSchema',
			fields: () => {
				callbackCalls += 1
				return incompatible
					? { changed: stringField() }
					: { title: stringField() }
			},
		})

		const first = applicationFixture(
			await createApplication({ plugins: [], schemas: [Shared] }),
		)
		await first.dispose()
		const canonicalDefinition = Shared.definition
		const second = applicationFixture(
			await createApplication({ plugins: [], schemas: [Shared] }),
		)
		await second.dispose()

		expect(callbackCalls).toBe(1)
		expect(Shared.definition).toBe(canonicalDefinition)

		incompatible = true
		const third = applicationFixture(
			await createApplication({ plugins: [], schemas: [Shared] }),
		)
		await third.dispose()
		expect(callbackCalls).toBe(1)
		expect(Shared.fields).toHaveProperty('title')
		expect(Shared.fields).not.toHaveProperty('changed')

		await first.dispose()
		await second.dispose()
		await third.dispose()
	})

	it('executes one callback once when one registry is compiled repeatedly', () => {
		let callbackCalls = 0
		const Deferred = Schema.define({
			className: 'RepeatedDeferredSchema',
			fields: (field) => {
				callbackCalls += 1
				return { title: field.string() }
			},
		})
		const registry = new SchemaRegistry([Deferred])

		const firstTargets = registry.compileSchemas()
		const secondTargets = registry.compileSchemas()

		expect(callbackCalls).toBe(1)
		expect(secondTargets).toBe(firstTargets)
	})

	it('snapshots callback maps and validates circular targets before publication', () => {
		const leftFields: Record<string, ReturnType<typeof stringField>> = {
			label: stringField(),
		}
		const Left = Schema.define({
			className: 'DeferredLeft',
			fields: (field) => ({
				...leftFields,
				right: field.pointer({ target: 'DeferredRight' }),
			}),
		})
		const Right = Schema.define({
			className: 'DeferredRight',
			fields: (field) => ({
				left: field.pointer({ target: 'DeferredLeft' }),
			}),
		})
		const registry = new SchemaRegistry([Left, Right])

		expect(() => Left.fields).toThrow(
			expect.objectContaining({ reason: 'not-compiled' }),
		)
		const targets = registry.compileSchemas()
		leftFields.changed = stringField()

		expect(targets.get(Left, ['right'])).toBe(Right)
		expect(targets.get(Right, ['left'])).toBe(Left)
		expect(Left.fields).toHaveProperty('label')
		expect(Left.fields).not.toHaveProperty('changed')
		expect(Object.isFrozen(Left.fields)).toBe(true)
	})

	it('rejects an unregistered named target with its declared schema name', () => {
		const Source = Schema.define({
			className: 'NamedTargetSource',
			fields: (field) => ({
				target: field.pointer({ target: 'MissingNamedTarget' }),
			}),
		})

		expect(() => new SchemaRegistry([Source]).compileSchemas()).toThrow(
			expect.objectContaining({
				fieldPath: ['target'],
				reason: 'unregistered-target',
				targetClassName: 'MissingNamedTarget',
			}),
		)
	})

	it('keeps object-shaped field maps as temporary immediate compatibility', () => {
		const Legacy = Schema.define({
			className: 'LegacyImmediateSchema',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
		})

		expect(Legacy.fields.title?.kind).toBe('string')
		expect(new Legacy({ title: 'Still supported' }).title).toBe(
			'Still supported',
		)
	})
})
