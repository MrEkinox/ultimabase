import { expectTypeOf, test } from 'vitest'

import {
	defineOperationTransport,
	type ApplicationExposurePlan,
	type ApplicationOperationTransportPlanner,
	type ExposedSchemaMethod,
} from '../../index.js'
import type {
	NativeCommandMethod,
	PluginCommandCatalogEntry,
} from '../../plugin.js'

const protocol = defineOperationTransport({
	name: 'fixture.exposure-planning.typed',
	version: '1.0.0',
})
declare const planner: ApplicationOperationTransportPlanner
declare const method: ExposedSchemaMethod

test('preserves the exact protocol of an exposure plan (ADR-0347)', () => {
	const plan = planner.planExposure({
		factory: 'typedPlugin',
		label: 'Typed',
		schemaKey: 'typed',
		transport: protocol,
	})
	expectTypeOf(plan).toEqualTypeOf<ApplicationExposurePlan<typeof protocol>>()
	expectTypeOf(
		plan.transport.name,
	).toEqualTypeOf<'fixture.exposure-planning.typed'>()
})

test('narrows a served method to its catalog entry by kind', () => {
	if (method.kind === 'native') {
		expectTypeOf(method.entry.method).toEqualTypeOf<NativeCommandMethod>()
	} else {
		expectTypeOf(method.entry).toEqualTypeOf<PluginCommandCatalogEntry>()
		expectTypeOf(method.binding.bound).toEqualTypeOf<boolean>()
	}
})

test('refuses an unparsed default rule', () => {
	planner.planExposure({
		// @ts-expect-error a default is a boolean or a record of booleans
		default: 'all',
		factory: 'typedPlugin',
		label: 'Typed',
		schemaKey: 'typed',
		transport: protocol,
	})
})
