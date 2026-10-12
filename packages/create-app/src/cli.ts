#!/usr/bin/env node
import * as clack from '@clack/prompts'
import process from 'node:process'

import { nextCommands } from './base-template.js'
import { parseOptions } from './config.js'
import { detectDockerCompose } from './docker.js'
import { createProject } from './generate.js'
import { CancelledError, collectSelection, terminalPrompts } from './prompts.js'

const help = `Create an UltimaBase project.

Usage: create-app [options]

Options:
  --name <name>                  npm package name (required without a TTY)
  --directory <path>             new destination (defaults to the package name)
  --language <ts|js>             TypeScript or JavaScript
  --api <rest|graphql|none>      HTTP API; repeat to select both
  --plugin <@ultimabase/id|none> official plugin; repeat to select several
  --starter <task|empty>         runnable example or empty application
  --database <docker|existing>   PostgreSQL setup
  --database-url <url>           existing PostgreSQL URL written to .env
  --package-manager <npm|yarn|pnpm>
  --install | --no-install       install dependencies or skip
  --yes                          accept documented defaults and skip confirmation
  -h, --help                     show this help

Defaults with --yes: TypeScript, REST, Access in prototype mode, the Task
starter, PostgreSQL in Docker Compose (an existing database when Docker is
missing), npm if no manager is detected, and dependency installation.
Existing destinations are never overwritten. The package is not published yet:
npm create @ultimabase/app works once the packages are published.`

/** Exit cleanly on cancellation and report validation errors without a stack trace. */
export const run = async (args: readonly string[]): Promise<number> => {
	try {
		const options = parseOptions(args)
		if (options.help) {
			process.stdout.write(`${help}\n`)
			return 0
		}
		if (process.stdout.isTTY) clack.intro('Create an UltimaBase project')
		const plan = await collectSelection(
			options,
			{
				cwd: process.cwd(),
				// Only a default database needs the answer.
				dockerAvailable:
					options.database !== undefined || (await detectDockerCompose()),
				isTTY: process.stdin.isTTY && process.stdout.isTTY,
				...(process.env.npm_config_user_agent !== undefined && {
					userAgent: process.env.npm_config_user_agent,
				}),
			},
			terminalPrompts,
		)
		await createProject(plan, {
			onProgress: (message) => {
				clack.log.step(message)
			},
		})
		clack.outro(`Project ready.\n${nextCommands(plan).join('\n')}`)
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
