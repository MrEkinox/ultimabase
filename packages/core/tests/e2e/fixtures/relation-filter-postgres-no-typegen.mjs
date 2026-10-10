import process from 'node:process'

import {
	MasterAuthority,
	RequestContextValue,
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

const Application = UltimaBase.use(
	postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
)
const Target = Application.Schema.define({
	className: 'JavaScriptRelationFilterTarget',
	fields: (field) => ({
		audience: field.string({ required: true }),
		label: field.string({ required: true }),
		visible: field.boolean({ required: true }),
	}),
})

const Source = Application.Schema.define({
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

const ultimabase = new Application({
	masterAuthority: new MasterAuthority({
		keys: [
			{ id: 'javascript-relation-filter', value: 'javascript-master-key' },
		],
		onUse: () => undefined,
	}),
	pluginPrivileges: { logger: false },
	schemas: [Target, Source],
})

const labels = (models) => models.map(({ label }) => label).sort()

await ultimabase.start()

try {
	const anonymousEngine = ultimabase.anonymous({
		requestId: 'javascript-relation-filter',
		source: 'internal',
	})
	const anonymous = anonymousEngine.context
	const authenticated = anonymous.withValue(authenticatedViewer, true)
	const master = await anonymousEngine.useMasterKey(
		ultimabase.authorizeMasterKey('javascript-master-key'),
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
		{ context: master.context },
	)
	const source = await Source.createOne(
		{ data: { label: 'source' } },
		{ context: master.context },
	)
	const targetIds = targets.map(({ id }) => id)
	// ADR-0310: links are nested writes and reads are includes.
	await Source.updateOne(
		{
			data: {
				contextualTargets: { connect: targetIds },
				staticTargets: { connect: targetIds },
			},
			where: { id: { eq: source.id } },
		},
		{ context: master.context },
	)

	const read = async (field, context) => {
		const row = await Source.findOne(
			{
				include: {
					[field]: { orderBy: { label: 'asc' }, select: { label: true } },
				},
				select: { id: true },
				where: { id: { eq: source.id } },
			},
			{ context },
		)
		return row === null ? [] : row[field]
	}
	const included = await Source.findOne(
		{
			include: {
				contextualTargets: { select: { label: true } },
				staticTargets: { select: { label: true } },
			},
			select: { label: true },
			where: { id: { eq: source.id } },
		},
		{ context: authenticated },
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
