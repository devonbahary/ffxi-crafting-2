# ffxi-crafting

This project parses two sites to scrape FFXI item data and their prices to determine which crafts (syntheses) are most profitable.

## Web App

Start the API server and React client together:

```sh
npm run web
```

## The Pipeline

The process involves 4 workers:

> Discovery > Enricher > Pricer > Profitability

### Seed Phase

Run these both concurrently:

```sh
npm run discovery # creates jobs for enricher
npm run enricher  # picks up jobs by discovery
```

#### Discovery
Parses [bg-wiki](https://www.bg-wiki.com/) synthesis pages by craft to determine the total list of syntheses and to seed the database with their input and output items. Sends item jobs to Enricher.

#### Enricher
Parses [bg-wiki](https://www.bg-wiki.com/) item pages to get detailed information about each item, including static vendor prices. 

### Ongoing Jobs

Run these both concurrently:
```sh
npm run pricer # creates jobs for profitability
npm run profitability # picks up jobs by pricer
```

To trigger an update to item prices (and downstream profitability):
```sh
npm run pricer:requeue
```

To only trigger an update to profitability (with current item prices in database):
```sh
npm run profitability:requeue
```

#### Pricer
Parses [ffxiah](https://www.ffxiah.com/) to get the latest auction house prices for each item. Sends profitability jobs to Profitability.

#### Profitability
For items updated by Pricer, Profitability recalculates synthesis profitability. 


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

### Adminer (database GUI, optional)

```sh
docker compose --profile tools up adminer -d
```

Open `http://localhost:8080` and log in using **System: PostgreSQL**, **Server: `db`**, and the credentials from your `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).
