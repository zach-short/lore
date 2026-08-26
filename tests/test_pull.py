"""`movienight pull`: download app-uploaded zips, import, mark status —
plus the profile→member sync and `movienight publish` that share its client."""

from __future__ import annotations

import json

import httpx

from movienight import publish
from movienight.ingest.pull import Supa, run, sync_profile_members

from tests.conftest import make_zip

ZACH_USER_ID = "11111111-2222-3333-4444-555555555555"
GHOST_USER_ID = "99999999-8888-7777-6666-555555555555"


def fake_supabase(zips: dict[str, bytes], uploads: list[dict],
                  profiles: list[dict], patches: list[dict],
                  published: list[dict] | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/rest/v1/uploads" and request.method == "GET":
            return httpx.Response(200, json=uploads)
        if path == "/rest/v1/profiles":
            rows = profiles
            if request.url.params.get("onboarded_at") == "not.is.null":
                rows = [r for r in rows if r.get("onboarded_at")]
            return httpx.Response(200, json=rows)
        if path == "/rest/v1/uploads" and request.method == "PATCH":
            patches.append(
                {"id": request.url.params["id"], **json.loads(request.content)}
            )
            return httpx.Response(204)
        if path.startswith("/storage/v1/object/exports/"):
            key = path.removeprefix("/storage/v1/object/exports/")
            if key in zips:
                return httpx.Response(200, content=zips[key])
            return httpx.Response(404, json={"error": "not found"})
        if path.startswith("/storage/v1/object/site-data/") \
                and request.method == "POST":
            (published if published is not None else []).append({
                "key": path.removeprefix("/storage/v1/object/site-data/"),
                "upsert": request.headers.get("x-upsert"),
                "content": request.content,
            })
            return httpx.Response(200, json={"Key": path})
        return httpx.Response(404, json={"error": f"unmocked {path}"})

    return Supa("http://supa.test", "service-key",
                transport=httpx.MockTransport(handler))


def upload_row(upload_id: str, user_id: str, object_path: str) -> dict:
    return {
        "id": upload_id,
        "user_id": user_id,
        "object_path": object_path,
        "file_name": object_path.rsplit("/", 1)[-1],
        "created_at": "2026-08-26T04:00:00.000000+00:00",
    }


def test_pull_imports_known_member_and_marks_imported(project, tmp_path):
    cfg, conn = project
    zip_path = make_zip(
        tmp_path / "letterboxd-zach-2026.zip",
        "zach",
        ratings=[("Nightfall 0", 1990, 4.5, "2026-01-05", None)],
        watchlist=[("Sunny Side 24", 2000, None)],
    )
    patches: list[dict] = []
    supa = fake_supabase(
        zips={f"{ZACH_USER_ID}/letterboxd-zach-2026.zip": zip_path.read_bytes()},
        uploads=[upload_row("u-1", ZACH_USER_ID,
                            f"{ZACH_USER_ID}/letterboxd-zach-2026.zip")],
        profiles=[{"id": ZACH_USER_ID, "letterboxd_username": "zach"}],
        patches=patches,
    )

    run(conn, cfg, supa=supa)

    member_id = conn.execute(
        "SELECT id FROM member WHERE username='zach'"
    ).fetchone()["id"]
    rated = conn.execute(
        "SELECT count(*) AS n FROM interaction WHERE member_id=? AND rating IS NOT NULL",
        (member_id,),
    ).fetchone()["n"]
    assert rated == 1
    assert patches == [{"id": "eq.u-1", "status": "imported",
                        "imported_at": patches[0]["imported_at"]}]
    # The zip lands in exports_dir with a sortable timestamp prefix so later
    # `movienight all` runs re-import it in upload order.
    saved = list(cfg.exports_dir.glob("pulled-*.zip"))
    assert saved and saved[0].name.startswith("pulled-20260826")


def test_pull_rejects_usernames_outside_config(project, tmp_path):
    cfg, conn = project
    zip_path = make_zip(
        tmp_path / "letterboxd-stranger-2026.zip",
        "stranger",
        ratings=[("Nightfall 0", 1990, 4.0, "2026-01-05", None)],
    )
    patches: list[dict] = []
    supa = fake_supabase(
        zips={f"{GHOST_USER_ID}/letterboxd-stranger-2026.zip": zip_path.read_bytes()},
        uploads=[upload_row("u-2", GHOST_USER_ID,
                            f"{GHOST_USER_ID}/letterboxd-stranger-2026.zip")],
        profiles=[{"id": GHOST_USER_ID, "letterboxd_username": "stranger"}],
        patches=patches,
    )

    run(conn, cfg, supa=supa)

    assert patches == [{"id": "eq.u-2", "status": "rejected"}]


def test_pull_without_pending_uploads_is_quiet(project, capsys):
    cfg, conn = project
    supa = fake_supabase(zips={}, uploads=[], profiles=[], patches=[])
    run(conn, cfg, supa=supa)
    assert "no new uploads" in capsys.readouterr().out


def test_profile_members_join_the_roster_and_import(project, tmp_path):
    """An onboarded app signup becomes a member with no config.toml edit, and
    their upload imports on the same run."""
    cfg, conn = project
    zip_path = make_zip(
        tmp_path / "letterboxd-stranger-2026.zip",
        "stranger",
        ratings=[("Nightfall 0", 1990, 4.0, "2026-01-05", None)],
    )
    patches: list[dict] = []
    supa = fake_supabase(
        zips={f"{GHOST_USER_ID}/letterboxd-stranger-2026.zip": zip_path.read_bytes()},
        uploads=[upload_row("u-3", GHOST_USER_ID,
                            f"{GHOST_USER_ID}/letterboxd-stranger-2026.zip")],
        profiles=[{"id": GHOST_USER_ID, "letterboxd_username": "stranger",
                   "display_name": "Sam", "onboarded_at": "2026-08-26T04:00:00Z"}],
        patches=patches,
    )

    sync_profile_members(cfg, supa=supa)

    assert [m.username for m in cfg.members][-1] == "stranger"
    assert cfg.members[-1].name == "Sam"

    run(conn, cfg, supa=supa)
    assert patches == [{"id": "eq.u-3", "status": "imported",
                        "imported_at": patches[0]["imported_at"]}]


def test_sync_profile_members_dedupes_config_entries(project):
    cfg, _ = project
    before = [m.username for m in cfg.members]
    supa = fake_supabase(
        zips={}, uploads=[], patches=[],
        profiles=[{"id": ZACH_USER_ID, "letterboxd_username": "ZACH",
                   "display_name": "Zach", "onboarded_at": "2026-08-26T04:00:00Z"}],
    )
    sync_profile_members(cfg, supa=supa)
    assert [m.username for m in cfg.members] == before


def test_publish_uploads_data_json_with_upsert(project):
    cfg, _ = project
    cfg.site_dir.mkdir(parents=True, exist_ok=True)
    payload = b'{"members": []}'
    (cfg.site_dir / "data.json").write_bytes(payload)
    published: list[dict] = []
    supa = fake_supabase(zips={}, uploads=[], profiles=[], patches=[],
                         published=published)

    publish.run(cfg, supa=supa)

    assert published == [{"key": "data.json", "upsert": "true",
                          "content": payload}]
