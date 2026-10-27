"""The player file's service record: milestones worked out from recorded
matches, entries staff write by hand, and who may see what.

Run with: pytest proclubs/tests/test_service_record.py
"""
import os
import re
import sys
import zlib
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import inspect  # noqa: E402

import app as appmod  # noqa: E402
import config  # noqa: E402
import database  # noqa: E402
import db  # noqa: E402
import service_record as sr  # noqa: E402
import services  # noqa: E402
from models import Milestone  # noqa: E402


def _match(n, *, goals=0, assists=0, rating=None, mom=0, clean_sheet=0, pos="midfielder"):
    """The n-th recorded match, one a day from 1 Jan 2026."""
    played = datetime(2026, 1, 1) + timedelta(days=n - 1)
    return {"played_at": int(played.replace(tzinfo=__import__("datetime").timezone.utc).timestamp()),
            "opp_name": f"Opp {n}", "us_score": 2, "opp_score": 1, "goals": goals,
            "assists": assists, "rating": rating, "mom": mom, "clean_sheet": clean_sheet, "pos": pos}


def _titles(entries):
    return {e["title"]: e for e in entries}


# --- Milestones ------------------------------------------------------------- #
def test_debut_and_appearance_steps_are_dated_by_their_match():
    got = _titles(sr.compute_milestones([_match(n) for n in range(1, 51)]))
    assert got["Debut"]["at"] == datetime(2026, 1, 1)
    assert got["25 appearances"]["at"] == datetime(2026, 1, 25)
    assert got["50 appearances"]["at"] == datetime(2026, 2, 19)
    assert "100 appearances" not in got
    assert got["Debut"]["detail"] == "vs Opp 1, 2–1"


def test_goal_and_assist_steps_fire_in_the_match_that_crosses_them():
    matches = [_match(1, goals=1, assists=1), _match(2, goals=4, assists=9), _match(3, goals=0)]
    got = _titles(sr.compute_milestones(matches))
    assert got["First goal"]["at"] == datetime(2026, 1, 1)
    assert got["First assist"]["at"] == datetime(2026, 1, 1)
    # 1 + 4 = 5 goals: no step yet. 1 + 9 = 10 assists: the 10-assist step.
    assert "10 goals" not in got
    assert got["10 assists"]["at"] == datetime(2026, 1, 2)
    # one big match can cross two steps at once
    steps = _titles(sr.compute_milestones([_match(1, goals=12)]))
    assert "10 goals" in steps and "First goal" in steps


def test_every_hat_trick_is_listed_and_bigger_hauls_say_so():
    got = [e["title"] for e in sr.compute_milestones(
        [_match(1, goals=3), _match(2, goals=2), _match(3, goals=5)])]
    assert got.count("Hat-trick") == 1 and "5 goals in a match" in got


def test_man_of_the_match_steps():
    got = _titles(sr.compute_milestones([_match(n, mom=1) for n in range(1, 6)]))
    assert got["First Man of the Match"]["at"] == datetime(2026, 1, 1)
    assert got["5 Man of the Match awards"]["at"] == datetime(2026, 1, 5)


def test_clean_sheets_count_only_for_keepers_and_defenders():
    defender = sr.compute_milestones([_match(n, clean_sheet=1, pos="defender") for n in range(1, 6)])
    assert "5 clean sheets" in _titles(defender)
    striker = sr.compute_milestones([_match(n, clean_sheet=1, pos="forward") for n in range(1, 6)])
    assert "5 clean sheets" not in _titles(striker)
    assert sr.career_totals([_match(1, clean_sheet=1, pos="forward")])["clean_sheets"] == 0


def test_personal_best_needs_enough_rated_matches_and_picks_the_highest():
    few = sr.compute_milestones([_match(n, rating=7.0) for n in range(1, 4)])
    assert not [e for e in few if e["kind"] == "rating"]
    ratings = [6.5, 7.0, 9.4, 8.0, 7.5]
    best = [e for e in sr.compute_milestones([_match(i + 1, rating=r) for i, r in enumerate(ratings)])
            if e["kind"] == "rating"]
    assert len(best) == 1 and best[0]["title"] == "Personal best rating, 9.4"
    assert best[0]["at"] == datetime(2026, 1, 3)


def test_no_matches_no_milestones():
    assert sr.compute_milestones([]) == []
    assert sr.career_totals([]) == {"apps": 0, "goals": 0, "assists": 0, "motm": 0,
                                    "clean_sheets": 0, "rating": None, "best": None}


