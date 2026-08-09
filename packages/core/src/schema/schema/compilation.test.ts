import { describe, expect, it } from 'vitest'

import { createApplication, definePlugin } from '../../foundation.js'
import {
	pointerField,
	Schema,
	SchemaCompilationError,
	SchemaRegistry,
	stringField,
	type SchemaDefinition,
	type SchemaFields,
} from '../index.js'

describe('deferred schema compilation', () => {
	it('keeps field callbacks unresolved until application compilation', async () => {
		const events: string[] = []
		let callbackCalls = 0
		const DeferredPost = Schema.define({
			className: 'DeferredPost',
			fields: () => {
				callbackCalls += 1
				events.push('fields')

				return {
					title: stringField({ validation: { required: true } }),
				}
			},
			indexes: [{ fields: ['title', 'createdAt'] }],
		})
		const observer = definePlugin({
			name: 'fixture.compiled-schema-observer',
			setup: ({ schemas }) => {
				const compiledSchema = schemas.get('DeferredPost')

				if (compiledSchema === undefined) {
					throw new TypeError('DeferredPost must be compiled before setup')
				}

				events.push(`setup:${compiledSchema.fields.title?.kind ?? 'missing'}`)
			},
		})

		expect(callbackCalls).toBe(0)
		expect(DeferredPost.className).toBe('DeferredPost')
		expect(() => DeferredPost.fields).toThrow(
			expect.objectContaining({
				code: 'SCHEMA_COMPILATION_FAILED',
				reason: 'not-compiled',
			}),
		)
		expect(() => new DeferredPost({ title: 'Before compilation' })).toThrow(
			SchemaCompilationError,
		)

		const application = await createApplication({
			plugins: [observer],
			schemas: [DeferredPost],
		})

		expect(callbackCalls).toBe(1)
		expect(events).toStrictEqual(['fields', 'setup:string'])
		expect(DeferredPost.fields.title.kind).toBe('string')
		expect(DeferredPost.indexes).toContainEqual({
			fields: ['title', 'createdAt'],
			unique: false,
		})
		expect(new DeferredPost({ title: 'After compilation' }).title).toBe(
			'After compilation',
		)
		await application.dispose()
	})

	it('publishes no partial schema when another callback fails', async () => {
		const First = Schema.define({
			className: 'AtomicFirst',
			fields: () => ({ title: stringField() }),
		})
		const Invalid = Schema.define({
			className: 'AtomicInvalid',
			fields: () => 'invalid' as unknown as SchemaFields,
		})

		await expect(
			createApplication({ plugins: [], schemas: [First, Invalid] }),
		).rejects.toMatchObject({
			className: 'AtomicInvalid',
			reason: 'invalid-result',
		})
		expect(() => First.definition).toThrow(
			expect.objectContaining({ reason: 'not-compiled' }),
		)
	})

	it('recompiles a shared class per application and rejects incompatible results', async () => {
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

		const first = await createApplication({ plugins: [], schemas: [Shared] })
		const canonicalDefinition = Shared.definition
		const second = await createApplication({ plugins: [], schemas: [Shared] })

		expect(callbackCalls).toBe(2)
		expect(Shared.definition).toBe(canonicalDefinition)

		incompatible = true
		await expect(
			createApplication({ plugins: [], schemas: [Shared] }),
		).rejects.toMatchObject({
			className: 'SharedDeferredSchema',
			reason: 'incompatible-definition',
		})
		expect(callbackCalls).toBe(3)
		expect(Shared.fields).toHaveProperty('title')
		expect(Shared.fields).not.toHaveProperty('changed')

		await first.dispose()
		await second.dispose()
	})

	it('executes one callback once when one registry is compiled repeatedly', () => {
		let callbackCalls = 0
		const Deferred = Schema.define({
			className: 'RepeatedDeferredSchema',
			fields: () => {
				callbackCalls += 1

				return { title: stringField() }
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
		const Left: SchemaDefinition = Schema.define({
			className: 'DeferredLeft',
			fields: () => ({
				...leftFields,
				right: pointerField({ target: () => Right }),
			}),
		})
		const Right: SchemaDefinition = Schema.define({
			className: 'DeferredRight',
			fields: () => ({
				left: pointerField({ target: () => Left }),
			}),
		})
		const registry = new SchemaRegistry([Left, Right])

		const targets = registry.compileSchemas()
		leftFields.changed = stringField()

		expect(targets.get(Left, ['right'])).toBe(Right)
		expect(targets.get(Right, ['left'])).toBe(Left)
		expect(Left.fields).toHaveProperty('label')
		expect(Left.fields).not.toHaveProperty('changed')
		expect(Object.isFrozen(Left.fields)).toBe(true)
	})

	it('keeps object-shaped field maps as temporary immediate compatibility', () => {
		const Legacy = Schema.define({
			className: 'LegacyImmediateSchema',
			fields: { title: stringField({ validation: { required: true } }) },
		})

		expect(Legacy.fields.title.kind).toBe('string')
		expect(new Legacy({ title: 'Still supported' }).title).toBe(
			'Still supported',
		)
	})
})
