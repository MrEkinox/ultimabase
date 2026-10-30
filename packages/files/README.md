# @ultimabase/files

Files for UltimaBase, in S3 or any S3-compatible storage. A client uploads a file, then writes its id in a row as any other value; a replaced or deleted file leaves the storage after the commit, so no object is left without a row.

Documentation: [Files](https://ultimabase.dev/docs/files).
