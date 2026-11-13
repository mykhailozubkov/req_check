# Claude backup — 2026-11-13

The personal-Claude version was preserved **before** the OpenRouter migration. It includes the requested removal of the business-logic banner, the original Claude request implementation, personal-key dialog, lockfile, tests, and deployment configuration.

- Snapshot commit: `aafb2e2` (`Remove business logic banner before provider migration`).
- Git tag: `claude-backup-2026-11-13`.
- GitHub branch: [codex/backup-claude-2026-11-13](https://github.com/mykhailozubkov/req_check/tree/codex/backup-claude-2026-11-13).
- Separate local source folder: `../backups/storylens-claude-2026-11-13` relative to this checkout.
- Separate local ZIP: `../backups/storylens-claude-2026-11-13.zip`.

The source archive contains all 131 tracked files; contents were verified against the working version after normalizing Git's Windows line endings. Dependencies, generated builds, runtime caches, and credentials are excluded. Run `npm ci` and `npm run dev` in the extracted copy to use it with a personal Claude key.

The backup's original Wrangler configuration targets the production Worker. To publish it in parallel, first choose a different Worker name. The backup is not modified when the main project changes to OpenRouter.
