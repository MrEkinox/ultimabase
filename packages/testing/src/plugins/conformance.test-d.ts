import {
	type UltimaBase,
	UltimaBase as UltimaBaseFactory,
} from '@ultimabase/core'
import {
	plugin,
	contributeApplication,
	contributeDeclarations,
	defineSchemaOption,
	type PluginDeclarationContribution,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	type OptionalPluginConformanceContract,
	type PluginConformanceContract,
} from '../plugins.js'

const sourceOption = defineSchemaOption({
	normalize: (value) => value === true,
	protocolVersion: 1,
})
interface EnabledRules extends SchemaRulesHKT {
	readonly rules: Readonly<{ enabled?: boolean }>
}
// The rules slot types `plugins.enabled(…)` in `.with` (ADR-0297).
const declarations: PluginDeclarationContribution<
	readonly [],
	PluginSchemaRulesSource<EnabledRules>
> = contributeDeclarations({
	schema: ({ schemas }) =>
		schemas.defineOptions({
			contributionId: 'source-option',
			schema: { enabled: sourceOption },
		}),
})
const subject = plugin({
	core: '^0.0.0',
	id: 'fixture.typed-conformance',
	contributions: [
		declarations,
		contributeApplication(() => ({
			exports: { marker: 'typed' as const },
		})),
	],
	permissions: { 'schema:declare': 'Declares source-typed fixture options.' },
	version: '0.0.0',
})
const Application = UltimaBaseFactory.use(subject)
const Post = Application.Schema.define({
	className: 'ConformancePost',
	fields: (field) => ({ title: field.string() }),
}).with((plugins) => plugins.enabled(true))

UltimaBaseFactory.Schema.define({
	className: 'UnconfiguredConformancePost',
	fields: (field) => ({ title: field.string() }),
}).with((plugins) => {
	// @ts-expect-error -- The unconfigured factory cannot author plugin rules.
	void plugins.enabled
	return plugins
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
			const fixture = context.createUltimaBase()
			expectTypeOf(fixture.subject).toEqualTypeOf(subject)
			expectTypeOf(fixture.schemas).toEqualTypeOf<readonly [typeof Post]>()
			expectTypeOf(fixture.ultimabase).toEqualTypeOf<
				UltimaBase<readonly [typeof Post], readonly [typeof subject]>
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
