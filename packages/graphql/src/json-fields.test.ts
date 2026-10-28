// Json fields over GraphQL (D-125): typed from their schema's JSON Schema
// export, `JSON` without one or for a piece GraphQL cannot type, filtered
// by `JSONFilter` (D-149), their dates sent back as text.
import { httpPlugin } from '@ultimabase/http'
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import type { Logger } from 'ultimabase'
import {
	allow,
	master,
	defineApp,
	defineFunction,
	defineModel,
	memory,
} from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, post } from './test/app.ts'

const Address = z
	.object({ city: z.string(), zip: z.string().optional() })
	.meta({ id: 'Address' })

const Prefs = z.object({
	theme: z.enum(['light', 'dark']),
	size: z.int().default(12),
	since: z.iso.datetime().optional(),
	home: z.object({ street: z.string() }).optional(),
	shipTo: Address.optional(),
	either: z.union([z.string(), z.int()]).optional(),
	labels: z.object({ 'odd-key': z.string() }).optional(),
})

const Profile = defineModel({
	name: 'Profile',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		prefs: f.json({ validate: Prefs }),
		bio: f.json({ optional: true, validate: z.object({ text: z.string() }) }),
		maybe: f.json({ validate: z.object({ a: z.int() }).nullable() }),
		notes: f.json({ optional: true }),
		checked: f.json({ optional: true, validate: (value) => value }),
		team: f.one(() => Team, { optional: true }),
	}),
}).with({ access: allow.readOnly })

const Team = defineModel({
	name: 'Team',
	use: [graphql()],
	fields: (f) => ({ name: f.string(), members: f.many(() => Profile) }),
}).with({ access: allow.readOnly })

const ship = defineFunction({
	name: 'ship',
	input: z.object({ to: Address }),
	output: Address,
	run: ({ input }) => input.to,
}).with({ access: allow.public })

let schema: GraphQLSchema | undefined
const listening = (lines: unknown[]) => {
	const line = lines.find(
		(first) => typeof first === 'string' && first.startsWith('Listening on'),
	)
	return `${String(line).replace(/^Listening on (.*)\.$/, '$1')}/graphql`
}
const loggerOf = (lines: unknown[]): Logger => {
	const logger: Logger = {
		info: (first) => {
			lines.push(first)
		},
		warn: () => {},
		error: () => {},
		child: () => logger,
	}
	return logger
}

const lines: unknown[] = []
const app = defineApp({
	database: memory(),
	plugins: [
		httpPlugin({ port: 0 }),
		graphqlPlugin({
			extend: (generated) => {
				schema = generated
				return generated
			},
		}),
	],
	models: [Profile, Team],
	functions: [ship],
	masterKey: 'secret',
	logger: loggerOf(lines),
})
let url = ''

const typeOf = (name: string): string => {
	const type = schema?.getType(name)
	return type === undefined ? 'none' : printType(type)
}

