// The contract on the kernel's own adapter, counting the calls it receives:
// each stands for a round trip (D-98).
import type { Adapter, Transaction } from 'ultimabase'
import { memory } from 'ultimabase'
import { testAdapter } from './index.ts'

let calls = 0

/** `run`, counted as one round trip. */
function trip<A extends unknown[], R>(
	run: (...given: A) => Promise<R>,
): (...given: A) => Promise<R> {
	return async (...given) => {
		calls += 1
		return run(...given)
	}
}

function counted(): Adapter {
	const adapter = memory()
	return {
		...adapter,
		find: trip(adapter.find),
		count: trip(adapter.count),
		aggregate: trip(adapter.aggregate),
		write: trip(adapter.write),
		begin: trip(async (): Promise<Transaction> => {
			const tx = await adapter.begin()
			return {
				find: trip(async (read) => tx.find(read)),
				count: trip(async (read) => tx.count(read)),
				aggregate: trip(async (read) => tx.aggregate(read)),
				write: trip(async (write) => tx.write(write)),
				commit: trip(async () => tx.commit()),
				rollback: trip(async () => tx.rollback()),
			}
		}),
	}
}

testAdapter('memory', counted, { roundTrips: () => calls })
