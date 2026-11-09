import datetime as dt
import unittest

from scripts.migrate_sqlite_to_postgres import (
    convert_value,
    dependency_order,
    postgres_dsn_without_schema,
    quote_sqlite_identifier,
)
import sqlite3


class SqliteToPostgresMigrationTests(unittest.TestCase):
    def test_dependency_order_places_parent_tables_first(self):
        source = sqlite3.connect(":memory:")
        source.execute('CREATE TABLE "Parent" (id INTEGER PRIMARY KEY)')
        source.execute('CREATE TABLE "Child" (id INTEGER PRIMARY KEY, parentId INTEGER REFERENCES "Parent"(id))')
        self.assertEqual(dependency_order(source, ["Child", "Parent"]), ["Parent", "Child"])
        source.close()

    def test_boolean_conversion(self):
        self.assertIs(convert_value(1, "boolean"), True)
        self.assertIs(convert_value(0, "boolean"), False)

    def test_timestamp_conversion_to_utc_naive(self):
        value = convert_value("2026-11-09T10:30:00+05:30", "timestamp without time zone")
        self.assertEqual(value, dt.datetime(2026, 11, 9, 5, 0, 0))
        self.assertIsNone(value.tzinfo)

    def test_timestamp_conversion_keeps_timezone(self):
        value = convert_value("2026-11-09T10:30:00Z", "timestamp with time zone")
        self.assertEqual(value.utcoffset(), dt.timedelta(0))

    def test_dsn_removes_prisma_schema_parameter(self):
        self.assertEqual(
            postgres_dsn_without_schema("postgresql://user:pass@localhost/db?schema=public&sslmode=require"),
            "postgresql://user:pass@localhost/db?sslmode=require",
        )

    def test_sqlite_identifier_quoting(self):
        self.assertEqual(quote_sqlite_identifier('a"b'), '"a""b"')


if __name__ == "__main__":
    unittest.main()
