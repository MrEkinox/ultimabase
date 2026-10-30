import { expect, it } from 'vitest'
import { releaseNotes } from './release-notes.ts'

const kernel = `# ultimabase

## 0.2.0

### Minor Changes

- abc1234: Live lists page by cursor.

### Patch Changes

- def5678: The dev script restarts once per change,
  not once per file.

## 0.1.1

### Patch Changes

- The published starter starts.
`
const graphql = `# @ultimabase/graphql

## 0.2.0

### Minor Changes

- abc1234: Live lists page by cursor.

### Patch Changes

- Updated dependencies [abc1234]
  - ultimabase@0.2.0
`

it("lists each entry once, after the packages that list it, under its changelog's heading", () => {
	expect(
		releaseNotes('0.2.0', [
			{ name: 'ultimabase', text: kernel },
			{ name: '@ultimabase/graphql', text: graphql },
		]),
	).toBe(`### Minor Changes

- \`ultimabase\`, \`@ultimabase/graphql\`: abc1234: Live lists page by cursor.

### Patch Changes

- \`ultimabase\`: def5678: The dev script restarts once per change,
  not once per file.
`)
})

it('reads only the section of the version', () => {
	expect(releaseNotes('0.1.1', [{ name: 'ultimabase', text: kernel }])).toBe(
		`### Patch Changes

- \`ultimabase\`: The published starter starts.
`,
	)
})

it('refuses a version no changelog has an entry for', () => {
	expect(() =>
		releaseNotes('0.3.0', [
			{ name: 'ultimabase', text: kernel },
			{ name: '@ultimabase/graphql', text: graphql },
		]),
	).toThrow('No changelog has an entry for 0.3.0.')
	// A section of dependency updates alone has nothing to say.
	const rest = `# @ultimabase/rest

## 0.2.0

### Patch Changes

- Updated dependencies [abc1234]
  - ultimabase@0.2.0
`
	expect(() =>
		releaseNotes('0.2.0', [{ name: '@ultimabase/rest', text: rest }]),
	).toThrow('No changelog has an entry for 0.2.0.')
})