describe('a typed json field', () => {
	beforeAll(async () => {
		await app.start()
		url = listening(lines)
	})
	afterAll(async () => app.stop())

	it('reads its output type and writes its input type', () => {
		expect(typeOf('Profile')).toContain(
			'  prefs: ProfilePrefs!\n  bio: ProfileBio\n  maybe: ProfileMaybe\n  notes: JSON\n  checked: JSON\n',
		)
		expect(typeOf('ProfilePrefs')).toBe(
			[
				'type ProfilePrefs {',
				'  theme: ProfilePrefsTheme!',
				'  size: Int!',
				'  since: DateTime',
				'  home: ProfilePrefsHome',
				'  shipTo: Address',
				'  either: JSON',
				'  labels: JSON',
				'}',
			].join('\n'),
		)
	})

	it('writes its input type, defaults made optional', () => {
		expect(typeOf('ProfilePrefsInput')).toBe(
			[
				'input ProfilePrefsInput {',
				'  theme: ProfilePrefsTheme!',
				'  size: Int',
				'  since: DateTime',
				'  home: ProfilePrefsHomeInput',
				'  shipTo: AddressInput',
				'  either: JSON',
				'  labels: JSON',
				'}',
			].join('\n'),
		)
		expect(typeOf('ProfileCreateInput')).toContain(
			'  prefs: ProfilePrefsInput!\n  bio: ProfileBioInput\n  maybe: ProfileMaybeInput!\n  notes: JSON\n  checked: JSON\n',
		)
		expect(typeOf('ProfileUpdateInput')).toContain(
			'  prefs: ProfilePrefsInput\n',
		)
	})

	it('names relation writes after their target and the relation back (D-138)', () => {
		expect(typeOf('ProfileCreateInput')).toContain(
			'  team: TeamCreateNestedOneWithoutMembersInput\n',
		)
		expect(typeOf('TeamCreateNestedOneWithoutMembersInput')).toBe(
			[
				'input TeamCreateNestedOneWithoutMembersInput @oneOf {',
				'  connect: ConnectInput',
				'  connectOrCreate: TeamCreateOrConnectWithoutMembersInput',
				'  create: TeamCreateWithoutMembersInput',
				'}',
			].join('\n'),
		)
		expect(typeOf('TeamCreateWithoutMembersInput')).toBe(
			'input TeamCreateWithoutMembersInput {\n  name: String!\n}',
		)
		expect(typeOf('TeamUpdateOneWithoutMembersNestedInput')).toBe(
			[
				'input TeamUpdateOneWithoutMembersNestedInput @oneOf {',
				'  connect: ConnectInput',
				'  connectOrCreate: TeamCreateOrConnectWithoutMembersInput',
				'  create: TeamCreateWithoutMembersInput',
				'  delete: Boolean',
				'  disconnect: Boolean',
				'  update: TeamUpdateWithoutMembersInput',
				'}',
			].join('\n'),
		)
		expect(typeOf('ProfileUpdateManyWithoutTeamNestedInput')).toBe(
			[
				'input ProfileUpdateManyWithoutTeamNestedInput {',
				'  connect: [ConnectInput!]',
				'  connectOrCreate: [ProfileCreateOrConnectWithoutTeamInput!]',
				'  create: [ProfileCreateWithoutTeamInput!]',
				'  delete: [ProfileWhereUniqueInput!]',
				'  disconnect: [ConnectInput!]',
				'  set: [ConnectInput!]',
				'  update: [ProfileUpdateWithWhereUniqueWithoutTeamInput!]',
				'}',
			].join('\n'),
		)
		expect(typeOf('ProfileCreateOrConnectWithoutTeamInput')).toBe(
			[
				'input ProfileCreateOrConnectWithoutTeamInput {',
				'  where: ProfileWhereUniqueInput!',
				'  create: ProfileCreateWithoutTeamInput!',
				'}',
			].join('\n'),
		)
		expect(typeOf('ProfileUpdateWithWhereUniqueWithoutTeamInput')).toBe(
			[
				'input ProfileUpdateWithWhereUniqueWithoutTeamInput {',
				'  where: ProfileWhereUniqueInput!',
				'  data: ProfileUpdateWithoutTeamInput!',
				'}',
			].join('\n'),
		)
		expect(typeOf('TeamUpdateWithoutMembersInput')).toBe(
			'input TeamUpdateWithoutMembersInput {\n  name: String\n}',
		)
		expect(typeOf('ProfileCreateWithoutTeamInput')).toContain(
			'  prefs: ProfilePrefsInput!\n',
		)
		expect(typeOf('ProfileCreateWithoutTeamInput')).not.toContain('team')
	})

	it('shares a type given an id with functions', () => {
		expect(typeOf('AddressInput')).toBe(
			'input AddressInput {\n  city: String!\n  zip: String\n}',
		)
		expect(typeOf('Mutation')).toContain(
			'  ship(to: AddressInput!): Address!\n',
		)
	})

	it('is filtered by JSONFilter, at a path or whole', () => {
		expect(typeOf('JSONFilter')).toBe(
			[
				'input JSONFilter {',
				'  path: [String!]',
				'  equals: JSON',
				'  not: JSON',
				'  in: [JSON!]',
				'  notIn: [JSON!]',
				'  lt: JSON',
				'  lte: JSON',
				'  gt: JSON',
				'  gte: JSON',
				'  stringContains: String',
				'  stringStartsWith: String',
				'  stringEndsWith: String',
				'  mode: QueryMode',
				'  arrayContains: JSON',
				'  arrayStartsWith: JSON',
				'  arrayEndsWith: JSON',
				'}',
			].join('\n'),
		)
		expect(typeOf('ProfileWhereInput')).toContain(
			'  prefs: JSONFilter\n  bio: JSONFilter\n  maybe: JSONFilter\n  notes: JSONFilter\n  checked: JSONFilter\n',
		)
	})

	it('writes and reads a value, its dates as text', async () => {
		const prefs = `{ theme: dark, since: "2026-01-31T12:00:00Z", shipTo: { city: "Lyon" } }`
		const created = await post(
			url,
			`mutation { createProfile(data: { name: "a", prefs: ${prefs}, maybe: { a: 1 }, notes: { any: [1] } }) {
				prefs { theme size since shipTo { city zip } } maybe { a } notes } }`,
			undefined,
			asMaster,
		)
		expect(created).toStrictEqual({
			data: {
				createProfile: {
					prefs: {
						theme: 'dark',
						size: 12,
						since: '2026-01-31T12:00:00.000Z',
						shipTo: { city: 'Lyon', zip: null },
					},
					maybe: { a: 1 },
					notes: { any: [1] },
				},
			},
		})
		const stored = await Profile.findMany(
			{ where: { name: 'a' } },
			{ as: master },
		)
		expect(stored[0]?.prefs.since).toBe('2026-01-31T12:00:00Z')
		const updated = await post(
			url,
			`mutation($id: ID!) { updateProfile(where: { id: $id }, data: { bio: { text: "hi" } }) { bio { text } } }`,
			{ id: stored[0]?.id },
			asMaster,
		)
		expect(updated).toStrictEqual({
			data: { updateProfile: { bio: { text: 'hi' } } },
		})
	})

	it('stores the dates of a row it creates through a relation as text', async () => {
		const created = await post(
			url,
			`mutation { createTeam(data: { name: "far", members: { create: [
				{ name: "c", prefs: { theme: light, since: "2026-02-01T08:00:00Z" }, maybe: { a: 1 } }
			] } }) { members { edges { node { prefs { since } } } } } }`,
			undefined,
			asMaster,
		)
		expect(created).toStrictEqual({
			data: {
				createTeam: {
					members: {
						edges: [{ node: { prefs: { since: '2026-02-01T08:00:00.000Z' } } }],
					},
				},
			},
		})
		const [stored] = await Profile.findMany(
			{ where: { name: 'c' } },
			{ as: master },
		)
		expect(stored?.prefs.since).toBe('2026-02-01T08:00:00Z')
	})

	it('stores the dates of the rows it updates or connects or creates through a relation as text (D-138)', async () => {
		const team = await Team.create({ data: { name: 'near' } }, { as: master })
		const [c] = await Profile.findMany({ where: { name: 'c' } }, { as: master })
		const ids = { team: team.id, c: c?.id }
		const moved = await post(
			url,
			`mutation($team: ID!, $c: ID!) { updateTeam(where: { id: $team }, data: {
				members: { set: [{ id: $c }] } }) { members { edges { node { name } } } } }`,
			ids,
			asMaster,
		)
		expect(moved).toStrictEqual({
			data: { updateTeam: { members: { edges: [{ node: { name: 'c' } }] } } },
		})
		const written = await post(
			url,
			`mutation($team: ID!, $c: ID!) { updateTeam(where: { id: $team }, data: { members: {
				connectOrCreate: [{ where: { id: "none" }, create: {
					name: "d", prefs: { theme: dark, since: "2026-03-01T00:00:00Z" }, maybe: { a: 1 } } }],
				update: [{ where: { id: $c }, data: { prefs: { theme: light, since: "2026-04-01T00:00:00Z" } } }]
			} }) { members(orderBy: [{ name: asc }]) { edges { node { name prefs { since } } } } } }`,
			ids,
			asMaster,
		)
		expect(written).toStrictEqual({
			data: {
				updateTeam: {
					members: {
						edges: [
							{
								node: {
									name: 'c',
									prefs: { since: '2026-04-01T00:00:00.000Z' },
								},
							},
							{
								node: {
									name: 'd',
									prefs: { since: '2026-03-01T00:00:00.000Z' },
								},
							},
						],
					},
				},
			},
		})
		const stored = await Profile.findMany(
			{ where: { team: { is: { id: team.id } } }, orderBy: { name: 'asc' } },
			{ as: master },
		)
		expect(stored.map((row) => row.prefs.since)).toStrictEqual([
			'2026-04-01T00:00:00Z',
			'2026-03-01T00:00:00Z',
		])
	})

	it('refuses a value its schema refuses', async () => {
		const refused = await post(
			url,
			`mutation { createProfile(data: { name: "b", prefs: { theme: dark, size: 0.5 }, maybe: { a: 1 } }) { id } }`,
			undefined,
			asMaster,
		)
		expect(refused.errors?.[0]?.message).toContain('Int cannot represent')
	})

	it('filters with a date inside, through AND, a relation and a count', async () => {
		const [a] = await Profile.findMany({ where: { name: 'a' } }, { as: master })
		await Team.create(
			{ data: { name: 'core', members: { connect: [{ id: a?.id ?? '' }] } } },
			{ as: master },
		)
		const found = await post(
			url,
			`{ profiles(first: 5, where: { AND: [{ prefs: { equals: { theme: dark, size: 12, since: "2026-01-31T12:00:00Z", shipTo: { city: "Lyon" } } } }] }) {
				totalCount edges { node { name } } }
				teams(first: 5, where: { members: { some: { prefs: { in: [{ theme: dark, size: 12, since: "2026-01-31T12:00:00Z", shipTo: { city: "Lyon" } }] } } } }) {
				edges { node { name } } } }`,
		)
		expect(found).toStrictEqual({
			data: {
				profiles: { totalCount: 1, edges: [{ node: { name: 'a' } }] },
				teams: { edges: [{ node: { name: 'core' } }] },
			},
		})
	})

	it('filters at a path into a typed or an untyped value', async () => {
		const found = await post(
			url,
			`{ city: profiles(first: 5, where: { prefs: { path: ["shipTo", "city"], stringStartsWith: "ly", mode: insensitive } }) {
				edges { node { name } } }
				notes: profiles(first: 5, where: { notes: { path: ["any"], arrayContains: 1 } }) {
				edges { node { name } } }
				none: profiles(first: 5, where: { NOT: { prefs: { path: ["size"], gte: 12 } } }) {
				edges { node { name } } } }`,
		)
		expect(found).toStrictEqual({
			data: {
				city: { edges: [{ node: { name: 'a' } }] },
				notes: { edges: [{ node: { name: 'a' } }] },
				none: { edges: [] },
			},
		})
		const refused = await post(
			url,
			`{ profiles(first: 5, where: { prefs: { path: ["size"], in: [12] } }) { totalCount } }`,
		)
		expect(refused.errors?.[0]?.message).toContain('where.prefs.in')
	})
})

