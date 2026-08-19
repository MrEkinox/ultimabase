import { expectTypeOf, test } from 'vitest'

import { Schema } from '../schema/index.js'
import { guard } from './enforcement/definitions.js'
import {
	afterOperation,
	beforeOperation,
	postCommitEvent,
} from './hooks/definitions.js'
import { RuntimePipeline } from './pipeline/runtime-pipeline.js'
import type { RuntimePipelineStages } from './pipeline/contracts.js'
import {
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	provideRuntimeObserver,
	replaceRuntime,
} from './capabilities.js'

const schema = Schema.define({
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

	provideRuntimeObserver({
		contributionId: 'committed-create',
		create: () => ({
			value: postCommitEvent({
				handler: ({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'create-one'>()
				},
				operations: ['create-one'],
				schema,
			}),
		}),
	})

	replaceRuntime({
		contributionId: 'typed-replacement',
		create: () => ({
			value: (stages) => {
				expectTypeOf(stages).toEqualTypeOf<Readonly<RuntimePipelineStages>>()
				return new RuntimePipeline(stages)
			},
		}),
	})
})

test('keeps transforming hooks out of the observer facade', () => {
	provideRuntimeObserver({
		contributionId: 'invalid-observer',
		create: () => ({
			// @ts-expect-error Observers cannot return or replace an execution result.
			value: afterOperation({
				handler: ({ result }) => ({ result }),
			}),
		}),
	})
})
