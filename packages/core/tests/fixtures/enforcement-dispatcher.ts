import {
	QueryBuilder,
	type CreateOneOperationAst,
} from '../../src/query/index.js'
import { Schema } from '../../src/schema/index.js'
import {
	RequestContext,
	requestSources,
} from '../../src/runtime/context/request-context.js'
import type { RuntimeEnforcementStages } from '../../src/runtime/pipeline/contracts.js'

export const articleSchema = Schema.define({
	className: 'EnforcedArticle',
	fields: (field) => ({
		secret: field.string(),
		title: field.string({ required: true }),
	}),
})

export const foreignSchema = Schema.define({
	className: 'ForeignEnforcedArticle',
	fields: (field) => ({ title: field.string() }),
})

export const context = RequestContext.anonymous({
	requestId: 'enforcement-dispatcher',
	source: requestSources.internal,
})

export const runtimeConstrainPrivileges = [
	{
		name: 'runtime:constrain',
		reason: 'Registers enforcement contributions for Runtime tests.',
	},
] as const

export const createOperation = (
	input: CreateOneOperationAst<typeof articleSchema>['input'] = {
		title: 'Allowed',
	},
): CreateOneOperationAst<typeof articleSchema> => ({
	input,
	kind: 'create-one',
	selection: { fields: [], kind: 'selection' },
	schema: new QueryBuilder(articleSchema).ast.schema,
})

export const requireEnforcementStages = (
	stages: RuntimeEnforcementStages | undefined,
): RuntimeEnforcementStages => {
	if (stages === undefined) {
		throw new TypeError('Expected fixture enforcement stages')
	}

	return stages
}
