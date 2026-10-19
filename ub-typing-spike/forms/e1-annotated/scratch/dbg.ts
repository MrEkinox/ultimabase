import type { ConfiguredFactory } from '../lib/core.ts'
import { App } from '../fixture/src/app.ts'
type A = typeof App extends ConfiguredFactory<infer T> ? T : 'no'
declare const a: A
export const b: 1 = a
type F = typeof App
declare const f: F
export const g: 1 = f
