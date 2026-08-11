import { createApplication, definePlugin } from '../../foundation.js'
import { QueryBuilder } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'
import { constraint, databaseConstraint } from './definitions.js'
import { createEnforcementStages } from './dispatcher.js'

const leafSchema = Schema.define({
	className: 'RelationEnforcementLeaf',
	fields: (field) => ({ visible: field.boolean() }),
	access: { read: { where: { visible: { eq: true } } } },
})

const targetSchema = Schema.define({
	className: 'RelationEnforcementTarget',
	fields: (field) => ({
		children: field.relation({ target: 'RelationEnforcementLeaf' }),
		visible: field.boolean(),
	}),
	access: { read: { where: { visible: { eq: true } } } },
})

const sourceSchema = Schema.define({
	className: 'RelationEnforcementSource',
	fields: (field) => ({
		deniedTargets: field.relation({
			access: { read: false },
			target: 'RelationEnforcementTarget',
		}),
		targets: field.relation({ target: 'RelationEnforcementTarget' }),
	}),
})

const context = RequestContext.anonymous({
	requestId: 'relation-enforcement',
	source: requestSources.internal,
})

const requireStages = (
	stages: RuntimeEnforcementStages | undefined,
): RuntimeEnforcementStages => {
	if (stages === undefined) {
		throw new TypeError('Expected relation enforcement stages')
	}

	return stages
}

const policyPlugin = definePlugin({
	name: 'fixture.relation-enforcement',
	setup: ({ registries }) => {
		registries.hooks.register(
			'target-constraint',
			constraint({
				handler: () => databaseConstraint('fixture.target-visibility', 1, {}),
				schema: targetSchema,
			}),
		)
		registries.hooks.register(
			'leaf-constraint',
			constraint({
				handler: () => databaseConstraint('fixture.leaf-visibility', 1, {}),
				schema: leafSchema,
			}),
		)
	},
})

describe('relation enforcement planning', () => {
	it('retains nested target Access and constraints for quantifiers and filtered counts', async () => {
		const application = await createApplication({
			plugins: [policyPlugin],
			schemas: [sourceSchema, targetSchema, leafSchema],
		})
		const stages = requireStages(createEnforcementStages(application))
		const nestedTargetWhere = {
			children: { some: { visible: { eq: true } } },
		} as const
		const operations = [
			{
				kind: 'find-many',
				query: new QueryBuilder(sourceSchema).where({
					targets: { some: nestedTargetWhere },
				}).ast,
			},
			{
				kind: 'find-many',
				query: new QueryBuilder(sourceSchema).where({
					targets: { count: { where: nestedTargetWhere, gte: 1 } },
				}).ast,
			},
		] as const

		for (const operation of operations) {
			const enforcement = await stages.evaluate({ context, operation })
			const enforced = await stages.enforceOperation({
				context,
				enforcement,
				operation,
			})
			const scopes = enforced.relationPredicates ?? []

			expect(scopes).toHaveLength(2)
			expect(scopes[0]).toMatchObject({
				constraints: [{ kind: 'fixture.target-visibility', version: 1 }],
				predicate: { field: 'targets' },
				rowFilter: { field: 'visible', kind: 'equal', value: true },
			})
			expect(scopes[1]).toMatchObject({
				constraints: [{ kind: 'fixture.leaf-visibility', version: 1 }],
				predicate: { field: 'children', kind: 'relation-predicate' },
				rowFilter: { field: 'visible', kind: 'equal', value: true },
			})
		}

		await application.dispose()
	})

	it('enforces source relation-field filtering before target planning', async () => {
		const application = await createApplication({
			plugins: [],
			schemas: [sourceSchema, targetSchema, leafSchema],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(sourceSchema).where({
				deniedTargets: { some: {} },
			}).ast,
		} as const

		await expect(stages.evaluate({ context, operation })).rejects.toMatchObject(
			{
				code: 'PERMISSION_DENIED',
			},
		)
		await application.dispose()
	})
})
