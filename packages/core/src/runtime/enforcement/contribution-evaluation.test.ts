import { describe, expect, it } from 'vitest'

import { normalizeEnforcementRestrictedFields } from './contribution-evaluation.js'
import { UltimaBase } from '../application/ultima-base.js'

const schema = UltimaBase.Schema.define({
	className: 'EnforcementVirtualField',
	fields: (field) => ({
		label: field.virtual({
			output: (output) => output.string(),
			resolve: ({ item }) => String(item.title),
			select: { title: true },
		}),
		title: field.string(),
	}),
})

const contribution = {
	name: 'fixture.virtual-field-policy',
	ownerPlugin: 'fixture.policy',
	value: undefined,
}

describe('normalizeEnforcementRestrictedFields', () => {
	it('accepts virtual fields only at the logical selection boundary', () => {
		expect(
			normalizeEnforcementRestrictedFields(
				['label', 'title'],
				schema,
				contribution,
				'selection',
			),
		).toStrictEqual(['label', 'title'])
		expect(() =>
			normalizeEnforcementRestrictedFields(
				['label'],
				schema,
				contribution,
				'input',
			),
		).toThrow('returned an unknown schema field')
	})
})
