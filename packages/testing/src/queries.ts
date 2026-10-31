// The queries a test's callback sends to the database (D-177), recorded on the
// adapter and on each transaction it begins as they are, never on wrappers:
// postgres()'s `sql` finds the open transaction by these objects.
import type { Adapter, Transaction, Write } from 'ultimabase'

export type Recording = { list: string[] | undefined }

type Store = Omit<Transaction, 'commit' | 'rollback'>

/** `'write Invite, User'`: the models a write changes, in their order. */
function written(write: Write): string {
	const models = new Set(write.changes.map((change) => change.model))
	return `write ${[...models].join(', ')}`
}

function record(store: Store, recording: Recording): void {
	const find = store.find.bind(store)
	const count = store.count.bind(store)
	const aggregate = store.aggregate.bind(store)
	const write = store.write.bind(store)
	store.find = async (read) => {
		recording.list?.push(`find ${read.model}`)
		return find(read)
	}
	store.count = async (read) => {
		recording.list?.push(`count ${read.model}`)
		return count(read)
	}
	store.aggregate = async (read) => {
		recording.list?.push(`aggregate ${read.model}`)
		return aggregate(read)
	}
	store.write = async (given) => {
		recording.list?.push(written(given))
		return write(given)
	}
}

/** Records the calls `adapter` and its transactions get while `list` is set. */
export function recorded(adapter: Adapter, recording: Recording): Adapter {
	record(adapter, recording)
	const begin = adapter.begin.bind(adapter)
	adapter.begin = async (options) => {
		const tx = await begin(options)
		record(tx, recording)
		return tx
	}
	return adapter
}
