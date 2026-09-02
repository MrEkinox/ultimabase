import {
	FrameworkError,
	Schema,
	UltimaBase,
	constraint,
	databaseConstraint,
	definePlugin,
	definePluginField,
	guard,
	requestSources,
	restrictOutput,
	restrictSelection,
	runWithRequestEngine,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import {
	hooksPlugin,
	onEvent,
	provideHookContributions,
	provideHookEvent,
	schemaHooks,
} from '@ultimabase/hooks-plugin'
import {
	postgresConstraintCompiler,
	postgresPlugin,
} from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'
import { provideTestRuntimeConstraint } from './runtime-capabilities.js'

const hookTrace: string[] = []
const committedEvents: string[] = []
const rollbackHookError = new Error('Hooks plugin rollback fixture')

const trace = (label: string): void => {
	hookTrace.push(label)
}

/** Narrows one generated-item fallback field used by this no-Typegen fixture. */
const readItemString = (
	item: Readonly<Record<string, unknown>>,
	field: string,
): string => {
	const value = item[field]

	if (typeof value !== 'string') {
		throw new TypeError(`Hook item field "${field}" must be a string`)
	}

	return value
}

/** Reads one request scope without trusting opaque metadata values. */
const readScopeId = (metadata: Readonly<Record<string, unknown>>): string => {
	const scopeId: unknown = metadata.scopeId

	if (typeof scopeId !== 'string' || scopeId.length === 0) {
		throw new FrameworkError(
			'PERMISSION_DENIED',
			'The Hooks plugin fixture requires an authenticated scope.',
			{ publicMessage: 'This operation is not permitted.' },
		)
	}

	return scopeId
}

const profileSlugField = definePluginField(
	'fixture.profile-slug',
	{
		hooks: {
			resolveInput: ({ value }) => {
				trace('field:slug:developer:resolveInput')

				return value === null
					? null
					: value.trim().toLowerCase().replace(/\s+/gu, '-')
			},
		},
		required: true,
		validation: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/u),
	},
	{
		snapshotValue: (value: unknown, path: string): string => {
			if (typeof value !== 'string') {
				throw new TypeError(`${path} must be a string`)
			}

			return value
		},
	},
)
const HookAuditSchema = Schema.define({
	className: 'NativeHookPostgresAudit',
	fields: (field) => ({
		action: field.string({ required: true }),
		scopeId: field.string({ required: true }),
	}),
})

const HookArticleSchema = Schema.define({
	className: 'NativeHookPostgresArticle',
	fields: (field) => ({
		scopeId: field.string({ required: true }),
		title: field.string({
			hooks: {
				resolveInput: ({ value }) => {
					trace('field:title:developer:resolveInput')
					return value === null ? null : value.trim()
				},
			},
			required: true,
		}),
		secret: field.string(),
		profile: field.object({
			fields: () => ({ slug: profileSlugField }),
			required: true,
		}),
		published: field.boolean({ default: false }),
		revision: field.int({ default: 0 }),
	}),
	access: {
		read: { where: ({ where }) => where.eq('published', true) },
	},
	hooks: {
		afterOperation: {
			create: (input) => {
				const { operation } = input
				trace('schema:developer:afterCreate')
				trace(
					`schema:developer:afterCreate:item:${readItemString(input.item, 'title')}`,
				)
				if (operation.input.title === 'Rollback after persistence') {
					throw rollbackHookError
				}
			},
			delete: (input) => {
				trace('schema:developer:afterDelete')
				trace(
					`schema:developer:afterDelete:original:${readItemString(input.originalItem, 'title')}`,
				)
			},
			update: (input) => {
				trace('schema:developer:afterUpdate')
				trace(
					`schema:developer:afterUpdate:pair:${readItemString(input.originalItem, 'title')}->${readItemString(input.item, 'title')}`,
				)
			},
		},
		beforeOperation: {
			create: async (input) => {
				const { context } = input
				const scopeId = input.item.scopeId
				const title = input.item.title

				if (typeof scopeId !== 'string' || typeof title !== 'string') {
					throw new TypeError('Prepared hook item must contain string fields')
				}

				trace('schema:developer:beforeCreate')
				trace(`schema:developer:beforeCreate:item:${title}`)
				await HookAuditSchema.createOne({
					data: {
						action: `create:${title}`,
						scopeId,
					},
				})
				context.emit('hooks-plugin.article-created', {
					scopeId,
					title,
				})
			},
			delete: (input) => {
				trace('schema:developer:beforeDelete')
				trace(
					`schema:developer:beforeDelete:original:${readItemString(input.originalItem, 'title')}`,
				)
			},
			update: (input) => {
				trace('schema:developer:beforeUpdate')
				trace(
					`schema:developer:beforeUpdate:pair:${readItemString(input.originalItem, 'title')}->${readItemString(input.item, 'title')}`,
				)
			},
		},
		resolveInput: ({ operation }) => {
			trace('schema:developer:resolveInput')
			return operation
		},
	},
})

