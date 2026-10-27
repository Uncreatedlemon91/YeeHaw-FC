"""The section navigation: what's grouped where, what each path belongs to,
and what each viewer sees.

Run with: pytest proclubs/tests/test_navigation.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app as appmod  # noqa: E402
import database  # noqa: E402
import navigation  # noqa: E402
import roles  # noqa: E402


@pytest.fixture
def client():
    database.Base.metadata.drop_all(database.engine)
    with TestClient(appmod.app) as c:
        yield c


def _login(client, *, staff):
    data = {"name": "Coach", "member": "1"}
    if staff:
        data["staff"] = "1"
    client.post("/auth/dev", data=data, follow_redirects=False)


# --- The registry ------------------------------------------------------------ #
def test_the_sections_group_what_they_should():
    tabs = {s.key: [t.href for t in s.tabs] for s in navigation.SECTIONS}
    assert [s.key for s in navigation.SECTIONS] == ["home", "matchday", "squad", "club", "media", "admin"]
    assert tabs["matchday"] == ["/events", "/training", "/tactics"]
    assert tabs["squad"] == ["/players", "/squad", "/recruitment"]
    assert tabs["club"] == ["/stats", "/league"]
    assert tabs["admin"] == ["/club-profile", "/roster", "/discord-roles"]
    # Home and Media are single pages, so they have no tab bar.
    assert tabs["home"] == [] and tabs["media"] == []


@pytest.mark.parametrize("path, section, tab", [
    ("/", "home", None),
    ("/news", "home", None),
    ("/news/some-story", "home", None),
    ("/news/new", "home", None),
    ("/events", "matchday", "/events"),
    ("/events/12", "matchday", "/events"),
    ("/events/new", "matchday", "/events"),
    ("/availability", "matchday", "/events"),
    ("/tactics", "matchday", "/tactics"),
    ("/set-pieces", "matchday", "/tactics"),
    ("/stats", "club", "/stats"),
    ("/league", "club", "/league"),
    ("/clips", "media", None),
    ("/streamers", "media", None),
    ("/players", "squad", "/players"),
    ("/players/42", "squad", "/players"),
    ("/squad", "squad", "/squad"),
    ("/squad/planner", "squad", "/squad"),
    ("/recruitment/3", "squad", "/recruitment"),
    ("/roster", "admin", "/roster"),
    ("/discord-roles", "admin", "/discord-roles"),
    ("/club-profile", "admin", "/club-profile"),
])
def test_every_page_belongs_to_its_section_and_tab(path, section, tab):
    s, t = navigation.locate(path)
    assert s.key == section
    assert (t.href if t else None) == tab


@pytest.mark.parametrize("path", ["/login", "/newsletter", "/eventsx", "/squadron"])
def test_lookalike_paths_belong_to_no_section(path):
    """A prefix must match a whole path segment -- /newsletter isn't News."""
    assert navigation.locate(path) == (None, None)


def test_guests_see_only_home_in_the_sidebar():
    assert [s.key for s in navigation.visible(roles.GUEST)] == ["home"]


@pytest.mark.parametrize("level, tabs", [
    (roles.MEMBER, ["/players"]),
    (roles.STAFF, ["/players", "/squad", "/recruitment"]),
    (roles.MANAGEMENT, ["/players", "/squad", "/recruitment"]),
])
def test_squad_tabs_follow_access_level(level, tabs):
    squad = next(s for s in navigation.SECTIONS if s.key == "squad")
    assert [t.href for t in squad.tabs_for(level)] == tabs


def test_admin_is_for_management_only():
    admin = next(s for s in navigation.SECTIONS if s.key == "admin")
    assert admin not in navigation.visible(roles.STAFF)
    assert admin in navigation.visible(roles.MANAGEMENT)
    assert [t.href for t in admin.tabs_for(roles.STAFF)] == []
    assert [t.href for t in admin.tabs_for(roles.MANAGEMENT)] == ["/club-profile", "/roster", "/discord-roles"]


def test_every_tab_route_exists(client):
    """A tab pointing at a route that was renamed would be a dead link in
    every page's header. Requested rather than looked up in app.routes:
    routes from an included router aren't listed there individually."""
    _login(client, staff=True)
    for s in navigation.SECTIONS:
        for href in [s.url] + [t.href for t in s.tabs]:
            assert client.get(href, follow_redirects=False).status_code == 200, href