def test_career_totals_and_months():
    ms = [_match(1, goals=2, rating=8.0), _match(2, assists=1, rating=6.0, mom=1), _match(40, goals=1)]
    t = sr.career_totals(ms)
    assert (t["apps"], t["goals"], t["assists"], t["motm"], t["rating"], t["best"]) == (3, 3, 1, 1, 7.0, 8.0)
    months = sr.career_months(ms)
    assert [m["label"] for m in months] == ["February 2026", "January 2026"]
    assert months[1]["apps"] == 2 and months[1]["goals"] == 2


def test_timeline_is_newest_first_with_undated_last():
    undated = {**_match(1), "played_at": None}
    tl = sr.build_timeline(matches=[undated, _match(30), _match(31, goals=1)], potm=[], contracts=[], moves=[],
                           ea_moves=[], written=[], is_self=False, is_staff=True)
    dates = [e["at"] for e in tl]
    assert dates == sorted([d for d in dates if d], reverse=True) + [None] * dates.count(None)
    assert dates[-1] is None


# --- Who sees what ---------------------------------------------------------- #
@pytest.mark.parametrize("kind,is_self,is_staff,expected", [
    ("COMMENDATION", False, False, True), ("COMMENDATION", True, False, True),
    ("WARNING", False, False, False), ("WARNING", True, False, True),
    ("WARNING", False, True, True), ("WARNING", True, True, True),
    ("NOTE", False, False, False), ("NOTE", True, False, False),
    ("NOTE", False, True, True), ("NOTE", True, True, False),
])
def test_entry_visibility(kind, is_self, is_staff, expected):
    assert sr.can_view(kind, is_self=is_self, is_staff=is_staff) is expected


def test_staff_add_entries_about_other_people_only():
    assert sr.can_add(is_self=False, is_staff=True)
    assert not sr.can_add(is_self=True, is_staff=True)
    assert not sr.can_add(is_self=False, is_staff=False)


def test_delete_is_for_the_author_or_management_and_never_unseen_entries():
    coach = {"id": 1, "is_staff": True, "is_management": False}
    boss = {"id": 2, "is_staff": True, "is_management": True}
    assert sr.can_delete("WARNING", "1", coach, is_self=False)
    assert not sr.can_delete("WARNING", "9", coach, is_self=False)
    assert sr.can_delete("WARNING", "9", boss, is_self=False)
    assert not sr.can_delete("NOTE", "2", boss, is_self=True)     # a note on yourself is unseen
    assert not sr.can_delete("WARNING", "1", {"id": 1}, is_self=False)
    assert not sr.can_delete("WARNING", "1", None, is_self=False)


# --- The table and the service functions ------------------------------------ #
def test_init_db_adds_the_table_to_an_existing_database():
    with database.engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS service_entries")
    database.init_db()
    cols = {c["name"] for c in inspect(database.engine).get_columns("service_entries")}
    assert {"discord_id", "kind", "body", "author_name", "author_discord_id", "occurred_at",
            "created_at"} <= cols


def test_add_service_entry_validates():
    author = {"id": 7, "name": "Coachy"}
    now = datetime(2026, 5, 10, 12)
    with database.get_session() as session:
        e = services.add_service_entry(session, discord_id="42", kind="commendation", body=" Great ",
                                       author=author, now=now)
        assert (e.kind, e.body, e.author_name, e.author_discord_id, e.occurred_at) == (
            "COMMENDATION", "Great", "Coachy", "7", now)
        past = services.add_service_entry(session, discord_id="42", kind="NOTE", body="x", author=author,
                                          occurred_on="2026-05-01", now=now)
        assert past.occurred_at == datetime(2026, 5, 1)
        for kwargs in ({"kind": "PRAISE", "body": "x"}, {"kind": "NOTE", "body": "  "},
                       {"kind": "NOTE", "body": "x" * 1001},
                       {"kind": "NOTE", "body": "x", "occurred_on": "2026-05-11"},
                       {"kind": "NOTE", "body": "x", "occurred_on": "yesterday"}):
            with pytest.raises(services.ServiceError):
                services.add_service_entry(session, discord_id="42", author=author, now=now, **kwargs)


# --- The page --------------------------------------------------------------- #
@pytest.fixture
def client():
    database.Base.metadata.drop_all(database.engine)
    with TestClient(appmod.app) as c:
        yield c


def _id(name):
    return str(zlib.crc32(name.encode()))


def _login(client, name):
    client.post("/auth/dev", data={"name": name, "member": "1"}, follow_redirects=False)
    return _id(name)


def _staff(name, role="Coach"):
    with database.get_session() as session:
        p = services.ensure_player(session, discord_id=_id(name), display_name=name)
        services.set_club_role(session, p, role)
    return _id(name)


