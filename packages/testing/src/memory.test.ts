// The contract on the kernel's own adapter, counting the calls it receives.
import type { Adapter } from 'ultimabase'
import { memory } from 'ultimabase'
import { testAdapter } from './index.ts'

let calls = 0

function counted(): Adapter {
	const adapter = memory()
	return {
		...adapter,
		find: async (read) => {
			calls += 1
			return adapter.find(read)
		},
		count: async (read) => {
			calls += 1
			return adapter.count(read)
		},
		write: async (write) => {
			calls += 1
			return adapter.write(write)
		},
	}
}

testAdapter('memory', counted, { statements: () => calls })
