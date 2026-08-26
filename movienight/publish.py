"""Publish site/data.json to the Supabase site-data bucket.

The app downloads it at runtime (signed-in members only), so a pipeline run
refreshes everyone's picks without redeploying the web app. Same credential
rule as `movienight pull`: no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY means
announce and skip."""

from __future__ import annotations

from .config import Config
from .ingest.pull import Supa, credentials


def run(cfg: Config, supa: Supa | None = None) -> None:
    if supa is None:
        creds = credentials()
        if not creds:
            print(
                "publish: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — skipping."
            )
            return
        supa = Supa(*creds)
    data_path = cfg.site_dir / "data.json"
    if not data_path.exists():
        raise SystemExit(
            f"publish: {data_path} not found — run `movienight build` first."
        )
    content = data_path.read_bytes()
    supa.upload_site_data(content)
    print(f"publish: data.json ({len(content) // 1024} KB) → site-data bucket")
