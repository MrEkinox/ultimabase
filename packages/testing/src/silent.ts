// A logger that writes nothing, so the suite's output is the test runner's.
import type { Logger } from 'ultimabase'

const nothing = (): void => undefined

export const silent: Logger = {
	info: nothing,
	warn: nothing,
	error: nothing,
	child: () => silent,
}
