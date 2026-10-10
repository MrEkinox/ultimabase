import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

const schema = UltimaBase.Schema.define({
	className: 'PersistenceAdapterSupport',
	fields: (field) => ({ title: field.string() }),
})
const operation = {
	kind: 'find-many',
	query: new QueryBuilder(schema).ast,
} as const
const context = RequestContext.anonymous({
	requestId: 'persistence-adapter-support',
	source: requestSources.internal,
})

const createPipeline = (executor: DatabaseOperationExecutor) =>
	new RuntimePipeline({
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		finalMutationValidation: (input) => input.operation,
		databaseOperation: executor,
		commit: () => undefined,
	} satisfies RuntimePipelineStages)

const unreachableExecute = <const TOperation extends DatabaseOperationAst>(
	request: DatabaseOperationRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	void request
	return Promise.reject(new TypeError('Adapter execution must not be reached'))
}

describe('persistence adapter support', () => {
	it('fails before adapter execution when support is absent or incompatible', async () => {
		await expect(
			createPipeline({ execute: unreachableExecute }).execute({
				context,
				operation,
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_PROTOCOL_INCOMPATIBLE',
			internalDetails: {
				kind: 'persistence-plan-capability-missing',
				planKind: 'find-many',
				protocolVersion: 2,
			},
		})

		const incompatible: DatabaseOperationExecutor = {
			capabilities: {
				persistencePlans: {
					kind: 'persistence-plans',
					kinds: ['find-many'],
					version: 1,
				} as never,
			},
			execute: unreachableExecute,
		}
		await expect(
			createPipeline(incompatible).execute({ context, operation }),
		).rejects.toMatchObject({ code: 'PLUGIN_PROTOCOL_INCOMPATIBLE' })
	})
})
