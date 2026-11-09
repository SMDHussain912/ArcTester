#!/usr/bin/env python3
"""Copy an existing ArcTester SQLite database into an empty PostgreSQL schema.

The script is intentionally read-only on SQLite and transactional on PostgreSQL.
Run Prisma migrations against PostgreSQL first. It preserves model IDs and
foreign-key values, then resets PostgreSQL serial sequences.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sqlite3
import sys
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg import sql


IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SKIP_TABLES = {"_prisma_migrations", "sqlite_sequence"}


def validate_identifier(value: str, label: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise ValueError(f"Invalid {label}: {value!r}")
    return value


def postgres_dsn_without_schema(url: str) -> str:
    parsed = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key != "schema"]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def quote_sqlite_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def table_names(source: sqlite3.Connection) -> list[str]:
    rows = source.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).fetchall()
    return [row[0] for row in rows if row[0] not in SKIP_TABLES and not row[0].startswith("sqlite_")]


def dependency_order(source: sqlite3.Connection, tables: list[str]) -> list[str]:
    table_set = set(tables)
    dependencies: dict[str, set[str]] = {table: set() for table in tables}
    for table in tables:
        rows = source.execute(f"PRAGMA foreign_key_list({quote_sqlite_identifier(table)})").fetchall()
        for row in rows:
            parent = row[2]
            if parent in table_set and parent != table:
                dependencies[table].add(parent)

    ordered: list[str] = []
    while dependencies:
        ready = sorted(table for table, parents in dependencies.items() if not parents)
        if not ready:
            cycle = ", ".join(sorted(dependencies))
            raise ValueError(f"Foreign-key dependency cycle detected: {cycle}")
        for table in ready:
            ordered.append(table)
            dependencies.pop(table)
        for parents in dependencies.values():
            parents.difference_update(ready)
    return ordered


def parse_datetime(value: object) -> dt.datetime:
    if isinstance(value, dt.datetime):
        parsed = value
    elif isinstance(value, (int, float)):
        parsed = dt.datetime.fromtimestamp(value, tz=dt.timezone.utc)
    else:
        text = str(value).strip().replace("Z", "+00:00")
        parsed = dt.datetime.fromisoformat(text)
    return parsed


def convert_value(value: object, data_type: str) -> object:
    if value is None:
        return None
    if data_type == "boolean":
        return bool(value)
    if data_type.startswith("timestamp"):
        parsed = parse_datetime(value)
        if data_type == "timestamp without time zone":
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
        elif parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed
    if data_type == "date":
        if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
            return value
        return dt.date.fromisoformat(str(value)[:10])
    if data_type == "time without time zone":
        return dt.time.fromisoformat(str(value))
    if data_type in {"smallint", "integer", "bigint"}:
        return int(value)
    if data_type in {"real", "double precision"}:
        return float(value)
    if data_type == "numeric":
        return Decimal(str(value))
    if data_type in {"text", "character varying", "character"}:
        return str(value)
    if data_type == "bytea":
        return bytes(value)
    return value


def target_columns(cursor: psycopg.Cursor, schema: str, table: str) -> dict[str, dict[str, object]]:
    rows = cursor.execute(
        """
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema, table),
    ).fetchall()
    return {
        row[0]: {
            "data_type": row[1],
            "column_default": row[2],
            "is_nullable": row[3],
        }
        for row in rows
    }


