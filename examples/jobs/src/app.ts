// The application: calls whose room closes in a job, a purge every hour and
// a report each night, and a plugin's weekly digest. The jobs run on every
// server, each run on one.
import { httpPlugin } from '@ultimabase/http'
import { defineJob, jobsPlugin } from '@ultimabase/jobs'
import { defineApp, master, memory } from 'ultimabase'
import { digestPlugin } from './digest.ts'
import { Call, closeRoom, syncRoom } from './models.ts'
import { outbox } from './services.ts'

const day = 24 * 60 * 60 * 1000

//#region every
// Every hour from the start, in milliseconds.
export const purgeCalls = defineJob({
	name: 'purgeCalls',
	every: 60 * 60 * 1000,
	run: async () => {
		const before = new Date(Date.now() - 30 * day)
		await Call.deleteMany(
			{ where: { endedAt: { lt: before } } },
			{ as: master },
		)
	},
})
//#endregion

//#region cron
// At 3:00 each night in Paris, daylight saving included; UTC by default.
export const nightlyReport = defineJob({
	name: 'nightlyReport',
	cron: '0 3 * * *',
	timeZone: 'Europe/Paris',
	run: async () => {
		const since = new Date(Date.now() - day)
		const ended = await Call.count(
			{ where: { endedAt: { gte: since } } },
			{ as: master },
		)
		outbox.push(`Calls ended yesterday: ${ended}.`)
	},
})
//#endregion

//#region plugins
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000, and answers /health.
	plugins: [
		httpPlugin(),
		jobsPlugin({ jobs: [closeRoom, syncRoom, purgeCalls, nightlyReport] }),
		// Its job runs with these; no job to list for it.
		digestPlugin(),
	],
	models: [Call],
})
//#endregion
