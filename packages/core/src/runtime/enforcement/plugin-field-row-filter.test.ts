import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { QueryBuilder, type FindManyOperationAst } from '../../query/index.js'
import { definePluginField, Schema } from '../../schema/index.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { RuntimeCallbackExecutor } from '../contributions/execution.js'
import type { DatabaseRowFilterNode } from '../database/contracts.js'
import {
	evaluateEnforcementContributions,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import {
	getProtectedPolicyImplementation,
	protectedPolicy,
} from './protected-policy.js'
import { getEnforcementStateSnapshot } from './state.js'

const containedField = definePluginField(
	'fixture.policy.contained',
	{},
	{
		snapshotValue: (value: unknown) => value,
		storageCodec: {
			decode: (value) => value,
			encode: (value) => value,
			format: 'json',
			version: 1,
		},
		structuralContains: {
			snapshotOperand: (value: unknown) => {
				if (!isPlainRecord(value) || typeof value.prefix !== 'string') {
					throw new TypeError('policy containment must contain a prefix')
				}
				return value
			},
		},
	},
)

const fixtureSchema = Schema.define({
	className: 'PluginContainmentPolicyFixture',
	fields: () => ({ containedField }),
})
const operation = {
	kind: 'find-many',
	query: new QueryBuilder(fixtureSchema).ast,
} satisfies FindManyOperationAst<typeof fixtureSchema>
const context = RequestContext.anonymous({
	requestId: 'plugin-containment-policy',
	source: requestSources.internal,
})

const createOwnedPolicy = (
	rowFilter: DatabaseRowFilterNode,
): OwnedEnforcementContribution => {
	const definition = protectedPolicy({
		evaluate: () => ({ rowFilter }),
		operations: ['find-many'],
		schema: fixtureSchema,
	})
	const implementation = getProtectedPolicyImplementation(definition)

	if (implementation === undefined) {
		throw new TypeError('Expected a protected policy implementation')
	}

	return immutableRecord({
		contribution: immutableRecord({
			name: 'fixture.plugin-containment-policy',
			ownerPlugin: 'fixture.policy-plugin',
			value: definition,
		}),
		implementation,
	})
}

const containmentLeaf = (value: unknown): DatabaseRowFilterNode =>
	immutableRecord({
		field: 'containedField',
		kind: 'contains',
		value,
	})

describe('protected plugin field containment row filters', () => {
	it('revalidates, detaches, and freezes the policy operand', async () => {
		const operand = { prefix: 'visible', nested: { enabled: true } }
		const state = await evaluateEnforcementContributions(
			[createOwnedPolicy(containmentLeaf(operand))],
			new RuntimeCallbackExecutor(),
			{ context, operation },
		)

		operand.prefix = 'changed'
		operand.nested.enabled = false
		const rowFilter = getEnforcementStateSnapshot(state).rowFilter

		expect(rowFilter).toStrictEqual({
			field: 'containedField',
			kind: 'contains',
			value: { prefix: 'visible', nested: { enabled: true } },
		})
		expect(Object.isFrozen(rowFilter)).toBe(true)
		expect(
			Object.isFrozen(
				(rowFilter as unknown as { value: { nested: object } }).value.nested,
			),
		).toBe(true)
	})

	it('rejects a forged policy operand through the field owner snapshot', async () => {
		await expect(
			evaluateEnforcementContributions(
				[createOwnedPolicy(containmentLeaf({ prefix: 42 }))],
				new RuntimeCallbackExecutor(),
				{ context, operation },
			),
		).rejects.toThrow('policy containment must contain a prefix')
	})
})
