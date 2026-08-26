"""Load config.toml, veto.yaml, overrides.yaml, and .env (SCOPING §6: config
lives in human-edited files, not the DB)."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Member:
    username: str
    name: str


@dataclass
class Config:
    root: Path
    members: list[Member]
    region: str = "US"
    contact: str = ""
    services: list[str] = field(default_factory=list)
    pool_max_films: int = 2500
    pool_vote_floor: int = 200

    @property
    def db_path(self) -> Path:
        return self.root / "data" / "movies.db"

    @property
    def site_dir(self) -> Path:
        return self.root / "site"

    @property
    def exports_dir(self) -> Path:
        return self.root / "data" / "exports"

    @property
    def report_path(self) -> Path:
        return self.root / "data" / "resolution_report.md"

    @property
    def user_agent(self) -> str:
        contact = f" (+mailto:{self.contact})" if self.contact else ""
        return f"movienight/0.1{contact}"

    @property
    def tmdb_key(self) -> str | None:
        return os.environ.get("TMDB_API_KEY") or None

    def veto(self) -> dict[str, dict]:
        return _load_yaml(self.root / "veto.yaml")

    def overrides(self) -> dict[str, int]:
        raw = _load_yaml(self.root / "overrides.yaml")
        return {slug: int(t) for slug, t in raw.items() if t}


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data or {}


def _load_dotenv(path: Path) -> None:
    """Tiny .env loader: KEY=VALUE lines, no expansion, existing env wins."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def load(root: Path | None = None) -> Config:
    root = (root or Path.cwd()).resolve()
    cfg_path = root / "config.toml"
    if not cfg_path.exists():
        raise SystemExit(
            f"config.toml not found in {root} — run from the project root."
        )
    _load_dotenv(root / ".env")
    with open(cfg_path, "rb") as f:
        raw = tomllib.load(f)
    members = [
        Member(username=m["username"], name=m.get("name") or m["username"])
        for m in raw.get("members", [])
    ]
    if not members:
        raise SystemExit("config.toml has no [[members]] entries.")
    pool = raw.get("pool", {})
    return Config(
        root=root,
        members=members,
        region=raw.get("region", "US"),
        contact=raw.get("contact", ""),
        services=raw.get("services", []),
        pool_max_films=int(pool.get("max_films", 2500)),
        pool_vote_floor=int(pool.get("vote_floor", 200)),
    )