const scopeConstraintCompiler = postgresConstraintCompiler({
	kind: 'fixture.scope',
	version: 1,
	decode: (payload) => {
		if (
			typeof payload !== 'object' ||
			payload === null ||
			!('scopeId' in payload) ||
			typeof payload.scopeId !== 'string'
		) {
			throw new TypeError('Invalid fixture scope constraint payload')
		}

		return { scopeId: payload.scopeId }
	},
	compile: ({ field, payload, sql }) =>
		sql`${field('scopeId')} = ${payload.scopeId}`,
})

// This optional fixture models one generic row scope; Runtime and PostgreSQL
// know only the opaque constraint contract contributed by this plugin.
const scopePolicyPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.hooks-plugin-scope-policy',
	privileges: [
		{
			name: 'adapter:consume',
			reason: 'Compiles the fixture PostgreSQL scope constraint.',
		},
		{
			name: 'runtime:constrain',
			reason: 'Applies the fixture scope guard and narrowing restrictions.',
		},
	],
	capabilities: {
		provides: [
			provideTestRuntimeConstraint(
				'fixture.hooks-plugin-guard',
				guard({
					schema: HookArticleSchema,
					handler: ({ context, operation }) => {
						trace(`policy:guard:${operation.kind}`)
						readScopeId(context.metadata)
					},
				}),
			),
			provideTestRuntimeConstraint(
				'fixture.hooks-plugin-constraint',
				constraint({
					handler: ({ context, operation }) => {
						trace(`policy:constraint:${operation.kind}`)

						return databaseConstraint('fixture.scope', 1, {
							scopeId: readScopeId(context.metadata),
						})
					},
					operations: [
						'find-many',
						'find-one',
						'get',
						'count',
						'exists',
						'update-one',
						'update-many',
						'delete-one',
						'delete-many',
					],
					schema: HookArticleSchema,
				}),
			),
			provideTestRuntimeConstraint(
				'fixture.hooks-plugin-selection',
				restrictSelection({
					// Selection hides the scope identity before output hooks observe a record.
					handler: () => ['id', 'title', 'secret', 'profile'],
					operations: ['find-many', 'find-one', 'get'],
					schema: HookArticleSchema,
				}),
			),
			provideTestRuntimeConstraint(
				'fixture.hooks-plugin-output',
				restrictOutput({
					handler: ({ operation }) => {
						trace(`policy:restrictOutput:${operation.kind}`)

						return ['id', 'title', 'profile']
					},
					operations: ['find-many', 'find-one', 'get'],
					schema: HookArticleSchema,
				}),
			),
		],
	},
	setup: ({ constraintCompilers }) => {
		constraintCompilers.register(scopeConstraintCompiler)
	},
})

const behaviorPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.hooks-plugin-behavior',
	peers: [
		{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' },
		{ pluginId: 'fixture.hooks-plugin-scope-policy', version: '^0.0.0' },
	],
	privileges: [
		{
			name: 'runtime:intercept',
			reason: 'Registers the fixture schema lifecycle hooks.',
		},
		{
			name: 'runtime:observe',
			reason: 'Observes committed hooks-plugin events for the E2E fixture.',
		},
	],
	capabilities: {
		provides: [
			provideHookContributions('article-lifecycle', () =>
				schemaHooks(HookArticleSchema, {
					afterOperation: {
						create: () => {
							trace('plugin:schema:afterCreate')
						},
					},
					beforeOperation: {
						create: ({ item }) => {
							trace('plugin:schema:beforeCreate')
							void item
						},
					},
				}),
			),
			provideHookEvent(
				'fixture.hooks-plugin-created-event',
				onEvent({
					name: 'hooks-plugin.article-created',
					handler: ({ event }) => {
						committedEvents.push(event.name)
						trace(`event:${event.name}`)
					},
				}),
			),
		],
	},
})

