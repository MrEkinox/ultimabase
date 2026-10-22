#!/usr/bin/env node
// The `ultimabase` bin (D-105).
import { main } from './cli-main.ts'

process.exitCode = await main(process.argv.slice(2))
