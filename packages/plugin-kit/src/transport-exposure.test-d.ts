import type {
	ApplicationExposurePlan,
	ApplicationOperationTransportPlanner,
	OperationTransportProtocol,
} from '@ultimabase/core'
import type {
	NormalizedExposureRule,
	PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import {
	parseTransportExposureOptions,
	readExposurePlan,
	type NormalizedTransportExposureOptions,
	type TransportExposureOptions,
} from './index.js'

declare const planner: ApplicationOperationTransportPlanner
declare const options: NormalizedTransportExposureOptions
declare const wire: OperationTransportProtocol<'fixture.types.wire', '1.0.0'>

test('types the shared transport options (ADR-0347 decision 3)', () => {
	expectTypeOf<TransportExposureOptions>().toExtend<{
		readonly default?: boolean | object
		readonly hide?: readonly PluginOperationDefinition[]
		readonly pagination?: Readonly<{ defaultTake?: number; maxTake?: number }>
		readonly publicWrites?: boolean
	}>()
	const accepted: TransportExposureOptions = {
		default: { write: false, createOne: true },
		pagination: { defaultTake: 20 },
	}
	expectTypeOf(accepted).toExtend<TransportExposureOptions>()
	// @ts-expect-error -- A default applies to every schema: no plugin keys.
	const pluginKey: TransportExposureOptions = { default: { softDelete: true } }
	// @ts-expect-error -- The default is a rule, not a vocabulary key.
	const keyword: TransportExposureOptions = { default: 'all' }
	expectTypeOf(pluginKey).toBeObject()
	expectTypeOf(keyword).toBeObject()
})

test('returns the normalized options and a plan for the same protocol', () => {
	expectTypeOf(
		parseTransportExposureOptions({}, { name: 'Fixture plugin' }),
	).toEqualTypeOf<NormalizedTransportExposureOptions>()
	expectTypeOf<NormalizedTransportExposureOptions['default']>().toEqualTypeOf<
		NormalizedExposureRule | undefined
	>()
	expectTypeOf(
		readExposurePlan(planner, {
			factory: 'fixturePlugin',
			label: 'Fixture',
			options,
			schemaKey: 'wire',
			transport: wire,
		}),
	).toEqualTypeOf<
		ApplicationExposurePlan<
			OperationTransportProtocol<'fixture.types.wire', '1.0.0'>
		>
	>()
})
