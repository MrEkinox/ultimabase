import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	type SchemaDefinition,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	PluginConformanceError,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'

import {
	createInvalidAccessProviderFixture,
	createInvalidHooksProviderFixture,
	createOfficialAccessConformanceFixture,
	createOfficialHooksConformanceFixture,
	getOfficialAccessConformanceEvidence,
	getOfficialHooksConformanceEvidence,
} from './fixtures/official-capability-conformance.js'

const createProofSchema = () =>
	Schema.define({
		className: 'OfficialCapabilityConformancePost',
		fields: (field) => ({ title: field.string() }),
	})

const requireSchema = <TSchema extends SchemaDefinition>(
	schema: TSchema | undefined,
	label: string,
): TSchema => {
	if (schema === undefined)
		throw new TypeError(`${label} schema is unavailable`)
	return schema
}

const createMasterAuthority = () =>
	new MasterAuthority({
		keys: [{ id: 'official-conformance', value: 'server-only' }],
		onUse: () => undefined,
	})

const expectConformanceFailure = (
	failure: unknown,
	pluginId: string,
	message: string,
): void => {
	expect(failure).toBeInstanceOf(PluginConformanceError)
	if (!(failure instanceof PluginConformanceError)) {
		throw new TypeError('Expected a plugin conformance failure')
	}
	expect(failure).toMatchObject({
		contract: 'capability-contracts',
		pluginId,
	})
	if (!(failure.cause instanceof Error)) {
		throw new TypeError('Expected the conformance failure to retain its cause')
	}
	expect(failure.cause.message).toContain(message)
}

