import {
	UltimaBase,
	applicationOperationTransportPlanningCapability,
	databaseAdapterCapability,
	defineOperationTransport,
} from '@ultimabase/core'
import {
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
} from '@ultimabase/core/plugin'
import {
	parseTransportExposureOptions,
	readExposurePlan,
} from '@ultimabase/plugin-kit'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreparedMutationTestAdapter } from '../../../tooling/vitest/prepared-mutation-adapter.js'
import { accessPlugin, type AllowWithoutRule } from '../src/index.js'

// ADR-0347 decision 4: after start, Access reports every exposed method it
// refuses to every non-Master caller; production refuses to start until the
// application decides. Nothing changes on the wire.
const database = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database-adapter',
			create: () => ({
				value: new PreparedMutationTestAdapter({
					description: 'Exposure diagnostic fixture',
					prepare: () => Promise.reject(new TypeError('Unexpected storage')),
				}),
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.exposure-diagnostic-database',
	version: '1.0.0',
})

// A transport that plans its exposure at setup, as every transport does; it
// serves the built-in defaults (findMany, findOne, exists, createOne,
// updateOne, deleteOne).
const wire = defineOperationTransport({
	name: 'fixture.exposure-diagnostic.wire',
	version: '1.0.0',
})
const planningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const wireCapability = defineCapability<Readonly<{ methods: number }>>()({
	capabilityId: 'fixture.exposure-diagnostic.wire',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})
const transport = plugin({
	contributions: [
		withPluginPrivileges(
			provideCapability(wireCapability, {
				contributionId: 'wire',
				create: ({ capabilities }) => {
					const plan = readExposurePlan(capabilities.get(planningRequirement), {
						factory: 'wirePlugin',
						label: 'Wire',
						options: parseTransportExposureOptions({}, { name: 'Wire' }),
						schemaKey: 'wire',
						transport: wire,
					})
					return {
						value: {
							methods: plan.schemas.flatMap(({ methods }) => methods).length,
						},
					}
				},
			}),
			['transport:expose'],
		),
		planningRequirement,
	],
	core: '^0.0.0',
	id: 'fixture.exposure-diagnostic.wire',
	permissions: { 'transport:expose': 'Plans the wire transport.' },
	version: '1.0.0',
})

const App = UltimaBase.use(accessPlugin())
const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { read: true, update: false } })

const start = async (
	allowWithoutRule: AllowWithoutRule,
	options: Readonly<{ transport?: boolean }> = {},
) => {
	const logger = createCapturingLogger()
	const ultimabase = new (UltimaBase.use(
		accessPlugin({ allowWithoutRule }),
		database,
		...(options.transport === false ? [] : [transport]),
	))({ logger, schemas: [Todo] })
	try {
		await ultimabase.start()
	} finally {
		await ultimabase.dispose()
	}
	return logger
		.messages('warn')
		.filter((message) => message.includes('is exposed but'))
}

const line = (method: string) =>
	`Todo.${method} is exposed but no Access rule opens it. Add an Access rule, open it in allowWithoutRule, or close it with expose: { ${method}: false }.`
const report = (method: string) => `[@ultimabase/access-plugin] ${line(method)}`

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('exposed methods Access always refuses (ADR-0347)', () => {
	it('warns once per exposed method no rule or opening covers', async () => {
		// read covers the reads; update: false is a decision; createOne and
		// deleteOne have neither.
		await expect(start({})).resolves.toEqual([
			report('createOne'),
			report('deleteOne'),
		])
	})

	it('is silenced by an opening, or by any explicit rule', async () => {
		await expect(start({ write: true })).resolves.toEqual([])
		await expect(start({ create: true, delete: true })).resolves.toEqual([])
		await expect(start({ create: true })).resolves.toEqual([
			report('deleteOne'),
		])
	})

	it('reports nothing without a transport', async () => {
		await expect(start({}, { transport: false })).resolves.toEqual([])
	})

	it('refuses to start in production with the same list', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			database,
			transport,
		))({ logger: false, schemas: [Todo] })
		try {
			await expect(ultimabase.start()).rejects.toThrow(
				['createOne', 'deleteOne'].map(line).join('\n'),
			)
		} finally {
			await ultimabase.dispose()
		}
	})
})
