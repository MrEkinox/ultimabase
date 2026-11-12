// A plugin that brings its own job: the application lists the plugin, and
// its job runs with the application's (D-369).
import type { Jobs } from '@ultimabase/jobs'
import { defineJob, jobsPlugin } from '@ultimabase/jobs'
import type { PluginTypes } from 'ultimabase'
import { definePlugin, master } from 'ultimabase'
import { Call } from './models.ts'
import { outbox } from './services.ts'

const week = 7 * 24 * 60 * 60 * 1000

// Its jobs' names start with the plugin's: no other job takes them.
const weeklyDigest = defineJob({
	name: 'digest.weekly',
	cron: '0 9 * * 1',
	timeZone: 'Europe/Paris',
	run: async () => {
		const since = new Date(Date.now() - week)
		const calls = await Call.count(
			{ where: { createdAt: { gte: since } } },
			{ as: master },
		)
		outbox.push(`Calls this week: ${calls}.`)
	},
})

//#region plugin
interface Digest extends PluginTypes {
	readonly name: 'digest'
	readonly requires: Jobs
}

export const digestPlugin = definePlugin<Digest>({
	name: 'digest',
	manifest: {
		name: 'example-digest',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*', '@ultimabase/jobs': '*' },
	},
	requires: { jobs: jobsPlugin },
	// `api` runs before any start, when jobsPlugin takes the jobs.
	api: ({ plugins }) => {
		plugins.jobs.add([weeklyDigest])
	},
}).plugin
//#endregion
