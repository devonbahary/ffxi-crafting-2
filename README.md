# ffxi-crafting

TODO: add introduction.

## Prerequisites

- Node.js 22+
- Docker + Docker Compose (for the database)

## Setup

```sh
npm install
cp .env.example .env
```

## Database

Start Postgres in Docker:

```sh
docker compose up db -d
```

Push the schema:

```sh
npm run db:push --workspace=packages/db
```

### Adminer (database GUI)

```sh
docker compose --profile tools up adminer -d
```

Open `http://localhost:8080` and log in using **System: PostgreSQL**, **Server: `db`**, and the credentials from your `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).

## Local

### Seeding

This project relies on using relatively static data for synthesis and its constituent items. To seed these directly from the source sites, run:

```sh
npm run discovery
npm run enricher

```

## Development

```sh
npm run format      # Prettier
npm run lint        # ESLint
npm run typecheck   # tsc across all packages
```
