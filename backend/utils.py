"""Shared helpers for time and money handling.

All timestamps are stored in SQLite as *naive UTC* datetimes.  The API always
serialises them as ISO-8601 strings with a trailing ``Z`` so browsers parse
them unambiguously.  Money is always stored as an integer number of paise.
"""

from __future__ import annotations

from datetime import date, datetime, timezone


def utcnow() -> datetime:
    """Return the current time as a naive UTC datetime (DB representation)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(value: datetime) -> datetime:
    """Normalise any datetime to naive UTC.

    SQLite drops timezone information, so comparing an aware datetime from a
    request with a naive datetime loaded from the DB raises ``TypeError``.
    Everything that touches the DB goes through this helper.
    """
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def iso_utc(value: datetime | None) -> str | None:
    """Serialise a (naive UTC) datetime as an ISO-8601 string ending in ``Z``."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 string into a naive UTC datetime."""
    if not value:
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return to_naive_utc(parsed)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """Return inclusive/exclusive date bounds for a calendar month."""
    start = date(year, month, 1)
    end = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    return start, end
