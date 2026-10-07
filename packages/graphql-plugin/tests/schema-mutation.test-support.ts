import { immutableRecord } from '@ultimabase/shared'
import {
	createPreparedUpdateTestOperation,
	PreparedMutationTestAdapter,
} from '../../../tooling/vitest/prepared-mutation-adapter.js'

export const graphqlSchemaMutationId = '0199325a-0c00-7000-8000-000000000267'

const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: graphqlSchemaMutationId,
	title: 'GraphQL release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

/** Records schema-mutation persistence without implementing an unrelated query. */
export class GraphqlSchemaMutationAdapter extends PreparedMutationTestAdapter {
	constructor(trace: string[]) {
		super({
			description: 'GraphQL schema mutation fixture',
			prepare: (request) =>
				createPreparedUpdateTestOperation(request, {
					current: currentRow,
					description: 'GraphQL schema mutation fixture',
					previous: previousRow,
					result: immutableRecord({
						id: currentRow.id,
						title: currentRow.title,
						workflowState: currentRow.workflowState,
					}),
					trace,
				}),
			trace,
		})
	}
}
