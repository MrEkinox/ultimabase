// A big live read takes its turn and reads a part at a time (D-254).
import { describe, expect, it } from 'vitest'
import { inParts, inTurn, paced } from './turns.ts'

const opened = () => {
	const { promise: gate, resolve: open } = Promise.withResolvers<void>()
	return { gate, open }
}

/** Starts a read of `rows`, that holds its turn until it is let go. */
const reading = (rows: number, order: number[]) => {
	const { gate, open } = opened()
	const done = inTurn(rows, async () => {
		order.push(rows)
		await gate
	})
	return { done, open }
}

const settled = async () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0)
	})

describe('inTurn', () => {
	it('never holds back a read under the size of a big one', async () => {
		const order: number[] = []
		const big = reading(20_000, order)
		const small = reading(999, order)
		await settled()
		expect(order).toEqual([20_000, 999])
		big.open()
		small.open()
		await Promise.all([big.done, small.done])
	})

	it('lets big reads run together up to their total, then in order', async () => {
		const order: number[] = []
		const first = reading(12_000, order)
		const second = reading(8000, order)
		const third = reading(9000, order)
		// Not ahead of the one that waits, though it would fit.
		const fourth = reading(1000, order)
		await settled()
		expect(order).toEqual([12_000, 8000])
		first.open()
		await first.done
		await settled()
		expect(order).toEqual([12_000, 8000, 9000, 1000])
		second.open()
		third.open()
		fourth.open()
		await Promise.all([second.done, third.done, fourth.done])
	})

	it('runs a read larger than the total, alone', async () => {
		const order: number[] = []
		const first = reading(5000, order)
		const huge = reading(50_000, order)
		await settled()
		expect(order).toEqual([5000])
		first.open()
		await first.done
		await settled()
		expect(order).toEqual([5000, 50_000])
		huge.open()
		await huge.done
	})

	it('gives its turn back when the read fails', async () => {
		const failed = inTurn(20_000, async () => {
			throw new Error('Broken.')
		})
		await expect(failed).rejects.toThrow('Broken.')
		const order: number[] = []
		const next = reading(20_000, order)
		await settled()
		expect(order).toEqual([20_000])
		next.open()
		await next.done
	})
})

const ids = (count: number) =>
	Array.from({ length: count }, (_, index) => `${index}`)

describe('inParts', () => {
	it('reads few ids in one call', async () => {
		const calls: number[] = []
		const found = await inParts(ids(2000), async (part) => {
			calls.push(part.length)
			return part
		})
		expect(calls).toEqual([2000])
		expect(found).toHaveLength(2000)
	})

	it('reads many ids a part at a time, in order', async () => {
		const calls: number[] = []
		const found = await inParts(ids(4500), async (part) => {
			calls.push(part.length)
			return part
		})
		expect(calls).toEqual([2000, 2000, 500])
		expect(found).toEqual(ids(4500))
	})

	it('runs a few parts at once and keeps their order', async () => {
		const gates: (() => void)[] = []
		let started = 0
		const found = inParts(ids(20_000), async (part) => {
			started += 1
			await new Promise<void>((go) => {
				gates.push(go)
			})
			return part
		})
		await settled()
		expect(started).toBe(4)
		// The last started ends first: the result keeps the order of the ids.
		gates.pop()?.()
		await settled()
		expect(started).toBe(5)
		for (let part = 1; part < 10; part += 1) {
			gates.pop()?.()
			await settled()
		}
		expect(await found).toEqual(ids(20_000))
	})

	it('counts the parts of every read together', async () => {
		const gates: (() => void)[] = []
		let started = 0
		const read = async (part: readonly string[]) => {
			started += 1
			await new Promise<void>((go) => {
				gates.push(go)
			})
			return part
		}
		const both = Promise.all([
			inParts(ids(10_000), read),
			inParts(ids(10_000), read),
		])
		await settled()
		expect(started).toBe(4)
		for (let part = 0; part < 10; part += 1) {
			gates.shift()?.()
			await settled()
		}
		await both
	})

	it('lets the next part go when one fails', async () => {
		let started = 0
		const failing = inParts(ids(12_000), async (part) => {
			started += 1
			if (started === 1) throw new Error('A part failed.')
			return part
		})
		await expect(failing).rejects.toThrow('A part failed.')
		await settled()
		expect(started).toBe(6)
		// Nothing stays counted: a later read runs at once.
		expect(await inParts(ids(4000), async (part) => part)).toHaveLength(4000)
	})
})

const nextTurn = async () => new Promise(setImmediate)

const spin = (ms: number) => {
	const end = performance.now() + ms
	while (performance.now() < end);
}

describe('pacing', () => {
	it('goes on at once while the turn has time left', async () => {
		await nextTurn()
		let turns = 0
		setImmediate(() => {
			turns += 1
		})
		await paced()
		await paced()
		expect(turns).toBe(0)
		await nextTurn()
	})

	it('runs one a turn once a turn spent its time', async () => {
		await nextTurn()
		// Each turn of the event loop that ran is one a connection can be accepted in.
		const log: string[] = []
		let turn = 0
		const counting = () => {
			turn += 1
			if (log.length < 4) setImmediate(counting)
		}
		setImmediate(counting)
		await paced()
		spin(2)
		await Promise.all(
			['a', 'b', 'c', 'd'].map(async (name) => {
				await paced()
				log.push(`${name}@${String(turn)}`)
			}),
		)
		const turns = log.map((each) => Number(each.split('@')[1]))
		expect(log.map((each) => each[0])).toEqual(['a', 'b', 'c', 'd'])
		expect(new Set(turns).size).toBe(4)
		await nextTurn()
	})
})