# --- Rendered -------------------------------------------------------------- #
def test_the_sidebar_marks_the_current_section(client):
    _login(client, staff=False)
    html = client.get("/league").text
    # The active link is Club's, and the Club tabs are shown with League current.
    assert 'href="/stats" class="side-link active"' in html
    assert 'href="/league" class="tab active" aria-current="page"' in html
    assert 'href="/stats" class="tab"' in html


def test_sections_without_tabs_show_no_tab_bar(client):
    _login(client, staff=False)
    for path in ["/news", "/clips", "/streamers"]:
        assert 'class="tab-bar"' not in client.get(path).text, path


def test_news_is_no_longer_in_the_sidebar_but_lights_up_home(client):
    _login(client, staff=False)
    html = client.get("/news").text
    assert 'aria-label="Sections"' in html
    assert 'href="/news" class="side-link' not in html
    assert 'href="/" class="side-link active"' in html


@pytest.mark.parametrize("path, switcher_has", [
    ("/events", ["/availability"]),
    ("/availability", ["/events"]),
    ("/tactics", ["/set-pieces"]),
    ("/set-pieces", ["/tactics"]),
    ("/clips", ["/streamers"]),
    ("/streamers", ["/clips"]),
])
def test_tabs_with_two_pages_show_a_view_switcher(client, path, switcher_has):
    _login(client, staff=False)
    html = client.get(path).text
    assert 'class="category-pills view-switch"' in html
    for href in switcher_has:
        assert f'href="{href}" class="pill' in html


def test_squad_hub_switches_between_overview_and_planner(client):
    _login(client, staff=True)
    for path in ["/squad", "/squad/planner"]:
        html = client.get(path).text
        assert 'href="/squad" class="pill' in html and 'href="/squad/planner" class="pill' in html
        # One tab is lit for both: the Squad hub.
        assert 'href="/squad" class="tab active" aria-current="page"' in html


def test_availability_lights_up_fixtures_and_set_pieces_lights_up_tactics(client):
    _login(client, staff=False)
    assert 'href="/events" class="tab active" aria-current="page"' in client.get("/availability").text
    assert 'href="/tactics" class="tab active" aria-current="page"' in client.get("/set-pieces").text


def test_media_page_shows_live_strip_only_when_someone_is_live(client, monkeypatch):
    _login(client, staff=False)
    assert "Live Now" not in client.get("/clips").text
    with appmod.get_session() as session:
        appmod.services.create_streamer(session, display_name="Rowdy", twitch_login="rowdy",
                                          avatar=None, author_name="Coach")
    monkeypatch.setattr(appmod.twitch_client, "live_streams", lambda logins: {
        l: {"url": f"https://twitch.tv/{l}", "viewer_count": 3, "title": "t", "thumbnail_url": ""} for l in logins})
    assert "Live Now" in client.get("/clips").text


@pytest.mark.parametrize("shortcut, target", [
    ("/matchday", "/events"), ("/club", "/stats"), ("/media", "/clips"),
    ("/admin", "/club-profile"),
])
def test_section_shortcuts_land_on_the_first_tab(client, shortcut, target):
    _login(client, staff=False)
    r = client.get(shortcut, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == target


def test_old_page_addresses_still_work(client):
    """Grouping pages into sections must not break a link anybody saved."""
    _login(client, staff=False)
    for path in ["/events", "/availability", "/tactics", "/set-pieces", "/stats", "/league",
                 "/clips", "/streamers", "/news"]:
        r = client.get(path, follow_redirects=False)
        assert r.status_code == 200, path


def test_squad_is_in_the_sidebar_for_members(client):
    """Every member sees the squad (its Players tab); guests don't."""
    assert 'href="/players" class="side-link' not in client.get("/login").text
    _login(client, staff=False)
    assert 'href="/players" class="side-link' in client.get("/").text


def test_every_page_title_wears_its_kicker(client):
    """The "YFC / FIXTURES & SIGN-UPS" line above each title comes from
    the shell, so no template has to repeat it."""
    _login(client, staff=False)
    assert "--kicker: 'YFC / Fixtures';" in client.get("/events").text
    assert "--kicker: 'YFC / News';" in client.get("/news").text
