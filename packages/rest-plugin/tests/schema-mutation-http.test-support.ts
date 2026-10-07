import { immutableRecord } from '@ultimabase/shared'
import {
	createPreparedUpdateTestOperation,
	PreparedMutationTestAdapter,
} from '../../../tooling/vitest/prepared-mutation-adapter.js'

export const schemaMutationRestId = '0199325a-0c00-7000-8000-000000000266'

const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationRestId,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

/** Records whether malformed requests reach persistence. */
export class RestSchemaMutationAdapter extends PreparedMutationTestAdapter {
	constructor(trace: string[]) {
		super({
			description: 'REST schema mutation fixture',
			prepare: (request) =>
				createPreparedUpdateTestOperation(request, {
					current: currentRow,
					description: 'REST schema mutation fixture',
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
