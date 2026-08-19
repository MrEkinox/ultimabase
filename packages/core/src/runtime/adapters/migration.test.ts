import { describe, expect, it } from 'vitest'

import type { AdapterContributionSnapshot } from './contributions.js'
import {
	adapterUpgradeIntent,
	planAdapterMigrations,
	type AdapterUpgradeIntentPayload,
} from './migration.js'

const physical = (
	version: string,
	contributionId = 'column',
): AdapterContributionSnapshot => ({
	adapterId: 'fixture.database',
	contributionId,
	family: 'physical-schema',
	normalizedStaticOptions: {},
	packageVersion: version,
	payload: { column: 'workflow_state' },
	pluginId: 'fixture.workflow',
	protocolVersion: 1,
})

const upgrade =
	(): AdapterContributionSnapshot<AdapterUpgradeIntentPayload> => ({
		adapterId: 'fixture.database',
		contributionId: 'workflow-upgrade',
		family: 'migration',
		normalizedStaticOptions: { reviewed: true },
		packageVersion: '2.0.0',
		payload: adapterUpgradeIntent({
			from: '^1.0.0',
			intent: { rename: ['state', 'workflow_state'] },
			kind: 'upgrade',
			target: {
				contributionId: 'column',
				pluginId: 'fixture.workflow',
			},
			to: '2.0.0',
		}),
		pluginId: 'fixture.workflow-postgres',
		protocolVersion: 1,
	})

describe('adapter migration planning', () => {
	it('validates the complete upgrade intent boundary', () => {
		expect(() =>
			// @ts-expect-error -- Runtime validation protects untyped callers.
			adapterUpgradeIntent(null),
		).toThrow('adapter upgrade intent must be a plain object')
		expect(() =>
			adapterUpgradeIntent({
				from: '^1.0.0',
				intent: {},
				// @ts-expect-error -- Runtime validation protects the intent discriminant.
				kind: 'automatic',
				target: { contributionId: 'column', pluginId: 'fixture.workflow' },
				to: '2.0.0',
			}),
		).toThrow('adapter upgrade intent kind must be upgrade')
		expect(() =>
			adapterUpgradeIntent({
				from: '^1.0.0',
				intent: {},
				kind: 'upgrade',
				// @ts-expect-error -- Runtime validation protects untyped targets.
				target: 'fixture.workflow/column',
				to: '2.0.0',
			}),
		).toThrow('adapter upgrade intent target must be a plain object')
		expect(() =>
			adapterUpgradeIntent({
				from: '^1.0.0',
				intent: {},
				kind: 'upgrade',
				target: {
					contributionId: 'column',
					instanceId: '',
					pluginId: 'fixture.workflow',
				},
				to: '2.0.0',
			}),
		).toThrow('adapter upgrade intent target.instanceId must be non-empty')
	})

	it('requires explicit upgrades and preserves their complete provenance', () => {
		const previous = physical('1.4.0')
		const current = physical('2.0.0')

		expect(() => planAdapterMigrations([previous], [current], [])).toThrow(
			expect.objectContaining({ code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING' }),
		)
		expect(
			planAdapterMigrations([previous], [current], [upgrade()]),
		).toMatchObject({
			added: [],
			orphaned: [],
			unchanged: [],
			upgrades: [
				{
					current,
					intent: {
						contributionId: 'workflow-upgrade',
						pluginId: 'fixture.workflow-postgres',
					},
					previous,
				},
			],
		})
	})

	it('does not treat changed static metadata as unchanged at one package version', () => {
		const previous = physical('1.0.0')
		const current = {
			...physical('1.0.0'),
			normalizedStaticOptions: { nullable: false },
		}

		expect(() => planAdapterMigrations([previous], [current], [])).toThrow(
			expect.objectContaining({ code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING' }),
		)
	})

	it('retains removed contributions as inert orphaned metadata', () => {
		const previous = physical('1.0.0', 'removed-column')
		const plan = planAdapterMigrations([previous], [], [])

		expect(plan.orphaned).toStrictEqual([
			{ previous, reason: 'plugin-or-contribution-removed' },
		])
		expect(plan.added).toStrictEqual([])
	})

	it('separates additions, stable snapshots, and conflicting intents', () => {
		const stable = physical('1.0.0')
		const added = physical('1.0.0', 'added-column')
		expect(planAdapterMigrations([stable], [stable, added], [])).toMatchObject({
			added: [added],
			orphaned: [],
			unchanged: [stable],
			upgrades: [],
		})
		expect(() =>
			planAdapterMigrations(
				[physical('1.0.0')],
				[physical('2.0.0')],
				[upgrade(), upgrade()],
			),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
	})

	it.each([
		{ from: 'invalid', label: 'from', to: '2.0.0' },
		{ from: '^1.0.0', label: 'to', to: 'next' },
	] as const)(
		'rejects invalid $label upgrade versions',
		({ from, label, to }) => {
			expect(() =>
				adapterUpgradeIntent({
					from,
					intent: {},
					kind: 'upgrade',
					target: { contributionId: 'column', pluginId: 'fixture.workflow' },
					to,
				}),
			).toThrow(`adapter upgrade intent ${label}`)
		},
	)
})
