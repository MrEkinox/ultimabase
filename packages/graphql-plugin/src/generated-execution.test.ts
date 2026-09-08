import {
	RequestContext,
	Schema,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import type { GraphQLResolveInfo } from 'graphql'
import { describe, expect, it } from 'vitest'

import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { defaultGraphqlExecutionLimits } from './connection-limits.js'
import { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlOperationExecution } from './operation-execution.js'
import { graphqlOperationProtocol } from './protocol.js'

const Parent = Schema.define({
	className: 'QueryCountParent',
	fields: (field) => ({
		children: field.relation({ target: 'QueryCountChild' }),
	}),
})
const Child = Schema.define({
	className: 'QueryCountChild',
	fields: (field) => ({ label: field.string() }),
})

describe('GraphQL generated execution', () => {
	it('resolves every parent relation from Core eager inclusion with zero follow-up reads', async () => {
		let readCount = 0
		const executor = {
			runWithContext: <TContext extends RequestContext, TResult>(
				context: TContext,
				callback: (value: TContext) => TResult,
			): TResult => callback(context),
			executeRead: (): Promise<never> => {
				readCount += 1
				return Promise.reject(new TypeError('Unexpected relation read'))
			},
		} as unknown as ApplicationRequestExecutor
		const callbacks: ApplicationCallbackExecutor = {
			runApplication: (callback) => callback(),
			runPlugin: (_owner, callback) => callback(),
		}
		const connections = new GraphqlConnectionRuntime(
			defaultGraphqlExecutionLimits,
		)
		const operations = new GraphqlOperationExecution({
			operations: [],
			transport: graphqlOperationProtocol,
		})
		const execution = new GraphqlGeneratedExecution({
			callbacks,
			connections,
			executor,
			operations,
			owner: { pluginId: '@ultimabase/graphql-plugin' },
		})
		const resolver = execution.relation(
			Parent,
			'children',
			Child,
			'QueryCountChild',
		)
		const request = RequestContext.anonymous({
			requestId: 'relation-query-count',
			source: 'test',
		})
		const parents = [
			{ children: [{ id: 'child-1', label: 'one' }] },
			{ children: [{ id: 'child-2', label: 'two' }] },
		]

		const results = await Promise.all(
			parents.map((parent) =>
				resolver(parent, { first: 10 }, { request }, {} as GraphQLResolveInfo),
			),
		)
		expect(results).toEqual([
			expect.objectContaining({ nodes: parents[0]?.children }),
			expect.objectContaining({ nodes: parents[1]?.children }),
		])
		expect(readCount).toBe(0)
		connections.dispose()
		operations.dispose()
	})
})
