import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { QueryBuilder } from './query.js'

// Regression: `build()` copied selections and inclusions with plain assignment
// (`selection[field] = true`), so a declared `__proto__` field hit the
// inherited setter and vanished from the emitted query input.

const protoField = '__proto__'

const ProtoTarget = UltimaBase.Schema.define({
	className: 'QueryBuildProtoTarget',
	fields: (field) => ({ name: field.string() }),
})

const ProtoSource = UltimaBase.Schema.define({
	className: 'QueryBuildProtoSource',
	fields: (field) => ({
		[protoField]: field.pointer({ target: 'QueryBuildProtoTarget' }),
		title: field.string(),
	}),
})

new SchemaRegistry([ProtoSource, ProtoTarget]).resolveSchemaTargets()

const readOwnValue = (record: object, key: string): unknown =>
	Object.getOwnPropertyDescriptor(record, key)?.value

describe('QueryBuilder.build with a declared __proto__ field', () => {
	it('keeps the __proto__ selection and inclusion as own keys', () => {
		const selected = new QueryBuilder(ProtoSource)
			.select({ [protoField]: true, title: true })
			.build()
		const included = new QueryBuilder(ProtoSource)
			.include(protoField, (query) => query.select({ name: true }))
			.build()

		expect(selected.select).toBeDefined()
		expect(readOwnValue(selected.select ?? {}, protoField)).toBe(true)
		expect(included.include).toBeDefined()
		expect(readOwnValue(included.include ?? {}, protoField)).toStrictEqual({
			select: { id: true, name: true },
		})
	})
})
