#!/usr/bin/env node
// The `@ultimabase/push` command.
import { main } from './keys.ts'

process.exitCode = main(process.argv.slice(2), (text) => {
	process.stdout.write(text)
})