def _csrf(client, path=None):
    """A token from the signed-in member's own file, which always has a form."""
    return re.search(r'name="csrf_token" value="([^"]+)"',
                     client.get("/players/me", follow_redirects=True).text).group(1)


def _post_entry(client, target, kind, body, **extra):
    return client.post(f"/players/{target}/service", data={
        "kind": kind, "body": body, "csrf_token": _csrf(client, f"/players/{target}"), **extra},
        follow_redirects=False)


@pytest.fixture
def squad(client):
    """Cap (42) is under contract; Coachy is a Coach, Boss a Head Coach."""
    with database.get_session() as session:
        services.ensure_player(session, discord_id="42", display_name="Cap")
        services.create_contract(session, discord_id="42", display_name="Cap", avatar_url=None,
                                 position="Striker", squad_status="Starter", weeks=8,
                                 source="recorded", created_by_name="Boss")
    return {"coach": _staff("Coachy"), "boss": _staff("Boss", "Head Coach")}


def test_members_cannot_write_entries(client, squad):
    _login(client, "Fan")
    r = _post_entry(client, "42", "COMMENDATION", "sneaky")
    assert r.status_code == 403
    with database.get_session() as session:
        assert services.list_service_entries(session, "42") == []


def test_staff_add_and_see_every_kind_on_someone_elses_file(client, squad):
    _login(client, "Coachy")
    for kind in ("COMMENDATION", "WARNING", "NOTE"):
        assert _post_entry(client, "42", kind, f"the {kind} text").status_code == 303
    html = client.get("/players/42").text
    assert "the COMMENDATION text" in html and "the WARNING text" in html and "the NOTE text" in html
    assert "Coachy" in html


def test_staff_cannot_write_entries_about_themselves(client, squad):
    _login(client, "Coachy")
    r = _post_entry(client, squad["coach"], "COMMENDATION", "me me me")
    assert r.status_code == 400
    with database.get_session() as session:
        assert services.list_service_entries(session, squad["coach"]) == []


def test_a_bad_entry_is_refused(client, squad):
    _login(client, "Coachy")
    assert _post_entry(client, "42", "PRAISE", "x").status_code == 400
    assert _post_entry(client, "42", "NOTE", "   ").status_code == 400
    assert _post_entry(client, "999", "NOTE", "x").status_code == 400     # nobody there


def test_warning_and_note_visibility_by_viewer(client, squad):
    with database.get_session() as session:
        for kind in ("COMMENDATION", "WARNING", "NOTE"):
            services.add_service_entry(session, discord_id="42", kind=kind, body=f"text-{kind}",
                                       author={"id": 1, "name": "Gaffer"})
    # a fan: the commendation only, and no hint anything else exists
    _login(client, "Fan")
    fan = client.get("/players/42").text
    assert "text-COMMENDATION" in fan
    assert "text-WARNING" not in fan and "text-NOTE" not in fan and "Warning" not in fan
    # the player: commendation and warning, never the note
    appmod_user = _login(client, "Cap")
    with database.get_session() as session:   # make the dev login "Cap" be player 42's page
        services.ensure_player(session, discord_id=appmod_user, display_name="Cap")
        for kind in ("COMMENDATION", "WARNING", "NOTE"):
            services.add_service_entry(session, discord_id=appmod_user, kind=kind, body=f"own-{kind}",
                                       author={"id": 1, "name": "Gaffer"})
    own = client.get(f"/players/{appmod_user}").text
    assert "own-COMMENDATION" in own and "own-WARNING" in own and "own-NOTE" not in own
    # staff: all three
    _login(client, "Coachy")
    staff = client.get("/players/42").text
    assert all(f"text-{k}" in staff for k in ("COMMENDATION", "WARNING", "NOTE"))
    # staff reading their own file: warnings yes, notes no (like coach notes)
    with database.get_session() as session:
        for kind in ("WARNING", "NOTE"):
            services.add_service_entry(session, discord_id=squad["coach"], kind=kind, body=f"mine-{kind}",
                                       author={"id": 1, "name": "Gaffer"})
    mine = client.get(f"/players/{squad['coach']}").text
    assert "mine-WARNING" in mine and "mine-NOTE" not in mine


