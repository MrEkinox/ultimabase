import { Task } from './schema.js'
import { ultimabase } from './ultimabase.js'

try {
	await ultimabase.start()

	const task = await Task.createOne(
		{ data: { title: 'Write the documentation' } },
		{ ultimabase },
	)

	process.stdout.write(`${JSON.stringify(task.toJSON())}\n`)
} finally {
	await ultimabase.dispose()
}
