import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	Pointer,
	UltimaBase,
	defineEnum,
	toJSON,
	type BinaryJSON,
	type JsonOf,
} from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'

import { isPlainResult } from '../fixtures/plain-results.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0310: results are frozen plain data, and `toJSON` serializes them
// exactly as REST responses do.
const App = UltimaBase.use(accessPlugin({ allowWithoutRule: { all: true } }))
const Priority = defineEnum('PlainResultPriority', ['low', 'high'])

const Author = App.Schema.define({
	className: 'PlainResultAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const Tag = App.Schema.define({
	className: 'PlainResultTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
})

const Item = App.Schema.define({
	className: 'PlainResultItem',
	fields: (field) => ({
		amount: field.decimal(),
		attachment: field.binary(),
		author: field.pointer({ target: 'PlainResultAuthor' }),
		calendarDay: field.date(),
		count: field.int(),
		enabled: field.boolean(),
		eventAt: field.dateTime(),
		externalId: field.uuid(),
		hugeCount: field.bigint(),
		labels: field.string({ list: true }),
		metadata: field.json(),
		priority: field.enum({ values: Priority }),
		profile: field.object({
			fields: (child) => ({
				counter: child.bigint(),
				nickname: child.string(),
			}),
		}),
		ratio: field.float(),
		tags: field.relation({ target: 'PlainResultTag' }),
		title: field.string({ required: true }),
		wakeAt: field.time(),
	}),
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.plain-results-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'plain-results'
const createApplication = (connectionUri: string) =>
	new (App.use(
		restPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'plain-results', value: 'plain-results-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Author, Tag, Item],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const postApplication = async (path: string, body: unknown) => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers({
		'Content-Type': 'application/json',
		[httpApplicationIdHeader]: appId,
	})
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await capture.current.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, {
			body: JSON.stringify(body),
			headers,
			method: 'POST',
		}),
	})
	const json: unknown = await response.json()
	return json
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'plain_results' })
	ultimabase = createApplication(fixture.connectionUri)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

// `select: {}` returns every field, which these assertions compare.
const createItem = async () => {
	const author = await Author.createOne({ data: { name: 'Ada' }, select: {} })
	const tag = await Tag.createOne({ data: { label: 'first' }, select: {} })
	const item = await Item.createOne({
		data: {
			amount: '123456.78',
			attachment: Uint8Array.from([0, 127, 255]),
			author: { connect: author.id },
			calendarDay: '2026-08-01',
			count: 7,
			enabled: true,
			eventAt: '2026-08-01T10:15:30.123Z',
			externalId: '550e8400-e29b-41d4-a716-446655440000',
			hugeCount: 9_007_199_254_740_993n,
			labels: ['typed', 'postgres'],
			metadata: { nested: { verified: true }, priority: 2 },
			priority: 'high',
			profile: { counter: 12n, nickname: 'ada' },
			ratio: 4.75,
			tags: { connect: [tag.id] },
			title: 'Every field kind',
			wakeAt: '08:30:00.456',
		},
		select: {},
	})
	return { author, item, tag }
}

describe('plain data results with PostgreSQL', { concurrent: false }, () => {
	it('returns frozen plain results, included targets included', async () => {
		const { author, item, tag } = await createItem()
		const [loaded] = await Item.findMany({
			where: { id: { eq: item.id } },
			include: { author: {}, tags: {} },
		})
		if (loaded === undefined) throw new TypeError('Expected the item')

		for (const value of [item, loaded, loaded.author, ...loaded.tags]) {
			expect(isPlainResult(value)).toBe(true)
			for (const method of [
				'update',
				'delete',
				'fetch',
				'toJSON',
				'relation',
			]) {
				expect(Reflect.get(Object(value), method)).toBeUndefined()
			}
		}
		expect(loaded.author).toStrictEqual({
			createdAt: author.createdAt,
			id: author.id,
			name: 'Ada',
			updatedAt: author.updatedAt,
		})
		expect(loaded.tags).toStrictEqual([
			{
				createdAt: tag.createdAt,
				id: tag.id,
				label: 'first',
				updatedAt: tag.updatedAt,
			},
		])
		// An unincluded pointer stays a Pointer value.
		expect(Pointer.is(item.author)).toBe(true)
		expect(Reflect.set(item, 'title', 'Changed')).toBe(false)
		expect(item.title).toBe('Every field kind')
	})

	it('serializes every field kind exactly as REST responses do', async () => {
		const { item } = await createItem()
		const where = { id: { eq: item.id } }
		const direct = await Item.findMany({
			where,
			include: { author: {}, tags: {} },
		})
		const rest = await postApplication('/api/classes/PlainResultItem/query', {
			include: { author: {}, tags: {} },
			where,
		})

		expect(() => JSON.stringify(direct)).toThrow(TypeError)
		const json = toJSON(direct)
		expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json)
		expect(rest).toStrictEqual({ nextCursor: null, results: json })
		expect(json[0]).toMatchObject({
			amount: '123456.78',
			attachment: { data: 'AH//', encoding: 'base64', type: 'binary' },
			hugeCount: '9007199254740993',
			profile: { counter: '12', nickname: 'ada' },
		})

		const flat = await Item.findOneOrThrow({ where, select: { author: true } })
		const restFlat = await postApplication(
			'/api/classes/PlainResultItem/query',
			{ select: { author: true }, where },
		)
		expect(restFlat).toMatchObject({ results: [toJSON(flat)] })
		expect(toJSON(flat).author).toStrictEqual({
			className: 'PlainResultAuthor',
			id: flat.author?.id,
			type: 'pointer',
		})
	})

	it('types toJSON as the JSON shape of its input', () => {
		type Row = Readonly<{
			attachment: Uint8Array
			count: bigint
			author: Pointer<typeof Author> | null
			nested: Readonly<{ values: readonly bigint[] }>
		}>
		expectTypeOf<JsonOf<Row>['attachment']>().toEqualTypeOf<BinaryJSON>()
		expectTypeOf<JsonOf<Row>['count']>().toEqualTypeOf<string>()
		expectTypeOf<JsonOf<Row>['nested']['values']>().toEqualTypeOf<
			readonly string[]
		>()
		expectTypeOf<
			NonNullable<JsonOf<Row>['author']>['type']
		>().toEqualTypeOf<'pointer'>()
	})
})
