import process from 'node:process'
import { URL } from 'node:url'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { isMainThread, parentPort, Worker } from 'node:worker_threads'

import { createApplication, FrameworkApplication } from '@ultimabase/core'

// Real workers must own independent slots even while their parent remains active.
const application = await createApplication({
	pluginPrivileges: { logger: false },
	schemas: [],
	plugins: [],
})
if (isMainThread) {
	const workers = [
		new Worker(new URL(import.meta.url)),
		new Worker(new URL(import.meta.url)),
	]
	try {
		await assert.rejects(
			createApplication({
				pluginPrivileges: { logger: false },
				schemas: [],
				plugins: [],
			}),
			/Another UltimaBase application is active/,
		)
		const messages = await Promise.all(
			workers.map((worker) => once(worker, 'message')),
		)
		assert.deepEqual(messages, [['ready'], ['ready']])
		assert.equal(application.state, 'ready')
		const exits = workers.map((worker) => once(worker, 'exit'))
		for (const worker of workers) worker.postMessage('dispose')
		assert.deepEqual(await Promise.all(exits), [[0], [0]])
		await application.dispose()
		const replacement = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			schemas: [],
			plugins: [],
		})
		await replacement.initialize()
		await application.dispose()
		assert.equal(replacement.state, 'ready')
		await replacement.dispose()
		process.stdout.write(
			JSON.stringify({ workers: 2, replacement: 'disposed' }),
		)
	} finally {
		await Promise.all(workers.map((worker) => worker.terminate()))
		await application.dispose()
	}
} else {
	assert.ok(parentPort)
	parentPort.postMessage('ready')
	await once(parentPort, 'message')
	await application.dispose()
	parentPort.close()
}
