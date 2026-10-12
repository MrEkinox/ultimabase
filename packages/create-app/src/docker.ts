import { spawn } from 'node:child_process'

/**
 * Resolves whether `docker compose` answers within five seconds: Docker
 * Compose is the default database (ADR-0327 decision 8).
 */
export const detectDockerCompose = (): Promise<boolean> =>
	new Promise((resolve) => {
		const child = spawn('docker', ['compose', 'version'], {
			shell: false,
			stdio: 'ignore',
		})
		const timer = setTimeout(() => {
			child.kill()
			resolve(false)
		}, 5_000)
		child.once('error', () => {
			clearTimeout(timer)
			resolve(false)
		})
		child.once('exit', (code) => {
			clearTimeout(timer)
			resolve(code === 0)
		})
	})
