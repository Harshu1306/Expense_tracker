"""SQLAlchemy engine, session management and SQLite initialisation."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "spendwise.db"


def _database_url() -> str:
    """Resolve the database URL.

    ``SPENDWISE_DATABASE_URL`` wins (used by the tests).  Otherwise
    ``SPENDWISE_DB_PATH`` can point at a file, falling back to
    ``backend/spendwise.db``.
    """
    explicit = os.getenv("SPENDWISE_DATABASE_URL")
    if explicit:
        return explicit
    path = os.getenv("SPENDWISE_DB_PATH")
    db_path = Path(path).expanduser().resolve() if path else DEFAULT_DB_PATH
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = _database_url()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    """WAL + foreign keys make the SQLite file safer under concurrent reads."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def init_db() -> None:
    """Create all tables.  Safe to call on every startup."""
    import models  # noqa: F401  (register the mappers)

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
