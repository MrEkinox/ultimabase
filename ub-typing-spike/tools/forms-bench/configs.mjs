// Benchmark configurations: one entry per (form, generator flags), with the generated directory.
// `ruleFile` is the file holding S0's rules (application.ts for form L, s0.ts otherwise).
import path from 'node:path'

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')

const entry = (label, form, args, dirName, ruleFile = 'src/s0.ts') => ({
	label,
	form,
	args,
	dir: (n) => path.join(root, 'forms', form, 'gen', dirName(n)),
	ruleFile,
})

export const configs = [
	entry('d-hybrid', 'd-hybrid', [], (n) => `d-hybrid-${n}`),
	entry('d-hybrid-noreg', 'd-hybrid', ['--no-register'], (n) => `d-hybrid-noreg-${n}`),
	entry('d-hybrid-getters', 'd-hybrid-getters', [], (n) => `d-hybrid-getters-${n}`),
	entry('a-prime', 'a-prime', [], (n) => `a-prime-${n}`),
	entry('n-this-methods', 'n-this-methods', [], (n) => `n-this-methods-${n}`),
	entry('e1-annotated', 'e1-annotated', [], (n) => `e1-annotated-${n}`),
	entry('e2-this-with', 'e2-this-with', [], (n) => `e2-this-with-${n}`),
	entry('e3-static-block', 'e3-static-block', [], (n) => `e3-static-block-${n}`),
	entry('g-class', 'g-class', [], (n) => `g-class-${n}`),
	entry('g-class-reg', 'g-class', ['--register'], (n) => `g-class-reg-${n}`),
	entry('g-self', 'g-self', [], (n) => `g-self-${n}`),
	entry('g-class-getters', 'g-class-getters', [], (n) => `g-class-getters-${n}`),
	entry('k-rules-list', 'k-rules-list', [], (n) => `k-rules-list-${n}`),
	entry('k-rules-list-nosd', 'k-rules-list', ['--no-soft-delete'], (n) => `k-rules-list-${n}`),
	entry('k-statements', 'k-statements', [], (n) => `k-statements-${n}`),
	entry('k-statements-nosd', 'k-statements', ['--no-soft-delete'], (n) => `k-statements-${n}`),
	entry('l-app-rules', 'l-app-rules', [], (n) => `l-app-rules-${n}`, 'src/application.ts'),
	entry('l-app-rules-nosd', 'l-app-rules', ['--no-soft-delete'], (n) => `l-app-rules-${n}`, 'src/application.ts'),
]

export const select = (labels) => (labels.length ? configs.filter((c) => labels.includes(c.label)) : configs)
