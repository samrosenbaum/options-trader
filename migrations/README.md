# Database migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database migrations. The current
storage layer relies on SQLite and manages its baseline schema automatically. Future schema changes
can be tracked by creating revision files in `migrations/versions/` using the Alembic CLI.

Example bootstrap command:

```bash
alembic revision -m "describe change"
```

The generated migration can then be edited to apply DDL updates for the `options`, `signals`, and
`metadata` tables maintained by `SQLiteStorage`.
