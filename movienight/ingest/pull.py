"""Pull export zips uploaded through the app (Supabase onboarding).

The app signs members in, parses their zip on-device for display, and stores
the raw zip at exports/<user_id>/<file> in the private bucket plus a row in
public.uploads (status='uploaded'). Here we download each pending zip with the
service role key, feed it to the standard zip importer, and mark the row
imported or rejected. Membership is config.toml plus every onboarded app
profile (sync_profile_members, called by the CLI for all commands) — signing
up in the app is the whole onboarding; nobody edits config for a new member.
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env; when unset every
step here announces itself and does nothing."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3

import httpx

from ..config import Config, Member
from . import importer


def credentials() -> tuple[str, str] | None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return url.rstrip("/"), key
    return None


class Supa:
    """Thin PostgREST + storage client; transport is injectable for tests."""

    def __init__(self, url: str, key: str,
                 transport: httpx.BaseTransport | None = None):
        self.url = url
        self.client = httpx.Client(
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=60.0,
            transport=transport,
        )

    def pending_uploads(self) -> list[dict]:
        r = self.client.get(
            f"{self.url}/rest/v1/uploads",
            params={
                "status": "eq.uploaded",
                "select": "id,user_id,object_path,file_name,created_at",
                "order": "created_at.asc",
            },
        )
        r.raise_for_status()
        return r.json()

    def usernames_by_user(self) -> dict[str, str]:
        r = self.client.get(
            f"{self.url}/rest/v1/profiles",
            params={"select": "id,letterboxd_username"},
        )
        r.raise_for_status()
        return {row["id"]: row["letterboxd_username"] for row in r.json()}

    def onboarded_profiles(self) -> list[dict]:
        r = self.client.get(
            f"{self.url}/rest/v1/profiles",
            params={
                "select": "letterboxd_username,display_name",
                "onboarded_at": "not.is.null",
                "order": "created_at.asc",
            },
        )
        r.raise_for_status()
        return r.json()

    def upload_site_data(self, content: bytes) -> None:
        r = self.client.post(
            f"{self.url}/storage/v1/object/site-data/data.json",
            headers={"Content-Type": "application/json", "x-upsert": "true"},
            content=content,
        )
        r.raise_for_status()

    def download(self, object_path: str) -> bytes:
        r = self.client.get(
            f"{self.url}/storage/v1/object/exports/{object_path}"
        )
        r.raise_for_status()
        return r.content

    def mark(self, upload_id: str, status: str) -> None:
        body: dict = {"status": status}
        if status == "imported":
            body["imported_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        r = self.client.patch(
            f"{self.url}/rest/v1/uploads",
            params={"id": f"eq.{upload_id}"},
            headers={"Prefer": "return=minimal"},
            json=body,
        )
        r.raise_for_status()


def sync_profile_members(cfg: Config, supa: Supa | None = None) -> None:
    """Merge onboarded app profiles into cfg.members so every downstream step
    (import gate, RSS polling, scoring, build order) treats app signups exactly
    like config.toml members. Without creds this is a no-op — config.toml
    stays the whole roster, as before the app existed."""
    if supa is None:
        creds = credentials()
        if not creds:
            return
        supa = Supa(*creds)
    known = {m.username.lower() for m in cfg.members}
    added = []
    for row in supa.onboarded_profiles():
        username = (row.get("letterboxd_username") or "").strip()
        if not username or username.lower() in known:
            continue
        cfg.members.append(
            Member(username=username, name=row.get("display_name") or username)
        )
        known.add(username.lower())
        added.append(username)
    if added:
        print(f"members: +{', '.join(added)} (app signups)")


def run(conn: sqlite3.Connection, cfg: Config, supa: Supa | None = None) -> None:
    if supa is None:
        creds = credentials()
        if not creds:
            print(
                "pull: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — skipping."
            )
            return
        supa = Supa(*creds)

    uploads = supa.pending_uploads()
    if not uploads:
        print("pull: no new uploads.")
        return

    usernames = supa.usernames_by_user()
    cfg.exports_dir.mkdir(parents=True, exist_ok=True)
    for up in uploads:
        # Timestamp prefix so a member's re-upload sorts after their original
        # when `movienight all` later re-imports everything in filename order.
        stamp = "".join(c for c in up["created_at"][:19] if c.isdigit())
        dest = cfg.exports_dir / f"pulled-{stamp}-{up['file_name']}"
        dest.write_bytes(supa.download(up["object_path"]))
        try:
            result = importer.import_zip(
                conn, cfg, dest, member_override=usernames.get(up["user_id"])
            )
        except SystemExit as e:
            print(f"pull: rejected {up['file_name']}: {e}")
            supa.mark(up["id"], "rejected")
            continue
        user = result.pop("username")
        pretty = ", ".join(f"{k} {v}" for k, v in result.items())
        print(f"pull: {user} ← {up['file_name']}: {pretty}")
        supa.mark(up["id"], "imported")
