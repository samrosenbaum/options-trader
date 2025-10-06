"""Alembic environment stub for future migrations."""

from __future__ import annotations

from logging.config import fileConfig
from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

if config.config_file_name is not None:  # pragma: no cover - configuration side effect
    fileConfig(config.config_file_name)

# Placeholder metadata object - SQLAlchemy models can be wired here in the future.
target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""

    url = config.get_main_option("sqlalchemy.url", "sqlite:///data/options.db")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    connectable = context.config.attributes.get("connection")
    if connectable is None:
        from sqlalchemy import create_engine

        connectable = create_engine(config.get_main_option("sqlalchemy.url", "sqlite:///data/options.db"))

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


def main() -> None:
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        run_migrations_online()


if __name__ == "__main__":  # pragma: no cover - script entry point
    main()
