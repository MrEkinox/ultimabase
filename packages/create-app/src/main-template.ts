import { hasHttpListener } from './api-template.js'
import type { InitializerPlan } from './config.js'
import { needsMasterKey } from './security-template.js'

/** Seeds the example only into an empty table, so restarts never add Tasks. */
const taskCommand = (plan: InitializerPlan): string => {
	const master = needsMasterKey(plan)
	return `// Seed the example Task only once; later starts print the existing record.
const task =
  (await Task.findOne(${master ? '{}, { useMasterKey: true }' : ''})) ??
  (await Task.createOne(
    { data: { title: 'Ship the first feature' } }${master ? ',\n    { useMasterKey: true }' : ''},
  ))
// Results are frozen plain objects; toJSON serializes them as REST does.
console.log(toJSON(task))
`
}

/** The runnable entry point: start, optional Task seed, optional listener wait. */
export const mainSource = (
	plan: InitializerPlan,
): string => `${plan.starter === 'task' ? "import { toJSON } from '@ultimabase/core'\nimport { Task } from './schema.js'\n" : ''}import { ultimabase } from './ultimabase.js'

// start() resolves to the application; leaving this module scope disposes it.
await using app = await ultimabase.start()
${plan.starter === 'task' ? taskCommand(plan) : `console.log('UltimaBase is ready:', app.state)\n`}${
	hasHttpListener(plan)
		? `console.log('Local API listening on http://127.0.0.1:1337')
// Keep the managed listener alive until the local process is stopped.
await new Promise${plan.language === 'ts' ? '<void>' : ''}((resolve) => {
  process.once('SIGINT', () => resolve())
  process.once('SIGTERM', () => resolve())
})
`
		: ''
}`
