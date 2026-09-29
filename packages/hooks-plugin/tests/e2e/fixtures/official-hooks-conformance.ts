import {
	hooksPlugin,
	onEvent,
	provideHookContributions,
	provideHookEvent,
	schemaHooks,
} from '@ultimabase/hooks-plugin'
import {
	plugin,
	Schema,
	UltimaBase,
	type SchemaDefinition,
} from '@ultimabase/core'
import { createPluginConformanceFixture } from '@ultimabase/testing'
import {
	OfficialConformanceDatabase,
	officialConformanceDatabasePlugin,
} from '../../../../../tests/fixtures/official-conformance-database.js'
import { requireEvidence } from '../../../../../tests/fixtures/official-conformance-support.js'

interface HooksConformanceEvidence {
	readonly database: OfficialConformanceDatabase
	readonly trace: string[]
}

const hooksEvidence = new WeakMap<object, HooksConformanceEvidence>()
const HooksApplication = UltimaBase.use(hooksPlugin())

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
	const Article = HooksApplication.Schema.define({
		className: 'OfficialHooksBehaviorConformanceArticle',
		fields: (field) => ({
			title: field.string({
				hooks: {
					resolveInput: (input) => {
						assertImmutable(input, 'field input')
						trace.push('developer:field')
						return input.value.trim()
					},
				},
				required: true,
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
	const compatibleProvider = plugin({
		contributions: [
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
		core: '^0.0.0',
		instanceId: 'primary',
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		id: 'community.official-hooks-conformance',
		permissions: {
			'runtime:intercept': 'Contributes official Hooks conformance handlers.',
			'runtime:observe': 'Observes official Hooks conformance events.',
		},
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
	const provider = plugin({
		contributions: [
			provideHookContributions('outside-schema', () =>
				schemaHooks(Outside, {
					beforeOperation: { create: () => undefined },
				}),
			),
		],
		core: '^0.0.0',
		peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
		id: 'community.invalid-hooks-provider',
		permissions: {
			'runtime:intercept': 'Exercises official Hooks target diagnostics.',
		},
		version: '1.0.0',
	})

	return createPluginConformanceFixture({
		schemas: [Inside],
		subject: provider,
		supportPlugins: [hooksPlugin()],
	})
}
