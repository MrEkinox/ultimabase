# Security policy

UltimaBase is pre-release software and should not yet be used to protect production data.

Please report security vulnerabilities privately to the maintainers rather than opening a public issue. A dedicated security contact will be added before the first public release.

Security-sensitive areas include:

- master capability creation and transport boundaries;
- CLP, ACL, role inheritance, and field selection;
- schema synchronization and destructive migrations;
- query normalization and SQL compilation;
- GraphQL complexity and introspection controls;
- secret handling and audit logs.
