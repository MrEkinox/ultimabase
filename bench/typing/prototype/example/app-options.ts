// Storage names, a delete that empties a relation, transactions and the
// application's options (D-36, D-49, D-54, D-58, D-63). `tsc` fails if one
// does not hold.
import type { Logger } from '../index.ts'
import { defineApp, defineModel, memory, transaction } from '../index.ts'

const Team = defineModel({
	name: 'Team',
	dbName: 'teams',
	fields: (f) => ({ name: f.string({ dbName: 'team_name' }) }),
})

const Member = defineModel({
	name: 'Member',
	dbName: 'members',
	fields: (f) => ({
		email: f.string({ unique: true, dbName: 'e_mail' }),
		// Deleting the team leaves its members without one.
		team: f.one(() => Team, {
			optional: true,
			onDelete: 'setNull',
			dbName: 'team_ref',
		}),
		settings: f.json({ optional: true, dbName: 'prefs' }),
	}),
})

defineModel({
	name: 'Seat',
	fields: (f) => ({
		// @ts-expect-error: `setNull` needs an optional relation (D-54).
		team: f.one(() => Team, { onDelete: 'setNull' }),
	}),
})
defineModel({
	name: 'Seat',
	fields: (f) => ({
		team: f.one(() => Team, {
			optional: false,
			// @ts-expect-error: a required relation cannot be set to null.
			onDelete: 'setNull',
		}),
	}),
})
defineModel({
	name: 'League',
	fields: (f) => ({
		teams: f.many(() => Team, {
			// @ts-expect-error: a `many` relation stores no column of its own.
			dbName: 'team_ids',
		}),
	}),
})

// Queries inside join the transaction; its result is the callback's.
export const created = await transaction(async () => {
	const team = await Team.create({ data: { name: 'Core' } })
	await Member.create({
		data: { email: 'ada@example.com', team: { connect: { id: team.id } } },
	})
	return team
})
export const teamName: string = created.name
// @ts-expect-error: there is no `tx` to pass along (D-36).
await transaction(async (tx: unknown) => tx)

declare const logger: Logger

export const app = defineApp({
	database: memory(),
	models: [Team, Member],
	masterKey: process.env['ULTIMABASE_MASTER_KEY'],
	logger,
})
defineApp({
	database: memory(),
	models: [Team, Member],
	masterKey: { key: process.env['ULTIMABASE_MASTER_KEY'], production: true },
})
defineApp({
	database: memory(),
	models: [Team, Member],
	// @ts-expect-error: the object form only opens production (D-49).
	masterKey: { key: 'secret', production: false },
})
defineApp({
	database: memory(),
	models: [Team, Member],
	// @ts-expect-error: `console` has no `child` (D-58).
	logger: console,
})
