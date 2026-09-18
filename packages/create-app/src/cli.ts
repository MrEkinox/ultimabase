#!/usr/bin/env node
import * as clack from '@clack/prompts'
import process from 'node:process'

import { parseOptions } from './config.js'
import { CancelledError, collectSelection, terminalPrompts } from './prompts.js'

const help = `Create an UltimaBase project (selection preview; file generation is not implemented yet).

Usage: create-app [options]

Options:
  --name <name>                  npm package name (required without a TTY)
  --directory <path>             new destination (defaults to the package name)
  --language <ts|js>             TypeScript or JavaScript
  --api <rest|graphql>           HTTP API; repeat to select both
  --plugin <@ultimabase/id>      official plugin; repeat to select several
  --starter <task|empty>         runnable example or empty application
  --database <existing|docker>   PostgreSQL setup
  --package-manager <npm|yarn|pnpm>
  --install | --no-install       install dependencies or skip
  --yes                          accept documented defaults and skip confirmation
  -h, --help                     show this help

Defaults with --yes: TypeScript, no HTTP API, PostgreSQL plugin, Task starter,
existing PostgreSQL, npm if no manager is detected, and dependency installation.
This preview writes no files.`

/** Exit cleanly on cancellation and report validation errors without a stack trace. */
export const run = async (args: readonly string[]): Promise<number> => {
	try {
		const options = parseOptions(args)
		if (options.help) {
			process.stdout.write(`${help}\n`)
			return 0
		}
		if (process.stdout.isTTY) clack.intro('Create an UltimaBase project')
		await collectSelection(
			options,
			{
				cwd: process.cwd(),
				isTTY: process.stdin.isTTY && process.stdout.isTTY,
				...(process.env.npm_config_user_agent !== undefined && {
					userAgent: process.env.npm_config_user_agent,
				}),
			},
			terminalPrompts,
		)
		clack.outro(
			'Selection validated. Project generation follows in issue 2903; no files were written.',
		)
		return 0
	} catch (error) {
		if (error instanceof CancelledError) {
			clack.cancel(error.message)
			return 0
		}
		const message =
			error instanceof Error ? error.message : 'Unexpected initializer error.'
		process.stderr.write(`Error: ${message}\n`)
		return 1
	}
}

process.exitCode = await run(process.argv.slice(2))
