// The reads of a big live list's window (D-254): many at once fill the memory of
// the process and of the database, and hold the pool others write with. They
// take turns, and read a part at a time.

/** The rows from which a live read is big: smaller ones never wait. */
export const bigRead = 1000
/** The rows big reads hold at once, at most; a read alone may hold more. */
const atOnce = 20_000
/** The rows one statement reads at most. */
const part = 2000

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

/** What `read` finds for `ids`, a part at a time when they are many. */
export async function inParts<T>(
	ids: readonly string[],
	read: (ids: readonly string[]) => Promise<readonly T[]>,
): Promise<readonly T[]> {
	if (ids.length <= part) return read(ids)
	const found: T[] = []
	for (let from = 0; from < ids.length; from += part) {
		found.push(...(await read(ids.slice(from, from + part))))
	}
	return found
}
