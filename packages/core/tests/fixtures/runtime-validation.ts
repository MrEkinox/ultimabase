import { QueryBuilder } from '../../src/query/index.js'
import { SchemaRegistry } from '../../src/schema/index.js'
import { vi } from 'vitest'
import {
	RequestContext,
	requestSources,
} from '../../src/runtime/context/request-context.js'
import type { DatabaseOperationAst } from '../../src/runtime/database/contracts.js'
import type { createRuntimeValidationStage } from '../../src/runtime/validation/runtime-validation.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'

export const runtimeDefault = vi.fn(() => 42)
export const binaryDefault = new Uint8Array([1, 2, 3])
export const validationSchema = UltimaBase.Schema.define({
	className: 'RuntimeValidation',
	fields: (field) => ({
		title: field.string({ required: true }),
		immutableCode: field.string({
			indexed: 'unique',
			immutable: true,
			required: true,
		}),
		note: field.string(),
		sequence: field.int({ default: runtimeDefault }),
		state: field.string({ default: 'draft' }),
		payload: field.binary({ default: binaryDefault }),
		score: field.int(),
		serial: field.int({
			autoIncrement: true,
			required: true,
		}),
		day: field.date({ autoNow: true, required: true }),
		localTime: field.time({ autoNow: true }),
		zonedTime: field.time({ autoNow: true, timezone: true }),
		localMoment: field.dateTime({ autoNow: true, timezone: false }),
		zonedMoment: field.dateTime({ autoNow: true }),
		profile: field.object({
			required: true,
			fields: (field) => ({
				name: field.string({ required: true }),
				level: field.int({ default: 1 }),
			}),
		}),
		items: field.object({
			list: true,
			fields: (field) => ({
				label: field.string({ required: true }),
			}),
		}),
	}),
})
export const schemaNode = new QueryBuilder(validationSchema).ast.schema
export const relationValidationTarget = UltimaBase.Schema.define({
	className: 'RuntimeRelationValidationTarget',
	fields: () => ({}),
})
export const relationValidationSource = UltimaBase.Schema.define({
	className: 'RuntimeRelationValidationSource',
	fields: (field) => ({
		targets: field.relation({ target: 'RuntimeRelationValidationTarget' }),
	}),
})
new SchemaRegistry([
	relationValidationTarget,
	relationValidationSource,
]).resolveSchemaTargets()
export const requestContext = RequestContext.anonymous({
	requestId: 'runtime-validation',
	source: requestSources.internal,
})

export const validCreateInput = () => ({
	title: 'Valid title',
	immutableCode: 'public-code',
	profile: { name: 'Ada' },
	items: [{ label: 'first' }],
})

export const executeStage = async <
	const TOperation extends DatabaseOperationAst,
>(
	stage: ReturnType<typeof createRuntimeValidationStage>,
	operation: TOperation,
	context: RequestContext = requestContext,
): Promise<TOperation> => stage({ context, operation })
