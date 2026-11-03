"""Database connection management for Chordly.

Configures SQLAlchemy engine and SQLModel session factory.
Connects using least-privilege read-only credentials in production.
Fails fast at startup in production if required environment variables or TLS are absent.
"""

import os
from typing import Generator
from sqlmodel import Session, create_engine

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
is_production = ENVIRONMENT == "production"

# In production, require DATABASE_URL_READONLY explicitly
if is_production:
    DATABASE_URL = os.getenv("DATABASE_URL_READONLY")
    if not DATABASE_URL:
        raise RuntimeError("Production requires DATABASE_URL_READONLY environment variable.")
    # Enforce TLS requirement for production connections (Checklist A6)
    if not any(ssl_param in DATABASE_URL.lower() for ssl_param in ["sslmode=require", "ssl=true", "sslmode=verify-full"]):
        raise RuntimeError("Production database connection requires TLS (e.g. sslmode=require).")
else:
    # Development / Testing fallback
    DATABASE_URL = os.getenv("DATABASE_URL_READONLY") or os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        _db_path = os.path.join(_backend_dir, "data", "chordly_local.db").replace("\\", "/")
        DATABASE_URL = f"sqlite:///{_db_path}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    pool_pre_ping=True,
)


def get_session() -> Generator[Session, None, None]:
    """Dependency that yields a database session and safely closes it upon request completion."""
    with Session(engine) as session:
        yield session