const createHookApplication = (connectionUri: string) =>
	new UltimaBase({
		plugins: [
			// Dependency order must place policy setup before its behavior consumer.
			hooksPlugin(),
			validationPlugin(),
			accessPlugin({ default: true }),
			behaviorPlugin,
			scopePolicyPlugin,
			postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
		],
		schemas: [HookArticleSchema, HookAuditSchema],
		validation: {
			clock: () => new Date('2026-08-03T12:00:00.000Z'),
			timezone: 'UTC',
		},
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createHookApplication> | undefined
let requestSequence = 0

const getUltimaBase = (): ReturnType<typeof createHookApplication> => {
	if (ultimabase === undefined) {
		throw new TypeError('Native hook PostgreSQL application has not started')
	}

	return ultimabase
}

/** Runs one exact callback with generic scope metadata carried by a user request. */
const runWithScope = <TResult>(
	scopeId: string,
	callback: () => TResult,
): TResult => {
	requestSequence += 1
	const request = getUltimaBase().engine.anonymous({
		metadata: { scopeId },
		requestId: `hooks-plugin-postgres:${String(requestSequence)}`,
		source: requestSources.internal,
	})

	return runWithRequestEngine(request, callback)
}

/** Produces a focused order assertion while tolerating unrelated policy entries. */
const expectTraceSubsequence = (expected: readonly string[]): void => {
	let offset = 0

	for (const label of expected) {
		const index = hookTrace.indexOf(label, offset)

		expect(index, `Missing ordered hook trace entry: ${label}`).toBeGreaterThan(
			-1,
		)
		offset = index + 1
	}
}

// One worker owns the live application and PostgreSQL namespace for this file.
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createHookApplication(fixture.connectionUri)

	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('Hooks plugin with PostgreSQL', { concurrent: false }, () => {
	it('executes create, save, output, finalization, and event phases in order', async () => {
		hookTrace.length = 0
		committedEvents.length = 0

		const created = await runWithScope('scope-create', () =>
			HookArticleSchema.createOne({
				data: {
					profile: { slug: '  Public Profile  ' },
					published: true,
					secret: 'private-create-value',
					scopeId: 'scope-create',
					title: '  Create lifecycle  ',
				},
			}),
		)

		expect(created.toJSON()).toMatchObject({
			profile: {
				slug: 'public-profile',
			},
			title: 'Create lifecycle',
		})
		await expect(
			runWithScope('scope-create', () =>
				HookAuditSchema.exists({
					where: { action: { eq: 'create:Create lifecycle' } },
				}),
			),
		).resolves.toBe(true)
		expect(committedEvents).toStrictEqual(['hooks-plugin.article-created'])
		expectTraceSubsequence([
			'field:title:developer:resolveInput',
			'field:slug:developer:resolveInput',
			'schema:developer:resolveInput',
			'policy:guard:create-one',
			'plugin:schema:beforeCreate',
			'schema:developer:beforeCreate',
			'schema:developer:beforeCreate:item:Create lifecycle',
			'schema:developer:afterCreate',
			'schema:developer:afterCreate:item:Create lifecycle',
			'plugin:schema:afterCreate',
			'event:hooks-plugin.article-created',
		])
	})

	it('rolls back the primary row, nested hook write, and buffered event', async () => {
		hookTrace.length = 0
		committedEvents.length = 0

		await expect(
			runWithScope('scope-rollback', () =>
				HookArticleSchema.createOne({
					data: {
						profile: { slug: 'rollback' },
						published: true,
						scopeId: 'scope-rollback',
						title: 'Rollback after persistence',
					},
				}),
			),
		).rejects.toBe(rollbackHookError)
		const rollbackTrace = [...hookTrace]

		await expect(
			runWithScope('scope-rollback', () =>
				HookArticleSchema.exists({
					where: { title: { eq: 'Rollback after persistence' } },
				}),
			),
		).resolves.toBe(false)
		await expect(
			runWithScope('scope-rollback', () =>
				HookAuditSchema.exists({
					where: { action: { eq: 'create:Rollback after persistence' } },
				}),
			),
		).resolves.toBe(false)
		expect(committedEvents).toStrictEqual([])
		expect(rollbackTrace).toContain('schema:developer:afterCreate')
	})

	it('keeps Access filters inside opaque scope and field restrictions', async () => {
		await runWithScope('scope-visible-a', () =>
			HookArticleSchema.createOne({
				data: {
					profile: { slug: 'scope-a' },
					published: true,
					secret: 'scope-a-secret',
					scopeId: 'scope-visible-a',
					title: 'Shared visible title',
				},
			}),
		)
		await runWithScope('scope-visible-b', () =>
			HookArticleSchema.createOne({
				data: {
					profile: { slug: 'scope-b' },
					published: true,
					secret: 'scope-b-secret',
					scopeId: 'scope-visible-b',
					title: 'Shared visible title',
				},
			}),
		)
		hookTrace.length = 0

		const visible = await runWithScope('scope-visible-a', () =>
			HookArticleSchema.findMany({
				where: { title: { eq: 'Shared visible title' } },
				select: {
					id: true,
					title: true,
					secret: true,
					profile: true,
					scopeId: true,
				},
			}),
		)

		expect(visible).toHaveLength(1)
		expect(visible[0]?.toJSON()).toEqual({
			id: visible[0]?.id,
			profile: {
				slug: 'scope-a',
			},
			title: 'Shared visible title',
		})
		expectTraceSubsequence([
			'policy:guard:find-many',
			'policy:constraint:find-many',
			'policy:restrictOutput:find-many',
		])

		hookTrace.length = 0
		await expect(
			HookArticleSchema.findMany(undefined, { ultimabase: getUltimaBase() }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(hookTrace).toContain('policy:guard:find-many')
	})

	it('wraps update and delete with exact schema item pairs', async () => {
		const created = await runWithScope('scope-write', () =>
			HookArticleSchema.createOne({
				data: {
					profile: { slug: 'write' },
					published: true,
					scopeId: 'scope-write',
					title: 'Write target',
				},
			}),
		)
		hookTrace.length = 0

		await runWithScope('scope-write', () =>
			HookArticleSchema.updateOne({
				where: { id: { eq: created.id } },
				data: { title: 'Updated target' },
			}),
		)
		expectTraceSubsequence([
			'schema:developer:beforeUpdate',
			'schema:developer:beforeUpdate:pair:Write target->Updated target',
			'schema:developer:afterUpdate',
			'schema:developer:afterUpdate:pair:Write target->Updated target',
		])

		hookTrace.length = 0
		await runWithScope('scope-write', () =>
			HookArticleSchema.deleteOne({
				where: { id: { eq: created.id } },
			}),
		)
		expectTraceSubsequence([
			'schema:developer:beforeDelete',
			'schema:developer:beforeDelete:original:Updated target',
			'schema:developer:afterDelete',
			'schema:developer:afterDelete:original:Updated target',
		])
	})

	it('runs updateMany and deleteMany hooks once per scoped item', async () => {
		const idsByScope = new Map<string, string>()
		for (const scopeId of ['scope-bulk-a', 'scope-bulk-b']) {
			const created = await runWithScope(scopeId, () =>
				HookArticleSchema.createOne({
					data: {
						profile: { slug: scopeId },
						published: true,
						scopeId,
						title: 'Bulk scoped target',
					},
				}),
			)
			idsByScope.set(scopeId, created.id)
		}
		const scopedId = idsByScope.get('scope-bulk-a')

		if (scopedId === undefined)
			throw new TypeError('Missing scoped hook target')
		hookTrace.length = 0

		await expect(
			runWithScope('scope-bulk-a', () =>
				HookArticleSchema.updateMany({
					data: [
						{
							where: { id: { eq: scopedId } },
							data: { title: 'Bulk updated target' },
						},
					],
				}),
			),
		).resolves.toHaveLength(1)
		const updateTrace = [...hookTrace]

		expect(updateTrace).toContain('schema:developer:beforeUpdate')
		expect(updateTrace).toContain('schema:developer:afterUpdate')
		expect(updateTrace).toContain(
			'schema:developer:beforeUpdate:pair:Bulk scoped target->Bulk updated target',
		)
		expect(updateTrace).toContain(
			'schema:developer:afterUpdate:pair:Bulk scoped target->Bulk updated target',
		)

		hookTrace.length = 0
		await expect(
			runWithScope('scope-bulk-a', () =>
				HookArticleSchema.deleteMany({
					where: [{ id: { eq: scopedId } }],
				}),
			),
		).resolves.toHaveLength(1)
		const deleteTrace = [...hookTrace]

		expect(deleteTrace).toContain('schema:developer:beforeDelete')
		expect(deleteTrace).toContain('schema:developer:afterDelete')
		expect(deleteTrace).toContain(
			'schema:developer:beforeDelete:original:Bulk updated target',
		)
		expect(deleteTrace).toContain(
			'schema:developer:afterDelete:original:Bulk updated target',
		)

		hookTrace.length = 0
		await expect(
			runWithScope('scope-bulk-a', () =>
				HookArticleSchema.deleteMany({
					where: [{ id: { eq: scopedId } }],
				}),
			),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(hookTrace).not.toContain('schema:developer:beforeDelete')
		expect(hookTrace).not.toContain('schema:developer:afterDelete')
		await expect(
			runWithScope('scope-bulk-b', () =>
				HookArticleSchema.exists({
					where: { title: { eq: 'Bulk scoped target' } },
				}),
			),
		).resolves.toBe(true)
	})
})
