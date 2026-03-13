# CLAUDE.md

## Code Style

- Use arrow functions for all function definitions (`const foo = () => {}` not `function foo() {}`)

## Database Schema Changes

Use `npm run db:push --workspace=packages/db` to apply schema changes directly. Do not generate migrations at this stage.

## After Code Changes

Run format, lint, and typecheck (do not run the dev script to verify):

```
npm run format
npm run lint
npm run typecheck
```
