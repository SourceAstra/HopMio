"""SQLite 事务与有版本号的初始数据表。"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path


class Database:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        self.root = root
        self.lock = threading.RLock()
        self.connection = sqlite3.connect(
            root / "yaha.sqlite3", check_same_thread=False
        )
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript("""
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, data TEXT NOT NULL);
            PRAGMA user_version=1;
        """)

    @contextmanager
    def transaction(self):
        with self.lock:
            with self.connection:
                yield self.connection

    def put(self, table: str, identifier: str, data: dict):
        assert table in {"projects", "assets", "jobs", "settings"}
        key = "key" if table == "settings" else "id"
        with self.transaction() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO {table}({key},data) VALUES (?,?)",
                (identifier, json.dumps(data, ensure_ascii=False)),
            )

    def get(self, table: str, identifier: str):
        assert table in {"projects", "revisions", "assets", "jobs", "settings"}
        key = "key" if table == "settings" else "id"
        with self.lock:
            row = self.connection.execute(
                f"SELECT data FROM {table} WHERE {key}=?", (identifier,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def list(self, table: str):
        assert table in {"projects", "revisions", "assets", "jobs"}
        with self.lock:
            rows = self.connection.execute(f"SELECT data FROM {table}").fetchall()
        return [json.loads(row[0]) for row in rows]

    def close(self):
        self.connection.close()