def test_delete_permissions(client, squad):
    with database.get_session() as session:
        by_coach = services.add_service_entry(session, discord_id="42", kind="WARNING", body="late",
                                              author={"id": squad["coach"], "name": "Coachy"}).id
        by_other = services.add_service_entry(session, discord_id="42", kind="WARNING", body="rude",
                                              author={"id": 1, "name": "Gaffer"}).id

    def delete(entry_id):
        return client.post(f"/players/42/service/{entry_id}/delete",
                           data={"csrf_token": _csrf(client, "/players/42")}, follow_redirects=False)

    def exists(entry_id):
        with database.get_session() as session:
            return services.get_service_entry(session, entry_id) is not None

    _login(client, "Fan")
    assert delete(by_coach).status_code == 403 and exists(by_coach)
    _login(client, "Coachy")
    assert delete(by_other).status_code == 400 and exists(by_other)     # not theirs
    assert delete(by_coach).status_code == 303 and not exists(by_coach)  # theirs
    _login(client, "Boss")
    assert delete(by_other).status_code == 303 and not exists(by_other)  # management
    # the delete button only shows where it would work
    with database.get_session() as session:
        mine = services.add_service_entry(session, discord_id="42", kind="NOTE", body="n",
                                          author={"id": squad["coach"], "name": "Coachy"}).id
    _login(client, "Coachy")
    assert f"/service/{mine}/delete" in client.get("/players/42").text


def test_an_entry_on_another_players_file_cannot_be_deleted_through_a_different_url(client, squad):
    with database.get_session() as session:
        services.ensure_player(session, discord_id="43", display_name="Other")
        eid = services.add_service_entry(session, discord_id="43", kind="NOTE", body="n",
                                         author={"id": squad["coach"], "name": "Coachy"}).id
    _login(client, "Coachy")
    r = client.post(f"/players/42/service/{eid}/delete",
                    data={"csrf_token": _csrf(client, "/players/42")}, follow_redirects=False)
    assert r.status_code == 400


def test_clearance_redaction_on_the_profile(client, squad):
    with database.get_session() as session:
        services.add_coach_note(session, discord_id="42", body="coach-note-secret",
                                author={"id": 1, "name": "Gaffer"})
    # Anyone: card, overview and career render; restricted parts are bars, not content.
    _login(client, "Fan")
    html = client.get("/players/42").text
    for visible in ('class="file-hero"', 'id="file-overview"', 'id="file-career"', 'id="service-record"'):
        assert visible in html
    assert html.count('class="redacted"') >= 5          # contract, attendance, coach notes, ratings, development
    assert "Restricted · Player &amp; staff" in html and "Restricted · Staff" in html
    for secret in ("8 weeks", "coach-note-secret", "Turned up", "Add an entry"):
        assert secret not in html
    assert "Signed a contract" not in html              # the squad-move rows are one redacted row
    # Staff: the same page, with the contract and the notes in it.
    _login(client, "Coachy")
    html = client.get("/players/42").text
    assert "8 weeks" in html and "coach-note-secret" in html and "Add an entry" in html
    assert "Signed a contract" in html
    assert 'class="redacted"' not in html
    # The player: contract and attendance, but not the coach notes.
    cap = _login(client, "Capn")
    with database.get_session() as session:
        services.ensure_player(session, discord_id=cap, display_name="Capn")
        services.create_contract(session, discord_id=cap, display_name="Capn", avatar_url=None,
                                 position="Striker", squad_status="Starter", weeks=6,
                                 source="recorded", created_by_name="Boss")
        services.add_coach_note(session, discord_id=cap, body="hidden-from-capn",
                                author={"id": 1, "name": "Gaffer"})
    html = client.get(f"/players/{cap}").text
    assert "6 weeks" in html and "Signed a contract" in html
    assert "hidden-from-capn" not in html and "Add an entry" not in html
    assert "Restricted · Staff" in html


def test_milestones_show_on_the_profile_with_match_dates(client, squad, monkeypatch):
    with database.get_session() as session:
        services.set_player_link(session, discord_user_id=42, player_name="CapTag")
    monkeypatch.setattr(config, "CLUB_ID", "123")
    monkeypatch.setattr(db, "player_trend", lambda *a: [_match(1, goals=1), _match(2, goals=3)])
    _login(client, "Fan")
    html = client.get("/players/42").text
    assert "Debut" in html and "First goal" in html and "Hat-trick" in html
    assert 'data-record-filter="milestone"' in html
    # Headline numbers on the ID card come from the same matches.
    assert re.search(r"<dt>Goals</dt><dd>4</dd>", html) and re.search(r"<dt>Apps</dt><dd>2</dd>", html)


def test_tab_query_picks_the_open_tab(client, squad):
    _login(client, "Fan")
    html = client.get("/players/42?tab=record").text
    assert re.search(r'id="file-record" class="file-panel active"', html)
    assert re.search(r'id="file-overview" class="file-panel"', html)
    assert 'id="file-overview" class="file-panel active"' in client.get("/players/42?tab=bogus").text
