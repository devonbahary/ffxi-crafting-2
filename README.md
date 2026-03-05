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

Stop the database:

```sh
docker compose down
```

To also delete the stored data:

```sh
docker compose down -v
```

### Adminer (database GUI)

```sh
docker compose --profile tools up adminer -d
```

Open `http://localhost:8080` and log in using **System: PostgreSQL**, **Server: `db`**, and the credentials from your `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).

## Local development

Start the database, then run each service in its own terminal:

```sh
docker compose up db -d
npm run dev --workspace=packages/ingestor
npm run dev --workspace=packages/discovery
```

## Running everything in Docker

```sh
docker compose up --build
```

## Development

```sh
npm run format      # Prettier
npm run lint        # ESLint
npm run typecheck   # tsc across all packages
```