describe('official optional capability conformance', () => {
	it('proves Hooks manifest and Typegen contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [createProofSchema()],
					subject: hooksPlugin(),
				}),
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/hooks-plugin',
				privileges: ['schema:declare', 'runtime:intercept'],
				version: '0.0.0',
			},
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'official-hooks-conformance',
				verify: ({ contents }) => {
					expect(contents).toContain('@ultimabase/hooks-plugin')
					expect(contents).toContain('FieldHooksOption')
					expect(contents).toContain('SchemaHooksOption')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
	})

	it('proves Hooks ordering, immutability, rollback, commit delivery, and isolation', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createOfficialHooksConformanceFixture,
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/hooks-plugin',
				privileges: ['schema:declare', 'runtime:intercept'],
				version: '0.0.0',
			},
		}).check('middleware', async (context) => {
			const success = context.createUltimaBase()
			const successSchema = requireSchema(success.schemas[0], 'Hooks success')
			const successEvidence = getOfficialHooksConformanceEvidence(successSchema)
			await success.ultimabase.start()
			await successSchema.createOne(
				{ data: { title: '  published  ' } },
				{ ultimabase: success.ultimabase },
			)
			expect(successEvidence.trace).toStrictEqual([
				'developer:field',
				'provider:before',
				'developer:before',
				'developer:after',
				'provider:after',
				'database:commit',
				'event:official-hooks.created',
			])
			expect(successEvidence.database.commits).toBe(1)

			const rollback = context.createUltimaBase()
			const rollbackSchema = requireSchema(
				rollback.schemas[0],
				'Hooks rollback',
			)
			const rollbackEvidence =
				getOfficialHooksConformanceEvidence(rollbackSchema)
			await rollback.ultimabase.start()
			await expect(
				rollbackSchema.createOne(
					{ data: { title: 'rollback' } },
					{ ultimabase: rollback.ultimabase },
				),
			).rejects.toThrow('Hooks conformance requested rollback')
			expect(rollbackEvidence.database.rollbacks).toBe(1)
			expect(rollbackEvidence.trace).not.toContain(
				'event:official-hooks.created',
			)

			const first = context.createUltimaBase()
			const second = context.createUltimaBase()
			const firstSchema = requireSchema(first.schemas[0], 'First Hooks')
			const secondSchema = requireSchema(second.schemas[0], 'Second Hooks')
			const firstEvidence = getOfficialHooksConformanceEvidence(firstSchema)
			const secondEvidence = getOfficialHooksConformanceEvidence(secondSchema)
			await Promise.all([first.ultimabase.start(), second.ultimabase.start()])
			await firstSchema.createOne(
				{ data: { title: 'first' } },
				{ ultimabase: first.ultimabase },
			)
			expect(firstEvidence.trace).not.toStrictEqual([])
			expect(secondEvidence.trace).toStrictEqual([])
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'middleware',
			status: 'passed',
		})
		expect(report.checks).toContainEqual({
			contract: 'lifecycle-cleanup',
			status: 'passed',
		})
	})

	it('proves Access manifest and Typegen contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [createProofSchema()],
					subject: accessPlugin(),
				}),
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/access-plugin',
				privileges: ['schema:declare', 'runtime:constrain'],
				version: '0.0.0',
			},
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'official-access-conformance',
				verify: ({ contents }) => {
					expect(contents).toContain('@ultimabase/access-plugin')
					expect(contents).toContain('FieldAccessOption')
					expect(contents).toContain('SchemaAccessOption')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
	})

	it('proves Access denial, filters, item and field narrowing, relations, and transitions', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createOfficialAccessConformanceFixture,
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/access-plugin',
				privileges: ['schema:declare', 'runtime:constrain'],
				version: '0.0.0',
			},
		}).check('persistence', async (context) => {
			const fixture = context.createUltimaBase()
			const document = requireSchema(fixture.schemas[0], 'Access document')
			const evidence = getOfficialAccessConformanceEvidence(document)
			await fixture.ultimabase.start()

			const rows = await document.findMany(undefined, {
				ultimabase: fixture.ultimabase,
			})
			expect(rows).toEqual([expect.not.objectContaining({ secret: 'hidden' })])
			expect(evidence.database.requests.at(-1)?.rowFilter).toBeDefined()
			await expect(
				document.count(undefined, { ultimabase: fixture.ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.createOne(
					{ data: { secret: 'forbidden', title: 'field-denied' } },
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.createOne(
					{ data: { title: 'denied-item' } },
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				document.updateOne(
					{
						data: { title: 'denied-transition' },
						where: { id: { eq: '019c0000-0000-7000-8000-000000000101' } },
					},
					{ ultimabase: fixture.ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(evidence.database.rollbacks).toBeGreaterThan(0)

			const visible = rows[0]
			if (visible === undefined)
				throw new TypeError('Visible row is unavailable')
			await expect(
				visible.relation('tags').findMany(undefined, {
					ultimabase: fixture.ultimabase,
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'persistence',
			status: 'passed',
		})
	})

	it('proves Access Master modes and monotonic compatible-provider composition', async () => {
		for (const [mode, masterAllowed] of [
			['bypass-deny', true],
			['enforce-deny', false],
		] as const) {
			const fixture = createOfficialAccessConformanceFixture(mode)
			const document = requireSchema(fixture.schemas[0], `Access ${mode}`)
			const ultimabase = new UltimaBase({
				masterAuthority: createMasterAuthority(),
				plugins: fixture.plugins,
				schemas: fixture.schemas,
			})
			try {
				await ultimabase.start()
				await expect(
					document.findMany(undefined, { ultimabase }),
				).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
				const masterRead = document.findMany(undefined, {
					ultimabase,
					useMasterKey: true,
				})
				if (masterAllowed) {
					await expect(masterRead).resolves.toHaveLength(1)
				} else {
					await expect(masterRead).rejects.toMatchObject({
						code: 'PERMISSION_DENIED',
					})
				}
			} finally {
				await ultimabase.dispose()
			}
		}
	})

	it('reports actionable public diagnostics for an invalid Hooks provider', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createInvalidHooksProviderFixture,
			expected: {
				core: '^0.0.0',
				pluginId: 'community.invalid-hooks-provider',
				privileges: ['runtime:intercept'],
				version: '1.0.0',
			},
		})
		const failure = await runPluginConformance(suite).catch(
			(error: unknown) => error,
		)

		expectConformanceFailure(
			failure,
			'community.invalid-hooks-provider',
			'targets a schema outside its application',
		)
	})

	it('reports actionable public diagnostics for an invalid Access provider', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: createInvalidAccessProviderFixture,
			expected: {
				core: '^0.0.0',
				pluginId: 'community.invalid-access-provider',
				privileges: ['runtime:constrain'],
				version: '1.0.0',
			},
		})
		const failure = await runPluginConformance(suite).catch(
			(error: unknown) => error,
		)

		expectConformanceFailure(
			failure,
			'community.invalid-access-provider',
			'targets an unavailable field',
		)
	})
})
