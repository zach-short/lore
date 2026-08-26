"""Import + RSS ingestion: idempotency, both URI styles, identity convergence."""

from lore import db
from lore.ingest import importer, rss
from tests.conftest import make_zip

RSS_XML = """<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
<channel><title>Letterboxd - Zach</title>
<item><title>Nightfall 0, 1990 - ★★★★</title>
 <link>https://letterboxd.com/zach/film/nightfall-0-1990/</link>
 <guid isPermaLink="false">letterboxd-watch-111</guid>
 <pubDate>Mon, 17 Aug 2026 05:21:04 +1200</pubDate>
 <letterboxd:watchedDate>2026-08-15</letterboxd:watchedDate>
 <letterboxd:rewatch>Yes</letterboxd:rewatch>
 <letterboxd:filmTitle>Nightfall 0</letterboxd:filmTitle>
 <letterboxd:filmYear>1990</letterboxd:filmYear>
 <letterboxd:memberRating>4.0</letterboxd:memberRating>
 <letterboxd:memberLike>Yes</letterboxd:memberLike>
 <tmdb:movieId>9000</tmdb:movieId>
 <dc:creator>Zach Short</dc:creator></item>
<item><title>Some Show</title>
 <link>https://letterboxd.com/zach/film/some-show/</link>
 <guid isPermaLink="false">letterboxd-review-222</guid>
 <pubDate>Sun, 16 Aug 2026 01:00:00 +1200</pubDate>
 <letterboxd:watchedDate>2026-08-14</letterboxd:watchedDate>
 <letterboxd:rewatch>No</letterboxd:rewatch>
 <letterboxd:filmTitle>Some Show</letterboxd:filmTitle>
 <letterboxd:filmYear>2024</letterboxd:filmYear>
 <tmdb:tvId>777</tmdb:tvId>
 <dc:creator>Zach Short</dc:creator></item>
<item><title>My List</title>
 <link>https://letterboxd.com/zach/list/my-list/</link>
 <guid isPermaLink="false">letterboxd-list-333</guid>
 <pubDate>Sat, 15 Aug 2026 01:00:00 +1200</pubDate></item>
</channel></rss>"""


def test_import_idempotent_and_merge_rules(project):
    cfg, conn = project
    zpath = make_zip(
        cfg.exports_dir / "letterboxd-zach-2026.zip",
        "zach",
        ratings=[
            ("Nightfall 0", 1990, 4.5, "2026-01-05", "nightfall-0-1990"),
            ("Sunny Side 24", 2000, 2.0, "2026-01-06", None),
        ],
        watchlist=[("Han River 34", 2005, None)],
        likes=[("Nightfall 0", 1990, "nightfall-0-1990")],
    )
    importer.run(conn, cfg, [zpath])
    importer.run(conn, cfg, [zpath])  # re-import must not duplicate

    n_int = conn.execute("SELECT count(*) c FROM interaction").fetchone()["c"]
    n_diary = conn.execute("SELECT count(*) c FROM diary_entry").fetchone()["c"]
    assert n_int == 3
    assert n_diary == 2

    mid = db.get_member(conn, "zach")["id"]
    row = conn.execute(
        """SELECT i.* FROM interaction i JOIN film f ON f.id=i.film_id
           WHERE f.lb_slug='nightfall-0-1990' AND i.member_id=?""",
        (mid,),
    ).fetchone()
    assert row["watched"] == 1 and row["rating"] == 4.5 and row["liked"] == 1

    wl = conn.execute(
        "SELECT count(*) c FROM interaction WHERE member_id=? AND in_watchlist=1",
        (mid,),
    ).fetchone()["c"]
    assert wl == 1


def test_boxd_uri_falls_back_to_title_identity(project):
    cfg, conn = project
    zpath = make_zip(
        cfg.exports_dir / "letterboxd-colin-2026.zip",
        "colin",
        ratings=[("Nightfall 1", 1991, 3.5, "2026-02-01", None)],
        uri_style="boxd",
    )
    importer.run(conn, cfg, [zpath])
    film = conn.execute(
        "SELECT * FROM film WHERE title_norm='nightfall 1'"
    ).fetchone()
    assert film is not None and film["lb_slug"] is None
    assert film["resolution_status"] == "pending"


def test_rss_parse_apply_and_convergence(project):
    cfg, conn = project
    # CSV stub first (slugless), then RSS for the same film must converge.
    zpath = make_zip(
        cfg.exports_dir / "letterboxd-zach-2026.zip",
        "zach",
        ratings=[("Nightfall 0", 1990, 3.0, "2026-01-05", None)],
        uri_style="boxd",
    )
    importer.run(conn, cfg, [zpath])
    author, items = rss.parse_feed(RSS_XML.encode())
    assert author == "Zach Short"
    assert len(items) == 2  # list item skipped
    assert items[0]["tmdb_id"] == 9000 and items[0]["rewatch"] is True
    assert items[1]["tmdb_tv_id"] == 777 and items[1]["tmdb_id"] is None

    mid = db.get_member(conn, "zach")["id"]
    rss.apply_items(conn, mid, items)
    rss.apply_items(conn, mid, items)  # replay must be idempotent

    films = conn.execute(
        "SELECT * FROM film WHERE title_norm='nightfall 0'"
    ).fetchall()
    assert len(films) == 1, "CSV stub and RSS row must converge to one film"
    f = films[0]
    assert f["tmdb_id"] == 9000 and f["lb_slug"] == "nightfall-0-1990"
    assert f["resolution_status"] == "resolved"

    row = conn.execute(
        "SELECT * FROM interaction WHERE member_id=? AND film_id=?", (mid, f["id"])
    ).fetchone()
    # RSS activity (2026-08-15) is newer than the export rating (2026-01-05)
    assert row["rating"] == 4.0 and row["liked"] == 1
    assert row["rewatch_count"] == 1

    tv = conn.execute("SELECT * FROM film WHERE kind='tv'").fetchone()
    assert tv is not None and tv["tmdb_id"] is None
