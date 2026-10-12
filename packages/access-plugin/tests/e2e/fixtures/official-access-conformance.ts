import {
	accessPlugin,
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import { createPluginConformanceFixture } from '@ultimabase/testing/plugins'
import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from '../../../../../tests/fixtures/official-conformance-database.js'
import { requireEvidence } from '../../../../../tests/fixtures/official-conformance-support.js'

interface AccessConformanceEvidence {
	readonly database: OfficialConformanceDatabase
}

const accessEvidence = new WeakMap<object, AccessConformanceEvidence>()
const AccessApplication = UltimaBase.use(accessPlugin())

export type AccessCommunityMode = 'allow' | 'deny'

const createAccessProvider = (
	schema: SchemaDefinition,
	instanceId: string,
	mode: AccessCommunityMode,
) =>
	plugin({
		contributions: [
			provideAccessContributions(`document-policy-${instanceId}`, () =>
				schemaAccess(schema, { read: mode === 'allow' }),
			),
		],
		core: '^0.0.0',
		instanceId,
		peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
		id: 'community.official-access-conformance',
		permissions: {
			'runtime:constrain':
				'Contributes one official Access conformance policy.',
		},
		version: '1.0.0',
	})

/** Creates one Access fixture with two explicit compatible-provider instances. */
export const createOfficialAccessConformanceFixture = (
	mode: AccessCommunityMode = 'allow',
) => {
	const Tag = AccessApplication.Schema.define({
		className: 'OfficialAccessBehaviorConformanceTag',
		fields: (field) => ({ label: field.string() }),
	})
	const Document = AccessApplication.Schema.define({
		className: 'OfficialAccessBehaviorConformanceDocument',
		fields: (field) => ({
			secret: field.string({ access: { read: false, write: false } }),
			tags: field.relation({
				access: { read: false, write: false },
				target: 'OfficialAccessBehaviorConformanceTag',
			}),
			title: field.string({
				access: {
					write: {
						clear: false,
						fill: true,
						replace: ({ originalValue, value }) =>
							originalValue === 'visible' && value !== 'denied-transition',
					},
				},
				required: true,
			}),
			visible: field.boolean(),
		}),
	}).with({
		access: {
			create: {
				where: true,
				item: ({ item }) => item.title !== 'denied-item',
			},
			read: {
				count: false,
				exists: () => ({ visible: { eq: true } }),
				many: () => ({ visible: { eq: true } }),
				one: () => ({ visible: { eq: true } }),
			},
			update: {
				where: true,
				item: ({ item, originalItem }) =>
					originalItem.visible === true && item.title !== 'denied-item',
			},
		},
	})
	const database = new OfficialConformanceDatabase(
		new Map([
			[
				Document.className,
				[
					{
						createdAt: '2026-08-20T12:00:00.000Z',
						id: '019c0000-0000-7000-8000-000000000101',
						secret: 'hidden',
						title: 'visible',
						updatedAt: '2026-08-20T12:00:00.000Z',
						visible: true,
					},
				],
			],
		]),
	)
	const providers = [
		createAccessProvider(Document, 'primary', mode),
		createAccessProvider(Document, 'secondary', 'allow'),
	] as const

	accessEvidence.set(Document, { database })
	return createPluginConformanceFixture({
		schemas: [Document, Tag],
		subject: accessPlugin(),
		supportPlugins: [...providers, officialConformanceDatabasePlugin(database)],
	})
}

export const getOfficialAccessConformanceEvidence = (
	schema: SchemaDefinition,
): AccessConformanceEvidence =>
	requireEvidence(accessEvidence, schema, 'Access behavior')

/** Builds one malformed Access provider whose field identity cannot resolve. */
export const createInvalidAccessProviderFixture = () => {
	const Inside = UltimaBase.Schema.define({
		className: 'InvalidAccessConformanceInside',
		fields: (field) => ({ title: field.string() }),
	})
	const Outside = UltimaBase.Schema.define({
		className: 'InvalidAccessConformanceOutside',
		fields: (field) => ({ title: field.string() }),
	})
	const outsideTitle = Outside.fields.title
	if (outsideTitle === undefined) {
		throw new TypeError('Invalid Access fixture field is unavailable')
	}
	const provider = plugin({
		contributions: [
			provideAccessContributions('outside-field', () =>
				fieldAccess(Inside, outsideTitle, ['title'], { read: false }),
			),
		],
		core: '^0.0.0',
		peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
		id: 'community.invalid-access-provider',
		permissions: {
			'runtime:constrain': 'Exercises official Access target diagnostics.',
		},
		version: '1.0.0',
	})

	return createPluginConformanceFixture({
		schemas: [Inside],
		subject: provider,
		supportPlugins: [accessPlugin()],
	})
}
