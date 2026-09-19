import {
	accessPlugin,
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { definePlugin, Schema, type SchemaDefinition } from '@ultimabase/core'
import { createPluginConformanceFixture } from '@ultimabase/testing'
import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from '../../../../../tests/fixtures/official-conformance-database.js'
import { requireEvidence } from '../../../../../tests/fixtures/official-conformance-support.js'

interface AccessConformanceEvidence {
	readonly database: OfficialConformanceDatabase
}

const accessEvidence = new WeakMap<object, AccessConformanceEvidence>()

export type AccessCommunityMode = 'allow' | 'deny'

const createAccessProvider = (
	schema: SchemaDefinition,
	instanceId: string,
	mode: AccessCommunityMode,
) =>
	definePlugin({
		capabilities: {
			provides: [
				provideAccessContributions(`document-policy-${instanceId}`, () =>
					schemaAccess(schema, { read: mode === 'allow' }),
				),
			],
		},
		core: '^0.0.0',
		instanceId,
		peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
		pluginId: 'community.official-access-conformance',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Contributes one official Access conformance policy.',
			},
		],
		version: '1.0.0',
	})

/** Creates one Access fixture with two explicit compatible-provider instances. */
export const createOfficialAccessConformanceFixture = (
	mode: AccessCommunityMode = 'allow',
) => {
	const Tag = Schema.define({
		className: 'OfficialAccessBehaviorConformanceTag',
		fields: (field) => ({ label: field.string() }),
	})
	const Document = Schema.define({
		access: {
			create: {
				allow: true,
				item: ({ item }) => item.title !== 'denied-item',
			},
			read: {
				allow: { count: false, exists: true, many: true, one: true },
				where: { visible: { eq: true } },
			},
			update: {
				allow: true,
				item: ({ item, originalItem }) =>
					originalItem.visible === true && item.title !== 'denied-item',
			},
		},
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
	const Inside = Schema.define({
		className: 'InvalidAccessConformanceInside',
		fields: (field) => ({ title: field.string() }),
	})
	const Outside = Schema.define({
		className: 'InvalidAccessConformanceOutside',
		fields: (field) => ({ title: field.string() }),
	})
	const outsideTitle = Outside.fields.title
	if (outsideTitle === undefined) {
		throw new TypeError('Invalid Access fixture field is unavailable')
	}
	const provider = definePlugin({
		capabilities: {
			provides: [
				provideAccessContributions('outside-field', () =>
					fieldAccess(Inside, outsideTitle, ['title'], { read: false }),
				),
			],
		},
		core: '^0.0.0',
		peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
		pluginId: 'community.invalid-access-provider',
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Exercises official Access target diagnostics.',
			},
		],
		version: '1.0.0',
	})

	return createPluginConformanceFixture({
		schemas: [Inside],
		subject: provider,
		supportPlugins: [accessPlugin()],
	})
}
