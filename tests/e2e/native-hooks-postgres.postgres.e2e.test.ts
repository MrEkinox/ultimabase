import {
	FrameworkError,
	Schema,
	UltimaBase,
	booleanField,
	constraint,
	databaseConstraint,
	defineFieldKindHookTarget,
	definePlugin,
	definePluginField,
	guard,
	intField,
	objectField,
	onEvent,
	requestSources,
	restrictOutput,
	restrictSelection,
	runWithRequestEngine,
	stringField,
} from '@ultimabase/core'
import {
	postgresConstraintCompiler,
	postgresPlugin,
} from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const hookTrace: string[] = []
const committedEvents: string[] = []
const rollbackHookError = new Error('native hook rollback fixture')

const trace = (label: string): void => {
	hookTrace.push(label)
}

/** Reads one request scope without trusting opaque metadata values. */
const readScopeId = (metadata: Readonly<Record<string, unknown>>): string => {
	const scopeId: unknown = metadata.scopeId

	if (typeof scopeId !== 'string' || scopeId.length === 0) {
		throw new FrameworkError(
			'PERMISSION_DENIED',
			'The native hook fixture requires an authenticated scope.',
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

				return value === null ? null : value.trim().toLowerCase()
			},
			resolveOutput: ({ value }) => {
				trace('field:slug:developer:resolveOutput')
				if (value === null) throw new TypeError('slug must be present')

				return `${value}:developer-output`
			},
		},
		validation: { required: true },
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
const profileSlugHookTarget = defineFieldKindHookTarget<
	typeof profileSlugField
>('fixture.profile-slug')

const HookAuditSchema = Schema.define({
	className: 'NativeHookPostgresAudit',
	fields: {
		action: stringField({ validation: { required: true } }),
		scopeId: stringField({ validation: { required: true } }),
	},
})

const HookArticleSchema = Schema.define({
	className: 'NativeHookPostgresArticle',
	fields: {
		scopeId: stringField({ validation: { required: true } }),
		title: stringField({
			hooks: {
				afterCommit: () => {
					trace('field:title:developer:afterCommit')
				},
				afterCreate: () => {
					trace('field:title:developer:afterCreate')
				},
				afterDelete: () => {
					trace('field:title:developer:afterDelete')
				},
				afterRollback: () => {
					trace('field:title:developer:afterRollback')
				},
				afterSave: () => {
					trace('field:title:developer:afterSave')
				},
				afterUpdate: () => {
					trace('field:title:developer:afterUpdate')
				},
				beforeCreate: () => {
					trace('field:title:developer:beforeCreate')
				},
				beforeDelete: () => {
					trace('field:title:developer:beforeDelete')
				},
				beforeSave: () => {
					trace('field:title:developer:beforeSave')
				},
				beforeUpdate: () => {
					trace('field:title:developer:beforeUpdate')
				},
				onChange: () => {
					trace('field:title:developer:onChange')
				},
				onError: ({ phase, transaction }) => {
					trace(`field:title:developer:onError:${phase}:${transaction.status}`)
				},
				resolveInput: ({ value }) => {
					trace('field:title:developer:resolveInput')

					return value.trim()
				},
				resolveOutput: ({ value }) => {
					trace('field:title:developer:resolveOutput')

					return value.toUpperCase()
				},
				validate: () => {
					trace('field:title:developer:validate')

					return []
				},
			},
			validation: { required: true },
		}),
		secret: stringField(),
		profile: objectField({
			fields: { slug: profileSlugField },
			validation: { required: true },
		}),
		published: booleanField({ default: false }),
		revision: intField({ default: 0 }),
	},
	hooks: {
		afterCommit: () => {
			trace('schema:developer:afterCommit')
		},
		afterCreate: ({ operation, result }) => {
			trace('schema:developer:afterCreate')

			if (
				operation.kind === 'create-one' &&
				operation.input.title === 'Rollback after persistence'
			) {
				throw rollbackHookError
			}

			return result
		},
		afterDelete: ({ result }) => {
			trace('schema:developer:afterDelete')

			return result
		},
		afterRead: ({ kind, result }) => {
			trace(`schema:developer:afterRead:${kind}`)

			if (kind !== 'find-many') {
				return result
			}

			// The final policy boundary must remove a field restored by a result hook.
			return result.map((article) => ({
				...article,
				secret: 'restored-by-schema-hook',
			}))
		},
		afterRollback: () => {
			trace('schema:developer:afterRollback')
		},
		afterUpdate: ({ result }) => {
			trace('schema:developer:afterUpdate')

			return result
		},
		beforeCommit: () => {
			trace('schema:developer:beforeCommit')
		},
		beforeCreate: async ({ context, operation }) => {
			trace('schema:developer:beforeCreate')

			if (operation.kind === 'create-one') {
				await HookAuditSchema.createOne({
					data: {
						action: `create:${operation.input.title}`,
						scopeId: operation.input.scopeId,
					},
				})
				context.emit('native-hooks.article-created', {
					scopeId: operation.input.scopeId,
					title: operation.input.title,
				})
			}

			return operation
		},
		beforeDelete: ({ operation }) => {
			trace('schema:developer:beforeDelete')

			return operation
		},
		beforeRead: ({ kind, query }) => {
			trace(`schema:developer:beforeRead:${kind}`)

			return query.where((where) => where.eq('published', true))
		},
		beforeUpdate: ({ operation }) => {
			trace('schema:developer:beforeUpdate')

			return operation
		},
		onError: ({ phase, transaction }) => {
			trace(`schema:developer:onError:${phase}:${transaction.status}`)
		},
		resolveInput: ({ operation }) => {
			trace('schema:developer:resolveInput')

			return operation
		},
		validate: () => {
			trace('schema:developer:validate')

			return []
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
	name: 'fixture.native-hooks-scope-policy',
	setup: ({ constraintCompilers, registries }) => {
		constraintCompilers.register(scopeConstraintCompiler)
		registries.hooks.register(
			'fixture.native-hooks-guard',
			guard({
				schema: HookArticleSchema,
				handler: ({ context, operation }) => {
					trace(`policy:guard:${operation.kind}`)
					readScopeId(context.metadata)
				},
			}),
		)
		registries.hooks.register(
			'fixture.native-hooks-constraint',
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
		)
		registries.hooks.register(
			'fixture.native-hooks-selection',
			restrictSelection({
				// Selection hides the scope identity before output hooks observe a record.
				handler: () => ['id', 'title', 'secret', 'profile'],
				operations: ['find-many', 'find-one', 'get'],
				schema: HookArticleSchema,
			}),
		)
		registries.hooks.register(
			'fixture.native-hooks-output',
			restrictOutput({
				handler: ({ operation }) => {
					trace(`policy:restrictOutput:${operation.kind}`)

					return ['id', 'title', 'profile']
				},
				operations: ['find-many', 'find-one', 'get'],
				schema: HookArticleSchema,
			}),
		)
	},
})

const behaviorPlugin = definePlugin({
	name: 'fixture.native-hooks-behavior',
	dependencies: ['fixture.native-hooks-scope-policy'],
	setup: ({ hooks, registries }) => {
		hooks.schema('article-lifecycle', HookArticleSchema, {
			afterCreate: ({ result }) => {
				trace('plugin:schema:afterCreate')

				return result
			},
			afterRead: ({ kind, result }) => {
				trace(`plugin:schema:afterRead:${kind}`)

				return result
			},
			beforeCreate: ({ operation }) => {
				trace('plugin:schema:beforeCreate')

				return operation
			},
			beforeRead: ({ kind, query }) => {
				trace(`plugin:schema:beforeRead:${kind}`)

				return query.limit(50)
			},
		})
		hooks.field('article-title', HookArticleSchema, ['title'], {
			resolveOutput: ({ value }) => {
				trace('plugin:field:title:resolveOutput')

				return `${value} [plugin]`
			},
		})
		hooks.fieldKind('profile-slug', profileSlugHookTarget, () => ({
			resolveOutput: ({ value }) => {
				trace('plugin:field-kind:slug:resolveOutput')
				if (value === null) throw new TypeError('slug must be present')

				return `${value}:plugin-kind`
			},
		}))
		registries.events.register(
			'fixture.native-hooks-created-event',
			onEvent({
				name: 'native-hooks.article-created',
				handler: ({ event }) => {
					committedEvents.push(event.name)
					trace(`event:${event.name}`)
				},
			}),
		)
	},
})

const createHookApplication = (connectionUri: string) =>
	new UltimaBase({
		plugins: [
			// Dependency order must place policy setup before its behavior consumer.
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
		requestId: `native-hooks-postgres:${String(requestSequence)}`,
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

describe('native hooks with PostgreSQL', { concurrent: false }, () => {
	it('executes create, save, output, finalization, and event phases in order', async () => {
		hookTrace.length = 0
		committedEvents.length = 0

		const created = await runWithScope('scope-create', () =>
			HookArticleSchema.createOne({
				data: {
					profile: { slug: '  Public-Profile  ' },
					published: true,
					secret: 'private-create-value',
					scopeId: 'scope-create',
					title: '  Create lifecycle  ',
				},
			}),
		)

		expect(created.toJSON()).toMatchObject({
			profile: {
				slug: 'public-profile:developer-output:plugin-kind',
			},
			title: 'CREATE LIFECYCLE [plugin]',
		})
		await expect(
			runWithScope('scope-create', () =>
				HookAuditSchema.query()
					.where((where) => where.eq('action', 'create:Create lifecycle'))
					.exists(),
			),
		).resolves.toBe(true)
		expect(committedEvents).toStrictEqual(['native-hooks.article-created'])
		expectTraceSubsequence([
			'field:title:developer:resolveInput',
			'field:slug:developer:resolveInput',
			'schema:developer:resolveInput',
			'field:title:developer:validate',
			'schema:developer:validate',
			'policy:guard:create-one',
			'plugin:schema:beforeCreate',
			'schema:developer:beforeCreate',
			'field:title:developer:beforeSave',
			'field:title:developer:beforeCreate',
			'field:title:developer:afterCreate',
			'field:title:developer:afterSave',
			'field:title:developer:onChange',
			'field:title:developer:resolveOutput',
			'plugin:field:title:resolveOutput',
			'field:slug:developer:resolveOutput',
			'plugin:field-kind:slug:resolveOutput',
			'schema:developer:afterCreate',
			'plugin:schema:afterCreate',
			'schema:developer:beforeCommit',
			'field:title:developer:afterCommit',
			'schema:developer:afterCommit',
			'event:native-hooks.article-created',
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
				HookArticleSchema.query()
					.where((where) => where.eq('title', 'Rollback after persistence'))
					.exists(),
			),
		).resolves.toBe(false)
		await expect(
			runWithScope('scope-rollback', () =>
				HookAuditSchema.query()
					.where((where) =>
						where.eq('action', 'create:Rollback after persistence'),
					)
					.exists(),
			),
		).resolves.toBe(false)
		expect(committedEvents).toStrictEqual([])
		expect(rollbackTrace).toEqual(
			expect.arrayContaining([
				'field:title:developer:afterRollback',
				'schema:developer:afterRollback',
				'field:title:developer:onError:operation:rolled-back',
				'schema:developer:onError:operation:rolled-back',
			]),
		)
	})

	it('keeps beforeRead transforms inside opaque scope and field restrictions', async () => {
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
			HookArticleSchema.query()
				.where((where) => where.eq('title', 'Shared visible title'))
				.select({
					id: true,
					title: true,
					secret: true,
					profile: true,
					scopeId: true,
				})
				.findMany(),
		)

		expect(visible).toHaveLength(1)
		expect(visible[0]?.toJSON()).toEqual({
			id: visible[0]?.id,
			profile: {
				slug: 'scope-a:developer-output:plugin-kind',
			},
			title: 'SHARED VISIBLE TITLE [plugin]',
		})
		expectTraceSubsequence([
			'policy:guard:find-many',
			'policy:constraint:find-many',
			'plugin:schema:beforeRead:find-many',
			'schema:developer:beforeRead:find-many',
			'field:title:developer:resolveOutput',
			'plugin:field:title:resolveOutput',
			'field:slug:developer:resolveOutput',
			'plugin:field-kind:slug:resolveOutput',
			'schema:developer:afterRead:find-many',
			'plugin:schema:afterRead:find-many',
			'policy:restrictOutput:find-many',
		])

		hookTrace.length = 0
		await expect(
			HookArticleSchema.query().findMany({ ultimabase: getUltimaBase() }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(hookTrace).toContain('policy:guard:find-many')
		expect(hookTrace).not.toContain('plugin:schema:beforeRead:find-many')
	})

	it('wraps update and delete with their exact field and save families', async () => {
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
				where: (where) => where.eq('id', created.id),
				data: { title: 'Updated target' },
			}),
		)
		expectTraceSubsequence([
			'schema:developer:beforeUpdate',
			'field:title:developer:beforeSave',
			'field:title:developer:beforeUpdate',
			'field:title:developer:afterUpdate',
			'field:title:developer:afterSave',
			'field:title:developer:onChange',
			'schema:developer:afterUpdate',
			'schema:developer:beforeCommit',
			'field:title:developer:afterCommit',
			'schema:developer:afterCommit',
		])

		hookTrace.length = 0
		await runWithScope('scope-write', () =>
			HookArticleSchema.deleteOne({
				where: (where) => where.eq('id', created.id),
			}),
		)
		expectTraceSubsequence([
			'schema:developer:beforeDelete',
			'field:title:developer:beforeDelete',
			'field:title:developer:afterDelete',
			'field:title:developer:onChange',
			'schema:developer:afterDelete',
			'schema:developer:beforeCommit',
			'field:title:developer:afterCommit',
			'schema:developer:afterCommit',
		])
	})

	it('keeps updateMany and deleteMany set-based without item field hooks', async () => {
		for (const scopeId of ['scope-bulk-a', 'scope-bulk-b']) {
			await runWithScope(scopeId, () =>
				HookArticleSchema.createOne({
					data: {
						profile: { slug: scopeId },
						published: true,
						scopeId,
						title: 'Bulk scoped target',
					},
				}),
			)
		}
		hookTrace.length = 0

		await expect(
			runWithScope('scope-bulk-a', () =>
				HookArticleSchema.updateMany({
					where: (where) => where.eq('title', 'Bulk scoped target'),
					data: { title: 'Bulk updated target' },
				}),
			),
		).resolves.toHaveLength(1)
		const updateTrace = [...hookTrace]

		expect(updateTrace).toContain('schema:developer:beforeUpdate')
		expect(updateTrace).toContain('schema:developer:afterUpdate')
		expect(updateTrace).not.toContain('field:title:developer:beforeUpdate')
		expect(updateTrace).not.toContain('field:title:developer:afterUpdate')
		expect(updateTrace).not.toContain('field:title:developer:onChange')

		hookTrace.length = 0
		await expect(
			runWithScope('scope-bulk-a', () =>
				HookArticleSchema.deleteMany({
					where: (where) => where.eq('title', 'Bulk updated target'),
				}),
			),
		).resolves.toHaveLength(1)
		const deleteTrace = [...hookTrace]

		expect(deleteTrace).toContain('schema:developer:beforeDelete')
		expect(deleteTrace).toContain('schema:developer:afterDelete')
		expect(deleteTrace).not.toContain('field:title:developer:beforeDelete')
		expect(deleteTrace).not.toContain('field:title:developer:afterDelete')
		expect(deleteTrace).not.toContain('field:title:developer:onChange')
		await expect(
			runWithScope('scope-bulk-b', () =>
				HookArticleSchema.query()
					.where((where) => where.eq('title', 'Bulk scoped target'))
					.exists(),
			),
		).resolves.toBe(true)
	})
})
