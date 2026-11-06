// The storage of each environment: S3 or any S3-compatible storage in
// production; a directory on a staging server without S3, which the
// application serves; in memory otherwise, so neither the example's server
// nor its tests write to a real storage.
import { diskFiles, memoryFiles, s3 } from '@ultimabase/files'

/** The storage `process.env` asks for. */
export function chooseStorage() {
	//#region s3
	if (process.env.NODE_ENV === 'production') {
		return s3({
			bucket: process.env.S3_BUCKET,
			region: process.env.S3_REGION,
			endpoint: process.env.S3_ENDPOINT,
			accessKeyId: process.env.S3_ACCESS_KEY_ID,
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
			// Spaces serves a public file only with a public-read ACL.
			publicAcl: true,
			// A CDN in front of the bucket; the storage's own URL without it.
			publicUrl: 'https://cdn.example.com',
		})
	}
	//#endregion
	//#region disk
	if (process.env.FILES_DIR !== undefined) {
		return diskFiles({
			// A persistent volume: the files outlive a deploy.
			dir: process.env.FILES_DIR,
			// Signs the private files' URLs, the same on every start.
			secret: process.env.FILES_SECRET,
			// The address clients reach, behind a proxy; the server's otherwise.
			servedAt: process.env.PUBLIC_URL,
		})
	}
	//#endregion
	//#region memory
	return memoryFiles()
	//#endregion
}
