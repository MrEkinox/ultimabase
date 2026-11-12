// `JobsRun` (D-221): one row for each pending or failed run, and one for each
// recurring job, holding its next due time; a run of a keyed job holds its
// key while it runs (D-365). No transport exposes it (D-110).
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { runningOf } from './state.ts'

export const M: { readonly as: typeof master } = { as: master }

type Optional<V> = Field<V | null, { readonly optional: true }>

type RunFields = {
	/** The job's name. */
	readonly job: Field<string, ScalarOptions<string>>
	/** A recurring job's name, on its one row. */
	readonly recurring: Field<
		string | null,
		{ readonly optional: true; readonly unique: true }
	>
	/** A keyed job's job and key, as JSON (D-365). */
	readonly key: Optional<string>
	/** The key, while the run runs: one run of a key runs at a time. */
	readonly holding: Field<
		string | null,
		{ readonly optional: true; readonly unique: true }
	>
	/** A recurring job's `every` or `cron`, which tells when it changed. */
	readonly schedule: Optional<string>
	readonly input: Field<
		unknown,
		{ readonly optional: true },
		never,
		never,
		unknown,
		true
	>
	readonly state: Field<string, ScalarOptions<string>>
	readonly dueAt: Field<Date, ScalarOptions<Date>>
	/** The runs that failed. */
	readonly attempts: Field<number, { readonly integer: true }>
	/** Until when an instance holds the row. */
	readonly lockedUntil: Optional<Date>
	/** The last failure's message. */
	readonly error: Optional<string>
}

export const JobsRun: ModelOf<'JobsRun', RunFields, []> = defineModel({
	name: 'JobsRun',
	fields: (f) => ({
		job: f.string(),
		recurring: f.string({ optional: true, unique: true }),
		key: f.string({ optional: true }),
		holding: f.string({ optional: true, unique: true }),
		schedule: f.string({ optional: true }),
		input: f.json({ optional: true }),
		state: f.string(),
		dueAt: f.dateTime(),
		attempts: f.number({ integer: true }),
		lockedUntil: f.dateTime({ optional: true }),
		error: f.string({ optional: true }),
	}),
	indexes: [{ fields: ['state', 'dueAt'] }, { fields: ['key'] }],
}).with({
	hooks: {
		// A run due now starts once its write committed, in this instance.
		afterCreateCommit: ({ record }) => {
			if (record.recurring === null && record.dueAt.getTime() <= Date.now()) {
				runningOf('A run').kick(record)
			}
		},
	},
})
