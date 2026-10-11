import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import { enforceOperationRestrictions } from './operation-restrictions.js'
import { createEnforcementState, narrowEnforcementFields } from './state.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

const schema = UltimaBase.Schema.define({
	className: 'ScalarSelectionRestriction',
	fields: (field) => ({ title: field.string() }),
})

const context = RequestContext.anonymous({
	requestId: 'scalar-selection-restriction',
	source: requestSources.internal,
})

describe('enforceOperationRestrictions', () => {
	it.each(['count', 'exists'] as const)(
		'leaves %s queries free of record selection fields',
		(kind) => {
			const operation = { kind, query: new QueryBuilder(schema).ast } as const
			const enforcement = narrowEnforcementFields(
				createEnforcementState(),
				'selection',
				['title'],
			)

			const restricted = enforceOperationRestrictions({
				context,
				enforcement,
				operation,
			})

			expect(restricted.operation).toBe(operation)
			expect(restricted.operation.query.selection.fields).toStrictEqual([])
		},
	)
})