def migrate(sqlite_path: Path, database_url: str, schema: str) -> dict[str, int]:
    validate_identifier(schema, "PostgreSQL schema")
    if not sqlite_path.is_file():
        raise FileNotFoundError(f"SQLite database not found: {sqlite_path}")

    source = sqlite3.connect(f"file:{sqlite_path.resolve()}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    source.execute("PRAGMA query_only = ON")
    tables = table_names(source)
    ordered_tables = dependency_order(source, tables)
    dsn = postgres_dsn_without_schema(database_url)
    imported: dict[str, int] = {}

    try:
        with psycopg.connect(dsn) as target:
            with target.transaction():
                with target.cursor() as cursor:
                    schema_exists = cursor.execute(
                        "SELECT 1 FROM information_schema.schemata WHERE schema_name = %s",
                        (schema,),
                    ).fetchone()
                    if not schema_exists:
                        raise ValueError(f"PostgreSQL schema {schema!r} does not exist. Apply Prisma migrations first.")

                    metadata: dict[str, dict[str, dict[str, object]]] = {}
                    for table in ordered_tables:
                        columns = target_columns(cursor, schema, table)
                        if not columns:
                            raise ValueError(
                                f"PostgreSQL table {schema}.{table} is missing. Apply Prisma migrations before importing."
                            )
                        metadata[table] = columns
                        existing = cursor.execute(
                            sql.SQL("SELECT EXISTS (SELECT 1 FROM {}.{} LIMIT 1)").format(
                                sql.Identifier(schema), sql.Identifier(table)
                            )
                        ).fetchone()[0]
                        if existing:
                            raise ValueError(
                                f"Target table {schema}.{table} is not empty. Import only into a fresh migrated database."
                            )

                    for table in ordered_tables:
                        sqlite_info = source.execute(
                            f"PRAGMA table_info({quote_sqlite_identifier(table)})"
                        ).fetchall()
                        source_columns = [row["name"] for row in sqlite_info]
                        target_meta = metadata[table]
                        missing_target = [
                            name for name, info in target_meta.items()
                            if name not in source_columns
                            and info["is_nullable"] == "NO"
                            and info["column_default"] is None
                        ]
                        extra_source = [name for name in source_columns if name not in target_meta]
                        if missing_target or extra_source:
                            raise ValueError(
                                f"Schema mismatch for {table}: missing in SQLite={missing_target}; "
                                f"unexpected in SQLite={extra_source}"
                            )

                        quoted_columns = sql.SQL(", ").join(sql.Identifier(name) for name in source_columns)
                        placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in source_columns)
                        insert = sql.SQL("INSERT INTO {}.{} ({}) VALUES ({})").format(
                            sql.Identifier(schema),
                            sql.Identifier(table),
                            quoted_columns,
                            placeholders,
                        )
                        query = (
                            f"SELECT {', '.join(quote_sqlite_identifier(name) for name in source_columns)} "
                            f"FROM {quote_sqlite_identifier(table)}"
                        )
                        rows = source.execute(query)
                        count = 0
                        while True:
                            batch = rows.fetchmany(500)
                            if not batch:
                                break
                            values = [
                                tuple(convert_value(row[name], str(target_meta[name]["data_type"])) for name in source_columns)
                                for row in batch
                            ]
                            cursor.executemany(insert, values)
                            count += len(values)
                        imported[table] = count

                    for table, columns in metadata.items():
                        for name, info in columns.items():
                            default = str(info["column_default"] or "")
                            if "nextval(" not in default:
                                continue
                            sequence = cursor.execute(
                                "SELECT pg_get_serial_sequence(%s, %s)",
                                (f'{schema}."{table}"', name),
                            ).fetchone()[0]
                            if not sequence:
                                continue
                            maximum = cursor.execute(
                                sql.SQL("SELECT MAX({}) FROM {}.{}").format(
                                    sql.Identifier(name),
                                    sql.Identifier(schema),
                                    sql.Identifier(table),
                                )
                            ).fetchone()[0]
                            if maximum is None:
                                cursor.execute("SELECT setval(%s, 1, false)", (sequence,))
                            else:
                                cursor.execute("SELECT setval(%s, %s, true)", (sequence, maximum))
        return imported
    finally:
        source.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=Path("api/prisma/dev.db"))
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--schema", default="public")
    args = parser.parse_args()
    if not args.database_url:
        parser.error("Set DATABASE_URL or pass --database-url.")

    try:
        counts = migrate(args.sqlite, args.database_url, args.schema)
    except Exception as error:
        print(f"SQLite-to-PostgreSQL migration failed: {error}", file=sys.stderr)
        return 1

    print("SQLite data copied successfully. Source database was not modified.")
    for table, count in counts.items():
        print(f"  {table}: {count} rows")
    print("Verify these counts before starting the application.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
