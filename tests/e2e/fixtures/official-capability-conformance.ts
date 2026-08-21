import {
	accessPlugin,
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { definePlugin, Schema, type SchemaDefinition } from '@ultimabase/core'
import {
	hooksPlugin,
	onEvent,
	provideHookContributions,
	provideHookEvent,
	schemaHooks,
} from '@ultimabase/hooks-plugin'
import { createPluginConformanceFixture } from '@ultimabase/testing'

import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from './official-conformance-database.js'

interface HooksConformanceEvidence {
	readonly database: OfficialConformanceDatabase
	readonly trace: string[]
}

interface AccessConformanceEvidence {
	readonly database: OfficialConformanceDatabase
}

const hooksEvidence = new WeakMap<object, HooksConformanceEvidence>()
const accessEvidence = new WeakMap<object, AccessConformanceEvidence>()

const requireEvidence = <TEvidence>(
	storage: WeakMap<object, TEvidence>,
	schema: SchemaDefinition,
	label: string,
): TEvidence => {
	const evidence = storage.get(schema)
	if (evidence === undefined) {
		throw new TypeError(`${label} conformance evidence is unavailable`)
	}
	return evidence
}

const assertImmutable = (value: unknown, label: string): void => {
	if (
		(typeof value !== 'object' && typeof value !== 'function') ||
		value === null ||
		!Object.isFrozen(value)
	) {
		throw new TypeError(`Hooks conformance requires immutable ${label}`)
	}
}

/** Creates fresh official Hooks behavior state for every conformance check. */
export const createOfficialHooksConformanceFixture = () => {
	const trace: string[] = []
	const database = new OfficialConformanceDatabase(new Map(), trace)
	const Article = Schema.define({
		className: 'OfficialHooksBehaviorConformanceArticle',
		fields: (field) => ({
			title: field.string({
				hooks: {
					resolveInput: (input) => {
						assertImmutable(input, 'field input')
						trace.push('developer:field')
						return input.value === null ? null : input.value.trim()
					},
				},
				validation: { required: true },
			}),
		}),
		hooks: {
			afterOperation: {
				create: (input) => {
					assertImmutable(input, 'after input')
					trace.push('developer:after')
					if (input.item.title === 'rollback') {
						throw new Error('Hooks conformance requested rollback')
					}
				},
			},
			beforeOperation: {
				create: (input) => {
					assertImmutable(input, 'before input')
					assertImmutable(input.item, 'prepared item')
					trace.push('developer:before')
					if (typeof input.item.title !== 'string') {
						throw new TypeError('Hooks conformance title is not a string')
					}
					input.context.emit('official-hooks.created', {
						title: input.item.title,
					})
				},
			},
		},
	})
	const compatibleProvider = definePlugin({
		capabilities: {
			provides: [
				provideHookContributions('article-lifecycle', () =>
					schemaHooks(Article, {
						afterOperation: {
							create: () => {
								trace.push('provider:after')
							},
						},
						beforeOperation: {
							create: () => {
								trace.push('provider:before')
							},
						},
					}),
				),
				provideHookEvent(
					'article-created',
					onEvent({
						handler: ({ event }) => {
							trace.push(`event:${event.name}`)
						},
						name: 'official-hooks.created',
					}),
				),
			],
		},
		core: '^0.0.0',
		instanceId: 'primary',
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		pluginId: 'community.official-hooks-conformance',
		privileges: [
			{
				name: 'runtime:intercept',
				reason: 'Contributes official Hooks conformance handlers.',
			},
			{
				name: 'runtime:observe',
				reason: 'Observes official Hooks conformance events.',
			},
		],
		version: '1.0.0',
	})

	hooksEvidence.set(Article, { database, trace })
	return createPluginConformanceFixture({
		schemas: [Article],
		subject: hooksPlugin(),
		supportPlugins: [
			compatibleProvider,
			officialConformanceDatabasePlugin(database),
		],
	})
}

export const getOfficialHooksConformanceEvidence = (
	schema: SchemaDefinition,
): HooksConformanceEvidence =>
	requireEvidence(hooksEvidence, schema, 'Hooks behavior')

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
				validation: { required: true },
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

/** Builds one malformed provider whose exact target is outside the application. */
export const createInvalidHooksProviderFixture = () => {
	const Inside = Schema.define({
		className: 'InvalidHooksConformanceInside',
		fields: (field) => ({ title: field.string() }),
	})
	const Outside = Schema.define({
		className: 'InvalidHooksConformanceOutside',
		fields: (field) => ({ title: field.string() }),
	})
	const provider = definePlugin({
		capabilities: {
			provides: [
				provideHookContributions('outside-schema', () =>
					schemaHooks(Outside, {
						beforeOperation: { create: () => undefined },
					}),
				),
			],
		},
		core: '^0.0.0',
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		pluginId: 'community.invalid-hooks-provider',
		privileges: [
			{
				name: 'runtime:intercept',
				reason: 'Exercises official Hooks target diagnostics.',
			},
		],
		version: '1.0.0',
	})

	return createPluginConformanceFixture({
		schemas: [Inside],
		subject: provider,
		supportPlugins: [hooksPlugin()],
	})
}

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
