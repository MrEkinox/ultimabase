import { expectTypeOf, test } from 'vitest'

import {
	defineOperationTransport,
	type ApplicationOperationTransportPlanner,
	type ApplicationSchemaMutationTransportPlan,
} from '../../index.js'

const protocol = defineOperationTransport({
	name: 'fixture.schema-mutation-planning.typed',
	version: '1.0.0',
})
declare const planner: ApplicationOperationTransportPlanner

test('preserves the exact schema mutation transport plan protocol', () => {
	const plan = planner.planSchemaMutations({ transport: protocol })
	expectTypeOf(plan).toEqualTypeOf<
		ApplicationSchemaMutationTransportPlan<typeof protocol>
	>()
	expectTypeOf(
		plan.transport.name,
	).toEqualTypeOf<'fixture.schema-mutation-planning.typed'>()
})
