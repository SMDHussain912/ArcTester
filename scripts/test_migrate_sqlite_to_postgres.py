import datetime as dt
import os
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path

import psycopg
from psycopg import sql

from scripts.migrate_sqlite_to_postgres import (
    migrate,
    convert_value,
    dependency_order,
    postgres_dsn_without_schema,
    quote_sqlite_identifier,
)


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

    @unittest.skipUnless(os.getenv("DATABASE_URL"), "PostgreSQL integration test requires DATABASE_URL")
    def test_migration_copies_rows_and_resets_sequences(self):
        database_url = os.environ["DATABASE_URL"]
        schema = "migration_test_" + uuid.uuid4().hex
        dsn = postgres_dsn_without_schema(database_url)
        with tempfile.TemporaryDirectory() as directory:
            sqlite_path = Path(directory) / "legacy.db"
            source = sqlite3.connect(sqlite_path)
            source.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE Subject (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL UNIQUE
                );
                CREATE TABLE Topic (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  subjectId INTEGER NOT NULL REFERENCES Subject(id),
                  UNIQUE(subjectId, name)
                );
                CREATE TABLE Question (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  subjectId INTEGER NOT NULL REFERENCES Subject(id),
                  topicId INTEGER REFERENCES Topic(id),
                  text TEXT NOT NULL,
                  options TEXT NOT NULL,
                  correctIndex INTEGER NOT NULL,
                  explanation TEXT NOT NULL,
                  source TEXT NOT NULL,
                  difficulty TEXT NOT NULL,
                  questionHash TEXT NOT NULL UNIQUE,
                  createdAt TEXT NOT NULL
                );
                INSERT INTO Subject(id, name) VALUES (41, 'Physics');
                INSERT INTO Topic(id, name, subjectId) VALUES (71, 'Kinematics', 41);
                INSERT INTO Question(
                  id, subjectId, topicId, text, options, correctIndex,
                  explanation, source, difficulty, questionHash, createdAt
                ) VALUES (
                  99, 41, 71, 'What is velocity?', '["speed","direction","both","none"]',
                  2, 'Velocity has magnitude and direction.', 'legacy', 'easy',
                  'legacy-question-hash', '2026-11-09T10:00:00.000Z'
                );
                """
            )
            source.commit()
            source.close()

            with psycopg.connect(dsn) as target:
                target.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
                target.execute(sql.SQL(
                    'CREATE TABLE {}."Subject" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE)'
                ).format(sql.Identifier(schema)))
                target.execute(sql.SQL(
                    'CREATE TABLE {}."Topic" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL, '
                    '"subjectId" INTEGER NOT NULL REFERENCES {}."Subject"("id"), UNIQUE("subjectId", "name"))'
                ).format(sql.Identifier(schema), sql.Identifier(schema)))
                target.execute(sql.SQL(
                    'CREATE TABLE {}."Question" ("id" SERIAL PRIMARY KEY, '
                    '"subjectId" INTEGER NOT NULL REFERENCES {}."Subject"("id"), '
                    '"topicId" INTEGER REFERENCES {}."Topic"("id"), "text" TEXT NOT NULL, '
                    '"options" TEXT NOT NULL, "correctIndex" INTEGER NOT NULL, '
                    '"explanation" TEXT NOT NULL, "source" TEXT NOT NULL, '
                    '"difficulty" TEXT NOT NULL, "questionHash" TEXT NOT NULL UNIQUE, '
                    '"createdAt" TIMESTAMP(3) NOT NULL)'
                ).format(sql.Identifier(schema), sql.Identifier(schema), sql.Identifier(schema)))

            try:
                counts = migrate(sqlite_path, database_url, schema)
                self.assertEqual(counts, {"Subject": 1, "Topic": 1, "Question": 1})
                with psycopg.connect(dsn) as target:
                    row = target.execute(
                        sql.SQL('SELECT "id", "subjectId", "topicId", "createdAt" FROM {}."Question"')
                        .format(sql.Identifier(schema))
                    ).fetchone()
                    self.assertEqual(row[0:3], (99, 41, 71))
                    self.assertEqual(row[3], dt.datetime(2026, 11, 9, 10, 0))
                    next_id = target.execute(
                        sql.SQL('INSERT INTO {}."Subject" ("name") VALUES (%s) RETURNING "id"')
                        .format(sql.Identifier(schema)),
                        ("Chemistry",),
                    ).fetchone()[0]
                    self.assertEqual(next_id, 42)
            finally:
                with psycopg.connect(dsn) as target:
                    target.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))


if __name__ == "__main__":
    unittest.main()
