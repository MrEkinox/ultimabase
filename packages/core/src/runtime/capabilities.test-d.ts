import { expectTypeOf, test } from 'vitest'

import { guard } from './enforcement/definitions.js'
import { afterOperation, beforeOperation } from './contributions/definitions.js'
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
		contributionId: 'before-create',
		create: () => ({
			value: beforeOperation({
				handler: ({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'create-one'>()
				},
				operations: ['create-one'],
				schema,
			}),
		}),
	})

	provideRuntimeInterceptor({
		contributionId: 'after-find',
		create: () => ({
			value: afterOperation({
				handler: ({ operation, result }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'find-many'>()
					expectTypeOf(result).toExtend<readonly unknown[]>()
					return { result }
				},
				operations: ['find-many'],
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
