// The reads of a big live list's window (D-254): many at once fill the memory of
// the process and of the database, and hold the pool others write with. They
// take turns, and read a part at a time, a few parts at once (D-270). Openings
// leave the event loop its turns, for a server to accept connections (D-286).

/** The rows from which a live read is big: smaller ones never wait. */
export const bigRead = 1000
/** The rows big reads hold at once, at most; a read alone may hold more. */
const atOnce = 20_000
/** The rows one statement reads at most. */
const part = 2000
/** The statements big reads run at once, whatever their number. */
const partsAtOnce = 4

type Waiting = { readonly rows: number; readonly go: () => void }

let held = 0
const waiting: Waiting[] = []

const fits = (rows: number): boolean => held === 0 || held + rows <= atOnce

function next(): void {
	let first = waiting[0]
	while (first !== undefined && fits(first.rows)) {
		waiting.shift()
		held += first.rows
		first.go()
		first = waiting[0]
	}
}

/** Runs `read` of `rows` rows, in its turn when it is big. */
export async function inTurn(
	rows: number,
	read: () => Promise<void>,
): Promise<void> {
	if (rows < bigRead) return read()
	if (waiting.length === 0 && fits(rows)) held += rows
	else {
		await new Promise<void>((go) => {
			waiting.push({ rows, go })
		})
	}
	try {
		await read()
	} finally {
		held -= rows
		next()
	}
}

let running = 0
const parts: (() => void)[] = []

/** Runs `read` once fewer than `partsAtOnce` statements run, first come first. */
async function inPartTurn<T>(read: () => Promise<T>): Promise<T> {
	if (running < partsAtOnce) running += 1
	else {
		await new Promise<void>((go) => {
			parts.push(go)
		})
	}
	try {
		return await read()
	} finally {
		const go = parts.shift()
		if (go === undefined) running -= 1
		else go()
	}
}

/** What `read` finds for `ids`, in order, by parts when they are many. */
export async function inParts<T>(
	ids: readonly string[],
	read: (ids: readonly string[]) => Promise<readonly T[]>,
): Promise<readonly T[]> {
	if (ids.length <= part) return read(ids)
	const reads: Promise<readonly T[]>[] = []
	for (let from = 0; from < ids.length; from += part) {
		const some = ids.slice(from, from + part)
		reads.push(inPartTurn(async () => read(some)))
	}
	return (await Promise.all(reads)).flat()
}

/** The ms of openings a turn of the event loop runs before it passes them on. */
const budget = 1

let armed = false
let since = 0
const later: (() => void)[] = []

function arm(): void {
	armed = true
	setImmediate(() => {
		armed = false
		since = performance.now()
		later.shift()?.()
		if (later.length > 0) arm()
	})
}

/**
 * Goes on in this turn of the event loop, or in a later one once this one spent
 * `budget`, each later turn running one: a server accepts one connection a turn.
 */
export async function paced(): Promise<void> {
	if (!armed) {
		since = performance.now()
		arm()
		return
	}
	if (later.length === 0 && performance.now() - since < budget) return
	await new Promise<void>((go) => {
		later.push(go)
	})
}
