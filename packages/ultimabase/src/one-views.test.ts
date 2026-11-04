// `one` views on `memory()` (D-240): the one row of a one-to-many `many` that
// its filter keeps, held single by a unique index of the target.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { query } from './engine.ts'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import type { FieldShape } from './model.ts'

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		sprints: f.many(() => Sprint, { inverse: 'project' }),
		activeSprint: f.one(() => Sprint, { from: 'sprints' }),
	}),
}).with({
	access: allow.public,
	relations: {
		activeSprint: { where: ({ where }) => where({ closedAt: null }) },
	},
})

const Sprint = defineModel({
	name: 'Sprint',
	fields: (f) => ({
		name: f.string(),
		secret: f.boolean({ default: false }),
		closedAt: f.dateTime({ optional: true }),
		project: f.one(() => Project),
	}),
	indexes: [{ fields: ['project'], unique: true, where: { closedAt: null } }],
}).with({ access: { read: ({ where }) => where({ secret: false }) } })

const M = { as: master }
let app: ReturnType<typeof defineApp>
let apollo: string

const names = async (where: object) =>
	query(
		'Project',
		'findMany',
		{ where, orderBy: { name: 'asc' }, select: { name: true } },
		M,
	)
const named = (...list: readonly string[]) => list.map((name) => ({ name }))

const typed = () => [
	Project.create(
		// @ts-expect-error -- a one view is read-only
		{ data: { name: 'Eve', activeSprint: { create: { name: 'x' } } } },
		M,
	),
	Project.findMany(
		// @ts-expect-error -- a one view sorts nothing
		{ orderBy: { activeSprint: { name: 'asc' } } },
		M,
	),
]

const declared = () =>
	defineModel({
		name: 'Typed',
		fields: (f) => ({
			sprints: f.many(() => Sprint, { inverse: 'project' }),
			closed: f.many(() => Sprint, { from: 'sprints' }),
			active: f.one(() => Sprint, { from: 'sprints' }),
			// @ts-expect-error -- no such many
			typo: f.one(() => Sprint, { from: 'sprint' }),
			// @ts-expect-error -- a view stores no rows
			viewed: f.one(() => Sprint, { from: 'closed' }),
		}),
	})

