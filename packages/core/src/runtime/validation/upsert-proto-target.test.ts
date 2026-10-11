import { describe, expect, it } from 'vitest'

import {
	normalizeUpdateExpression,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { createRuntimeValidationStage } from './runtime-validation.js'
import { executeStage } from '../../../tests/fixtures/runtime-validation.js'
import { QueryBuilder } from '../../plugin.js'

// Regression: unique upsert target values were copied with plain assignment
// (`values[fieldName] = value`). For a declared `__proto__` field the write hit
// the inherited setter, so the target value vanished and validation reported
// the field as missing. Target values are copied as ordinary own keys.

const protoField = '__proto__'

const ProtoTargetItem = UltimaBase.Schema.define({
	className: 'RuntimeUpsertProtoTargetItem',
	fields: (field) => ({
		[protoField]: field.string({ indexed: 'unique', required: true }),
		title: field.string(),
	}),
})

describe('unique upsert targets keyed by a __proto__ field', () => {
	it('seeds the create candidate with the own __proto__ target value', async () => {
		const query = new QueryBuilder(ProtoTargetItem).where((where) =>
			where.eq(protoField, 'key'),
		)
		const update = normalizeUpdateExpression(ProtoTargetItem, {
			title: 'updated',
		})
		const operation = {
			kind: 'upsert-one',
			query: query.ast,
			target: { kind: 'unique-upsert-target', fields: [protoField] },
			create: { title: 'created' },
			update,
		} as unknown as UpsertOneOperationAst<typeof ProtoTargetItem, typeof update>

		const normalized = await executeStage(
			createRuntimeValidationStage(),
			operation,
		)

		expect(
			Object.getOwnPropertyDescriptor(normalized.create, protoField)?.value,
		).toBe('key')
		expect(Object.getPrototypeOf(normalized.create)).toBe(Object.prototype)
	})
})
