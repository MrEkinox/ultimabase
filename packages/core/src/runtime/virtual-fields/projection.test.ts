import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../../schema/index.js'
import { prepareRuntimeVirtualFieldProjection } from './projection.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

describe('Runtime virtual field projection', () => {
	it('keeps logical relations out of the private persisted selection', () => {
		const Target = UltimaBase.Schema.define({
			className: 'VirtualProjectionTarget',
			fields: (field) => ({ name: field.string() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'VirtualProjectionSource',
			fields: (field) => ({
				title: field.string(),
				targets: field.relation({ target: 'VirtualProjectionTarget' }),
				headline: field.virtual({
					output: (output) => output.string(),
					resolve: ({ item }) => String(item.title),
					select: { title: true },
				}),
			}),
		})
		new SchemaRegistry([Target, Source]).resolveSchemaTargets()
		const operation = {
			kind: 'find-one' as const,
			query: new QueryBuilder(Source).ast,
		}

		const projection = prepareRuntimeVirtualFieldProjection(operation)

		expect(
			projection?.persistedSelection.fields.map(({ field }) => field),
		).toStrictEqual(['title', 'id', 'createdAt', 'updatedAt'])
		expect(projection?.publicPersistedFields).toStrictEqual([
			'title',
			'id',
			'createdAt',
			'updatedAt',
		])
		expect(projection?.virtualFields.map(({ name }) => name)).toStrictEqual([
			'headline',
		])
	})
})
