import { expectTypeOf, test } from 'vitest'

import { guard } from './enforcement/definitions.js'
import { preparedOperation } from './contributions/definitions.js'
import {
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
} from './capabilities.js'
import { UltimaBase } from './application/ultima-base.js'

const schema = UltimaBase.Schema.define({
	className: 'RuntimeCapabilityTypes',
	fields: (field) => ({ title: field.string() }),
})

test('retains exact operation correlation through every public Runtime facade', () => {
	provideRuntimeInterceptor({
		contributionId: 'prepared-update',
		create: () => ({
			value: preparedOperation({
				handler: ({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'update-one'>()
					return { operation }
				},
				schema,
			}),
		}),
	})

	provideRuntimeConstraint({
		contributionId: 'create-guard',
		create: () => ({
			value: guard({
				handler: ({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'create-one'>()
				},
				operations: ['create-one'],
				schema,
			}),
		}),
	})
})
