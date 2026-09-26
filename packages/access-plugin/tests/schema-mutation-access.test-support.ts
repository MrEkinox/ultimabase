import { immutableRecord } from '@ultimabase/shared'
import {
	createPreparedUpdateTestOperation,
	PreparedMutationTestAdapter,
} from '../../../tooling/vitest/prepared-mutation-adapter.js'

export const schemaMutationAccessId = '0199325a-0c00-7000-8000-000000000260'
const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationAccessId,
	secret: 'private',
	title: 'visible',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

/** Records each automatic transaction and prepared target restriction. */
export class SchemaMutationAdapter extends PreparedMutationTestAdapter {
	constructor() {
		super({
			description: 'Schema mutation fixture',
			prepare: (request) =>
				createPreparedUpdateTestOperation(request, {
					current: currentRow,
					description: 'Schema mutation fixture',
					previous: previousRow,
					result: immutableRecord({
						id: currentRow.id,
						secret: currentRow.secret,
						title: currentRow.title,
						workflowState: currentRow.workflowState,
					}),
				}),
		})
	}
}
