import { describe, expect, it } from 'vitest'

import { createApplication, Schema, type FieldBuilder } from '@ultimabase/core'

import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
	vectorField,
	vectorFieldKind,
} from '../src/index.js'

type VectorFieldBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const vectorBuilder = (field: FieldBuilder): VectorFieldBuilder =>
	field as VectorFieldBuilder

describe('pg-vector FieldBuilder method', () => {
	it('creates the same immutable logical field as vectorField', async () => {
		let declarations = 0
		const Document = Schema.define({
			className: 'VectorBuilderDocument',
			fields: (field) => {
				declarations += 1
				return {
					embedding: vectorBuilder(field).vector({
						dimensions: 3,
						validation: { required: true },
					}),
				}
			},
		})

		expect(declarations).toBe(1)
		const application = await createApplication({
			plugins: [pgVectorPlugin()],
			schemas: [Document],
		})
		const embedding = Document.fields.embedding
		if (embedding === undefined) {
			throw new TypeError('Expected the generated vector field')
		}
		const expected = vectorField({
			dimensions: 3,
			validation: { required: true },
		})

		expect(declarations).toBe(1)
		expect(embedding).toStrictEqual(expected)
		expect(embedding.kind).toBe(vectorFieldKind)
		expect(embedding.options).toMatchObject({ dimensions: 3 })
		expect(Object.isFrozen(embedding)).toBe(true)
		expect(application.fieldBuilderMethods).toStrictEqual([
			expect.objectContaining({
				fieldKind: vectorFieldKind,
				name: 'vector',
				owner: 'pg-vector',
				typegen: {
					methodType: 'VectorFieldBuilderMethod',
					module: '@ultimabase/pg-vector-plugin',
					valueType: 'VectorValue',
				},
			}),
		])
	})

	it('reports a missing plugin before the schema can compile', async () => {
		const Missing = Schema.define({
			className: 'MissingVectorBuilderPlugin',
			fields: (field) => ({
				// The generated-like cast simulates stale output after plugin removal.
				embedding: vectorBuilder(field).vector({ dimensions: 3 }),
			}),
		})

		await expect(
			createApplication({ plugins: [], schemas: [Missing] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'MissingVectorBuilderPlugin.fields.embedding FieldBuilder method "vector" is unavailable; configure the plugin that declares it',
				),
			}),
		)
	})

	it('keeps vector option validation on the existing factory', async () => {
		const Invalid = Schema.define({
			className: 'InvalidVectorBuilderOptions',
			fields: (field) => ({
				embedding: vectorBuilder(field).vector({ dimensions: 0 }),
			}),
		})

		await expect(
			createApplication({
				plugins: [pgVectorPlugin()],
				schemas: [Invalid],
			}),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new RangeError('dimensions must be a positive safe integer'),
			}),
		)
	})

	it('removes the runtime method from an application without the plugin', async () => {
		const Empty = Schema.define({
			className: 'VectorlessBuilderApplication',
			fields: (field) => ({
				title: field.string(),
			}),
		})
		const application = await createApplication({
			plugins: [],
			schemas: [Empty],
		})

		expect(application.fieldBuilderMethods).toStrictEqual([])
	})
})
