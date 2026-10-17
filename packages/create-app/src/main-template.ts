import { hasHttpListener } from './api-template.js'
import type { InitializerPlan } from './config.js'
import { needsMaster } from './security-template.js'

/** Seeds the example only into an empty table, so restarts never add Tasks. */
const taskCommand = (plan: InitializerPlan): string => {
	const master = needsMaster(plan)
	return `// Seed the example Task only once; later starts print the existing record.
// A write returns { id } unless it selects more, so both calls select alike.
const task =
${
	master
		? `  (await Task.findOne(
    { select: { done: true, title: true } },
    { useMasterKey: true },
  )) ??
  (await Task.createOne(
    {
      data: { title: 'Ship the first feature' },
      select: { done: true, title: true },
    },
    { useMasterKey: true },
  ))`
		: `  (await Task.findOne({ select: { done: true, title: true } })) ??
  (await Task.createOne({
    data: { title: 'Ship the first feature' },
    select: { done: true, title: true },
  }))`
}
// Results are frozen plain objects; toJSON serializes them as REST does.
console.log(toJSON(task))
`
}

/** The runnable entry point: start, optional Task seed, optional listener wait. */
export const mainSource = (
	plan: InitializerPlan,
): string => `${plan.starter === 'task' ? `import { toJSON } from '@ultimabase/core'\n\nimport { Task } from './schemas/task.${plan.language}'\n` : ''}import { ultimabase } from './ultimabase.${plan.language}'

// start() resolves to ultimabase itself; leaving this module scope disposes it.
await using started = await ultimabase.start()
console.log('UltimaBase is', started.state)
${plan.starter === 'task' ? taskCommand(plan) : ''}${
	hasHttpListener(plan)
		? `console.log('Local API listening on http://127.0.0.1:1337')
// The server stops the application on SIGINT or SIGTERM (Ctrl+C).
await started.closed
`
		: ''
}`
