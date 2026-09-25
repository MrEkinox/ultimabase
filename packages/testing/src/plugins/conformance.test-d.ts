import {
	plugin,
	contributeApplication,
	type FrameworkApplication,
	Schema,
} from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	type OptionalPluginConformanceContract,
	type PluginConformanceContract,
} from '../index.js'

const Post = Schema.define({
	className: 'ConformancePost',
	fields: (field) => ({ title: field.string() }),
})
const subject = plugin({
	core: '^0.0.0',
	id: 'fixture.typed-conformance',
	contributions: [
		contributeApplication(() => ({
			exports: { marker: 'typed' as const },
		})),
	],
	version: '0.0.0',
})

test('preserves exact subject and schema tuples in optional checks', () => {
	const logicalFixture = createPluginConformanceFixture({ subject })
	expectTypeOf(logicalFixture.schemas).toEqualTypeOf<readonly []>()

	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({ schemas: [Post], subject }),
		expected: {
			core: '^0.0.0',
			pluginId: 'fixture.typed-conformance',
			version: '0.0.0',
		},
	})
		.check('operation', (context) => {
			const fixture = context.createApplication()
			expectTypeOf(fixture.subject).toEqualTypeOf(subject)
			expectTypeOf(fixture.schemas).toEqualTypeOf<readonly [typeof Post]>()
			expectTypeOf(fixture.application).toEqualTypeOf<
				FrameworkApplication<readonly [typeof Post], readonly [typeof subject]>
			>()
		})
		.check('relation-read', (context) => {
			expectTypeOf(context.createUltimaBase().schemas).toEqualTypeOf<
				readonly [typeof Post]
			>()
		})

	expectTypeOf<OptionalPluginConformanceContract>().toExtend<PluginConformanceContract>()
	// @ts-expect-error -- Baseline contracts cannot be replaced by custom checks.
	suite.check('manifest', () => undefined)
})
