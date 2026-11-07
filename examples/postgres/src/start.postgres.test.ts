// The production starts a host is refused (D-105), each in a schema of its
// own on TEST_DATABASE_URL.
import { it } from 'vitest'
import { eachInSchema, play, processes } from './test/commands.ts'

eachInSchema()

it(
	'refuses a production start before the migrations are deployed',
	async () => {
		await play('start-no-schema', [1])
		await play('start-unreachable', [1, 1])
		await play('start-weak-key', [1])
	},
	processes,
)
