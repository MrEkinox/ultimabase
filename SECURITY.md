# Security policy

UltimaBase is pre-release software and should not yet be used to protect production data.

Report security vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (<https://github.com/MrEkinox/ultimadatabase/security/advisories/new>). Never open a public issue for a vulnerability. Include the affected packages and versions, a reproduction, and the impact you observed.

Security-sensitive areas include:

- master capability creation and transport boundaries;
- official Access policies, object ACL, role inheritance, and field disclosure;
- schema synchronization and destructive migrations;
- query normalization and SQL compilation;
- GraphQL complexity and introspection controls;
- secret handling and audit logs.
