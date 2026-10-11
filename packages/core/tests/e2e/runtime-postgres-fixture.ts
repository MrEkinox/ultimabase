import {
	databaseAdapterCapability,
	UltimaBase,
	type SchemaResult,
} from '@ultimabase/core'

import { hooksPlugin } from '@ultimabase/hooks-plugin'

import { afterAll, beforeAll, expect } from 'vitest'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	QueryBuilder,
	type RequestContext,
	RequestContextValue,
	plugin as createPlugin,
	contributeApplication,
	requireCapability,
} from '@ultimabase/core/plugin'

export const databaseAdapterRequirement = requireCapability(
	databaseAdapterCapability,
	'^1.0.0',
)
export const databaseAdapterConsumerPlugin = createPlugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.runtime-postgres.adapter-consumer',
	contributions: [
		databaseAdapterRequirement,
		contributeApplication(({ capabilities }) => ({
			exports: capabilities.get(databaseAdapterRequirement),
		})),
	],
})
const RuntimeSchemaApplication = UltimaBase.use(hooksPlugin())

export const PostSchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimePost',
	fields: (field) => ({
		attachment: field.binary(),
		calendarDay: field.date(),
		eventAt: field.dateTime(),
		exactAmount: field.decimal({ precision: 12, scale: 2 }),
		externalId: field.uuid(),
		hugeCount: field.bigint(),
		labels: field.string({ list: true }),
		metadata: field.json(),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string({ required: true }),
				level: field.int(),
			}),
		}),
		published: field.boolean({ default: false }),
		rating: field.float(),
		status: field.enum({ values: ['draft', 'published'] }),
		title: field.string({ required: true }),
		views: field.int({ default: 0 }),
		wakeAt: field.time(),
	}),
})

export const HookAuditSchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimeHookAudit',
	fields: (field) => ({
		action: field.string({ required: true }),
	}),
})

export const BulkAccountSchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimeBulkAccount',
	fields: (field) => ({
		email: field.string({
			indexed: 'unique',
			required: true,
		}),
		handle: field.string({ required: true }),
		tenantId: field.string({ required: true }),
		visits: field.int({ default: 0 }),
	}),
	indexes: [{ fields: ['tenantId', 'handle'], unique: true }],
})

export const AfterReadIdentitySchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimeAfterReadIdentity',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

export const authorityPrincipal = new RequestContextValue<string>(
	'fixture.postgres.principal',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('PostgreSQL fixture principal must be a string')
		}

		return value
	},
)
export const authorityObservations: Readonly<{
	mode: string
	principal: string | undefined
}>[] = []
export const AuthorityRecordSchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimeAuthorityRecord',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	hooks: {
		beforeOperation: {
			create: ({ context, item }) => {
				// Snapshot revocable hook capabilities before the callback completes.
				authorityObservations.push({
					mode: context.access.mode,
					principal: context.getValue(authorityPrincipal),
				})

				void item
			},
		},
	},
})

export const hookRollbackError = new Error('rollback HookContext nested write')
export const HookPostSchema = RuntimeSchemaApplication.Schema.define({
	className: 'RuntimeHookPost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	hooks: {
		beforeOperation: {
			create: async ({ item }) => {
				const title = item.title

				if (typeof title !== 'string') {
					throw new TypeError('Runtime hook item title must be a string')
				}

				await HookAuditSchema.createOne({
					data: { action: `create:${title}` },
				})

				if (title === 'rollback') {
					throw hookRollbackError
				}
			},
		},
	},
})

export const createInstant = '2026-08-01T08:00:00.000Z'
export const updateInstant = '2026-08-01T09:30:00.000Z'
export const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
export const allFieldValues = {
	attachment: Uint8Array.from([0, 127, 255]),
	calendarDay: '2026-08-01',
	eventAt: '2026-08-01T10:15:30.123Z',
	exactAmount: '123456.78',
	externalId: '550e8400-e29b-41d4-a716-446655440000',
	hugeCount: 9_007_199_254_740_993n,
	labels: ['typed', 'postgres'],
	metadata: { nested: { verified: true }, priority: 2 },
	profile: { displayName: 'Ada', level: 7 },
	rating: 4.75,
	status: 'draft',
	title: 'First real E2E',
	wakeAt: '08:30:00.456',
} as const

// These side-effect-free values also exercise packed result and QueryBuilder declarations.
export const packedDraft = () =>
	PostSchema.findOneOrThrow({ select: { title: true } })
export const PackedModelSchema = UltimaBase.Schema.define({
	className: 'PackedModel',
	fields: (field) => ({ title: field.string() }),
})
export const packedQuery = new QueryBuilder(PostSchema).select({
	id: true,
	title: true,
})
export const packedAtomicCreate = () =>
	PostSchema.createMany({ data: [{ title: 'Packed bulk draft' }] })
export declare const packedContext: RequestContext
export const packedMasterFind = () =>
	PostSchema.findMany(undefined, { useMasterKey: true })
export const packedContextFind = () =>
	PostSchema.findMany(undefined, { context: packedContext })
export const packedDraftCreate = () =>
	PackedModelSchema.createOne({ data: { title: 'Packed' } })
// ADR-0310: a result is frozen plain data without model methods.
export declare const packedResult: SchemaResult<
	typeof PackedModelSchema,
	{ readonly id: string; readonly title: string }
>
export const packedModelUpdate = () =>
	PackedModelSchema.updateOne({ where: { id: 'p' }, data: { title: 'U' } })
export const packedModelPointer = () =>
	PackedModelSchema.pointer(packedResult.id)
export const packedQueryUpdate = () =>
	PostSchema.updateOne({
		where: { id: 'packed-post' },
		data: { title: 'Packed query update' },
	})
export const packedQueryDelete = () =>
	PostSchema.deleteOne(
		{ where: { id: 'packed-post' } },
		{ context: packedContext },
	)
void packedDraft
void packedQuery
void packedAtomicCreate
void packedMasterFind
void packedContextFind
void packedDraftCreate
void packedModelUpdate
void packedModelPointer
void packedQueryUpdate
void packedQueryDelete

export let fixture: PostgresWorkerFixture | undefined

export const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL worker fixture has not started')
	}

	return fixture
}

/** Proves that a competing preparation remains blocked by the retained row lock. */
export const expectPreparationPending = async (
	preparation: Promise<unknown>,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined
	const state = await Promise.race([
		preparation.then(
			() => 'settled' as const,
			() => 'settled' as const,
		),
		new Promise<'pending'>((resolve) => {
			timer = setTimeout(() => {
				resolve('pending')
			}, 50)
		}),
	])

	if (timer !== undefined) clearTimeout(timer)
	expect(state).toBe('pending')
}

// The global Testcontainer is shared, but this file owns one reset worker namespace.
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})
