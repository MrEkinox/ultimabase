#!/usr/bin/env node
// The `create-ultimabase` bin (D-130).
import { main, processIo } from './main.ts'

process.exitCode = await main(process.argv.slice(2), processIo())
