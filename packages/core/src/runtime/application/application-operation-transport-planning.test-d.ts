import { expectTypeOf, test } from 'vitest'

import {
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	type ApplicationOperationTransportPlan,
	type ApplicationOperationTransportPlanner,
} from '../../index.js'

const value = defineOperationValue((input: unknown): string => {
	if (typeof input !== 'string') throw new TypeError('Expected a string')
	return input
})
const operation = defineOperation({
	input: value,
	name: 'fixture.operation-planning.typed',
	result: value,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const protocol = defineOperationTransport({
	name: 'fixture.operation-planning.typed-transport',
	version: '1.0.0',
})
declare const planner: ApplicationOperationTransportPlanner

test('preserves the exact planned transport protocol type', () => {
	const plan = planner.plan({ operations: [operation], transport: protocol })

	expectTypeOf(plan).toEqualTypeOf<
		ApplicationOperationTransportPlan<typeof protocol>
	>()
	expectTypeOf(
		plan.transport.name,
	).toEqualTypeOf<'fixture.operation-planning.typed-transport'>()
})