/** Starts and stops an application of `models`, rejecting a refusal. */
async function serving(
	models: Parameters<typeof defineApp>[0]['models'],
	functions: Parameters<typeof defineApp>[0]['functions'] = [],
) {
	const started = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), graphqlPlugin()],
		models,
		functions,
		logger: loggerOf([]),
	})
	await started.start()
	await started.stop()
}

describe('startup', () => {
	it('refuses a field type named like a generated one', async () => {
		await expect(
			serving([
				defineModel({
					name: 'User',
					fields: (f) => ({
						prefsTheme: f.enumOf(['a']),
						prefs: f.json({ validate: z.object({ theme: z.enum(['b']) }) }),
					}),
				}),
			]),
		).rejects.toThrow(
			"User.prefs: the type UserPrefsTheme is a generated type's name.",
		)
		const connection = z
			.object({ a: z.string() })
			.meta({ id: 'UserConnection' })
		await expect(
			serving([
				defineModel({
					name: 'User',
					fields: (f) => ({ prefs: f.json({ validate: connection }) }),
				}),
			]),
		).rejects.toThrow(
			"User.prefs: the type UserConnection is a generated type's name.",
		)
	})

	it('refuses an id given two shapes, naming both owners', async () => {
		const other = z.object({ street: z.string() }).meta({ id: 'Address' })
		await expect(
			serving(
				[
					defineModel({
						name: 'User',
						fields: (f) => ({ home: f.json({ validate: other }) }),
					}),
				],
				[ship],
			),
		).rejects.toThrow('give the type Address two shapes; name each once.')
	})
})
