import process from 'node:process'

import {
	MasterAuthority,
	RequestContextValue,
	Schema,
	UltimaBase,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.ULTIMABASE_TEST_DATABASE_URL
if (databaseUrl === undefined) {
	throw new TypeError('ULTIMABASE_TEST_DATABASE_URL is required')
}

const authenticatedViewer = new RequestContextValue(
	'fixture.relation-filter.authenticated',
	(value) => {
		if (value !== true) throw new TypeError('Authenticated marker must be true')
		return true
	},
)

const Target = Schema.define({
	className: 'JavaScriptRelationFilterTarget',
	fields: (field) => ({
		audience: field.string({ required: true }),
		label: field.string({ required: true }),
		visible: field.boolean({ required: true }),
	}),
})

const Source = Schema.define({
	className: 'JavaScriptRelationFilterSource',
	fields: (field) => ({
		contextualTargets: field.relation({
			target: 'JavaScriptRelationFilterTarget',
			where: ({ context, where }) =>
				context.getValue(authenticatedViewer) === true
					? where
					: where.eq('audience', 'public'),
		}),
		staticTargets: field.relation({
			target: 'JavaScriptRelationFilterTarget',
			where: { visible: { eq: true } },
		}),
		label: field.string({ required: true }),
	}),
})

const ultimabase = new UltimaBase({
	masterAuthority: new MasterAuthority({
		keys: [
			{ id: 'javascript-relation-filter', value: 'javascript-master-key' },
		],
		onUse: () => undefined,
	}),
	pluginPrivileges: { logger: false },
	plugins: [postgresPlugin({ schemaPolicy: 'override', url: databaseUrl })],
	schemas: [Target, Source],
})

const labels = (models) => models.map(({ label }) => label).sort()

await ultimabase.start()

try {
	const anonymousEngine = ultimabase.engine.anonymous({
		requestId: 'javascript-relation-filter',
		source: 'internal',
	})
	const anonymous = anonymousEngine.context
	const authenticated = anonymous.withValue(authenticatedViewer, true)
	const master = await anonymousEngine.useMasterKey(
		ultimabase.engine.authorizeMasterKey('javascript-master-key'),
		'Prove JavaScript relation shaping under Master',
	)
	const targets = await Target.createMany(
		{
			data: [
				{ audience: 'public', label: 'public-visible', visible: true },
				{
					audience: 'authenticated',
					label: 'authenticated-visible',
					visible: true,
				},
				{ audience: 'public', label: 'public-hidden', visible: false },
			],
		},
		{ context: master.context, ultimabase },
	)
	const source = await Source.createOne(
		{ data: { label: 'source' } },
		{ context: master.context, ultimabase },
	)
	const targetIds = targets.map(({ id }) => id)
	await source
		.relation('staticTargets')
		.connect(targetIds, { context: master.context, ultimabase })
	await source
		.relation('contextualTargets')
		.connect(targetIds, { context: master.context, ultimabase })

	const read = (field, context) =>
		source
			.relation(field)
			.findMany(
				{ orderBy: { label: 'asc' }, select: { label: true } },
				{ context, ultimabase },
			)
	const included = await Source.findOne(
		{
			include: {
				contextualTargets: { select: { label: true } },
				staticTargets: { select: { label: true } },
			},
			select: { label: true },
			where: { id: { eq: source.id } },
		},
		{ context: authenticated, ultimabase },
	)

	process.stdout.write(
		`${JSON.stringify({
			authenticatedContextual: labels(
				await read('contextualTargets', authenticated),
			),
			anonymousContextual: labels(await read('contextualTargets', anonymous)),
			anonymousStatic: labels(await read('staticTargets', anonymous)),
			included: {
				contextual: labels(included.contextualTargets),
				static: labels(included.staticTargets),
			},
			masterContextual: labels(await read('contextualTargets', master.context)),
			masterStatic: labels(await read('staticTargets', master.context)),
		})}\n`,
	)
} finally {
	await ultimabase.dispose()
}