describe('a one view', () => {
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Project, Sprint] })
		await app.start()
		const created = await Project.create(
			{
				data: {
					name: 'Apollo',
					sprints: {
						create: [
							{ name: 'One', closedAt: new Date('2026-01-01') },
							{ name: 'Two' },
							{ name: 'Zero', closedAt: new Date('2025-12-01') },
						],
					},
				},
			},
			M,
		)
		apollo = created.id
		await Project.create(
			{
				data: {
					name: 'Gemini',
					sprints: {
						create: [{ name: 'Old', closedAt: new Date('2025-01-01') }],
					},
				},
			},
			M,
		)
		await Project.create(
			{
				data: {
					name: 'Mercury',
					sprints: { create: [{ name: 'Hidden', secret: true }] },
				},
			},
			M,
		)
	})
	afterEach(async () => app.stop())
	it('reads the row of its relation that its filter keeps', async () => {
		const found = await Project.findUniqueOrThrow(
			{
				where: { id: apollo },
				select: { name: true, activeSprint: { select: { name: true } } },
			},
			M,
		)
		expect(found).toStrictEqual({
			name: 'Apollo',
			activeSprint: { name: 'Two' },
		})
		expectTypeOf(found.activeSprint).toEqualTypeOf<{
			readonly name: string
		} | null>()
		const all = await Project.findMany(
			{ orderBy: { name: 'asc' }, include: { activeSprint: true } },
			M,
		)
		expect(all.map((each) => each.activeSprint?.name ?? null)).toStrictEqual([
			'Two',
			null,
			'Hidden',
		])
	})

	it('reads null where the target read rule hides its row', async () => {
		const found = await Project.findMany(
			{ orderBy: { name: 'asc' }, include: { activeSprint: true } },
			{ as: { kind: 'anonymous' } },
		)
		expect(found.map((each) => each.activeSprint?.name ?? null)).toStrictEqual([
			'Two',
			null,
			null,
		])
	})

	it('filters by its row', async () => {
		expect(
			await names({ activeSprint: { is: { name: 'Two' } } }),
		).toStrictEqual(named('Apollo'))
		expect(
			await names({ activeSprint: { is: { name: 'One' } } }),
		).toStrictEqual([])
		expect(await names({ activeSprint: { is: null } })).toStrictEqual(
			named('Gemini'),
		)
		expect(
			await names({ activeSprint: { isNot: { name: 'Two' } } }),
		).toStrictEqual(named('Gemini', 'Mercury'))
		expect(await names({ activeSprint: { isNot: null } })).toStrictEqual(
			named('Apollo', 'Mercury'),
		)
	})

	it('follows the writes of its relation', async () => {
		await Sprint.updateMany(
			{ where: { name: 'Two' }, data: { closedAt: new Date('2026-02-01') } },
			M,
		)
		await Sprint.create(
			{ data: { name: 'Three', project: { connect: { id: apollo } } } },
			M,
		)
		const found = await Project.findUniqueOrThrow(
			{ where: { id: apollo }, include: { activeSprint: true } },
			M,
		)
		expect(found.activeSprint?.name).toBe('Three')
	})

	it('is not written', async () => {
		await expect(
			query(
				'Project',
				'update',
				{ where: { id: apollo }, data: { activeSprint: { disconnect: true } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.activeSprint',
		})
		await expect(
			query(
				'Project',
				'create',
				{ data: { name: 'Eve', activeSprint: { create: { name: 'x' } } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.activeSprint',
		})
	})

	it('sorts nothing', async () => {
		await expect(
			query(
				'Project',
				'findMany',
				{ orderBy: { activeSprint: { name: 'asc' } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'orderBy.activeSprint: Project.activeSprint is a one view, which sorts nothing.',
		})
	})

	it('is absent from the types of data and of orderBy', () => {
		expect(typed).toBeTypeOf('function')
	})

	it('names in from a many that stores its rows', () => {
		expect(declared).toBeTypeOf('function')
	})
})

/** The indexes of `Member` an application starts with. */
const shapes = {
	open: [{ fields: ['team'], unique: true, where: { leftAt: null } }],
	whole: [{ fields: ['team'], unique: true }],
	none: [],
	pair: [{ fields: ['team', 'name'], unique: true }],
	other: [
		{ fields: ['team'], unique: true, where: { name: 'x' } },
		{ fields: ['team'] },
	],
} as const

/**
 * Starts an application whose `Team.view` takes `options`, filtered by
 * `where`, with the indexes `shapes[indexes]` on `Member`.
 */
const start = async ({
	options = { from: 'members' },
	where = ({ where: kept }: { where: (filter: object) => object }) =>
		kept({ leftAt: null }),
	indexes = 'open',
}: {
	readonly options?: { readonly from: string }
	readonly where?: unknown
	readonly indexes?: keyof typeof shapes
} = {}) => {
	const Team = defineModel({
		name: 'Team',
		fields: (f) => ({
			members: f.many(() => Member, { inverse: 'team' }),
			tags: f.many(() => Tag, { inverse: 'teams' }),
			former: f.many(() => Member, { from: 'members' }),
			// Widened, as JavaScript would leave it.
			view: f.one(() => Member, options) as FieldShape,
		}),
	})
	Reflect.apply(Reflect.get(Team, 'with'), Team, [
		{
			relations: {
				former: { where: () => true },
				...(where === null ? {} : { view: { where } }),
			},
		},
	])
	const Member = defineModel({
		name: 'Member',
		fields: (f) => ({
			name: f.string(),
			leftAt: f.dateTime({ optional: true }),
			team: f.one(() => Team),
		}),
		indexes: shapes[indexes],
	})
	const Tag = defineModel({
		name: 'Tag',
		fields: (f) => ({ teams: f.many(() => Team, { inverse: 'tags' }) }),
	})
	const started = defineApp({ database: memory(), models: [Team, Member, Tag] })
	await started.start()
	await started.stop()
}

describe('a one view', () => {
	it('starts on a unique index whose where its filter keeps', async () => {
		await expect(start()).resolves.toBeUndefined()
		await expect(start({ indexes: 'whole' })).resolves.toBeUndefined()
		await expect(
			start({
				where: ({ where }: { where: (filter: object) => object }) =>
					where({ AND: [{ leftAt: null }, { name: 'x' }] }),
			}),
		).resolves.toBeUndefined()
	})

	it('stops startup unless a unique index holds its row single', async () => {
		const as =
			"give Member a unique index on team whose where the filter keeps, as { fields: ['team'], unique: true, where: { leftAt: null } }."
		await expect(start({ indexes: 'none' })).rejects.toThrow(
			`Team.view reads one Member: ${as}`,
		)
		await expect(start({ indexes: 'pair' })).rejects.toThrow(as)
		await expect(start({ indexes: 'other' })).rejects.toThrow(as)
		await expect(
			start({
				indexes: 'none',
				where: ({ where }: { where: (filter: object) => object }) =>
					where({ name: { startsWith: 'a' } }),
			}),
		).rejects.toThrow(
			'Team.view reads one Member: give Member a unique index on team whose where the filter keeps.',
		)
	})

	it('stops startup unless it reads a one-to-many relation', async () => {
		await expect(start({ options: { from: 'ghost' } })).rejects.toThrow(
			"Team.view: from 'ghost' is not a many relation.",
		)
		await expect(start({ options: { from: 'former' } })).rejects.toThrow(
			"Team.view: from 'former' is a view; name its relation.",
		)
		await expect(start({ options: { from: 'tags' } })).rejects.toThrow(
			"Team.view: from 'tags' relates to Tag, not Member.",
		)
	})

	it('takes only from', async () => {
		for (const key of ['optional', 'inverse', 'onDelete']) {
			await expect(
				start({ options: { from: 'members', [key]: true } }),
			).rejects.toThrow(`Team.view is a view and takes no ${key}.`)
		}
	})

	it('stops startup on a filter it cannot run once', async () => {
		await expect(start({ where: null })).rejects.toThrow(
			'Team.view is a view; filter it in .with({ relations }).',
		)
		await expect(start({ where: () => true })).rejects.toThrow(
			'Team.with.relations.view.where returns where({ ... }).',
		)
		await expect(
			start({
				where: ({ where }: { where: (filter: object) => object }) =>
					where({ team: { is: { former: { some: {} } } } }),
			}),
		).rejects.toThrow(
			"Team.with.relations.view.where: Team.former is filtered, which a one view's filter does not read.",
		)
		await expect(
			start({
				where: ({ where }: { where: (filter: object) => object }) =>
					where({ ghost: true }),
			}),
		).rejects.toMatchObject({ name: 'Refused' })
	})
})

describe('a one view', () => {
	it('reads no viewer: its filter runs once, at startup', async () => {
		// A variable, so no excess property check: without `Register`, no
		// filter takes `viewer`.
		const viewing = { viewer: true, isNot: undefined }
		const users = definePlugin({ name: 'users', userModel: true })
		const Account = defineModel({
			name: 'Account',
			use: [users.use()],
			fields: (f) => ({ seats: f.many(() => Seat, { inverse: 'holder' }) }),
		})
		const Club = defineModel({
			name: 'Club',
			fields: (f) => ({
				seats: f.many(() => Seat, { inverse: 'club' }),
				mine: f.one(() => Seat, { from: 'seats' }),
			}),
		}).with({
			relations: {
				mine: { where: ({ where }) => where({ holder: viewing }) },
			},
		})
		const Seat = defineModel({
			name: 'Seat',
			fields: (f) => ({
				club: f.one(() => Club),
				holder: f.one(() => Account),
			}),
			indexes: [{ fields: ['club'], unique: true }],
		})
		const accounts = defineApp({
			database: memory(),
			plugins: [users.plugin()],
			models: [Account, Club, Seat],
		})
		await expect(accounts.start()).rejects.toThrow(
			'Club.with.relations.mine.where reads no viewer: it runs once, at startup.',
		)
	})
})
