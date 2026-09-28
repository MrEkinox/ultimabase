import { expectTypeOf, test } from 'vitest'
import { FrameworkApplication } from './framework-application.js'

import {
	contributeApplication,
	plugin,
	UltimaBase,
	type PluginEnvironmentClaim,
	type PluginPrivilege,
	type PluginPrivilegeReport,
	withPluginPrivileges,
} from '../index.js'

const primary = plugin({
	id: 'fixture.typed-policy',
	instanceId: 'primary',
	version: '1.0.0',
	core: '^0.0.0',
	permissions: { 'runtime:observe': 'Verifies exact policy types.' },
	contributions: [
		withPluginPrivileges(
			contributeApplication(() => ({ exports: undefined })),
			['runtime:observe'],
		),
	],
})
const secondary = plugin({
	id: 'fixture.typed-policy',
	instanceId: 'secondary',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [],
})

test('infers exact plugin and instance policy targets on both application facades', () => {
	const options = {
		schemas: [],
		plugins: [primary, secondary],
		pluginPrivileges: {
			deny: ['runtime:observe'],
			denyClaims: ['environment:network'],
			plugins: {
				'fixture.typed-policy': {
					instances: {
						primary: { deny: ['adapter:raw'] },
						secondary: { denyClaims: ['environment:process'] },
					},
				},
			},
			logger: false,
		},
	} as const

	const application = new FrameworkApplication(options)
	const ultimabase = new UltimaBase(options)

	expectTypeOf(
		application.pluginPrivilegeReport,
	).toEqualTypeOf<PluginPrivilegeReport>()
	expectTypeOf(
		ultimabase.pluginPrivilegeReport,
	).toEqualTypeOf<PluginPrivilegeReport>()
	expectTypeOf(
		options.pluginPrivileges.deny[0],
	).toEqualTypeOf<'runtime:observe'>()
	expectTypeOf<'runtime:observe'>().toExtend<PluginPrivilege>()
	expectTypeOf<'environment:network'>().toExtend<PluginEnvironmentClaim>()

	// @ts-expect-error -- Inspection remains immutable.
	application.pluginPrivilegeReport.allowed = false
})

test('rejects unknown plugin, instance, privilege, and claim literals', () => {
	new FrameworkApplication({
		schemas: [],
		plugins: [primary, secondary],
		pluginPrivileges: {
			plugins: {
				// @ts-expect-error -- Policy targets are inferred from configured plugins.
				'fixture.unknown': { deny: [] },
			},
		},
	})

	new FrameworkApplication({
		schemas: [],
		plugins: [primary, secondary],
		pluginPrivileges: {
			plugins: {
				'fixture.typed-policy': {
					instances: {
						// @ts-expect-error -- Exact instance targets are inferred independently.
						unknown: { deny: [] },
					},
				},
			},
		},
	})

	new FrameworkApplication({
		schemas: [],
		plugins: [primary],
		pluginPrivileges: {
			// @ts-expect-error -- Enforceable powers use the closed privilege vocabulary.
			deny: ['runtime:*'],
			// @ts-expect-error -- Claims remain a separate closed vocabulary.
			denyClaims: ['environment:camera'],
		},
	})
})
