"""A player's service record: one timeline merged from everything the club
knows about them, plus who may see which part of their file.

Three kinds of source feed the timeline:

  worked out   Milestones computed on the fly from the player's recorded
               matches (debut, 25/50/100/200/300 appearances, first goal,
               hat-tricks, personal best...), dated by the match they
               happened in. Nothing is stored, so a corrected gamertag link
               or a late-recorded match fixes them by itself.
  recorded     Contracts, squad announcements and EA squad changes, and
               Player of the Month awards.
  written      Entries staff add by hand (models.ServiceEntry).

Clearance is decided here, on the server, before anything reaches a
template -- a restricted entry never leaves this module:

  everyone         milestones, Player of the Month, commendations
  player + staff   contract and squad moves, warnings
  staff            notes -- and not the staff member they are about, like
                   coach notes

Contract moves the viewer may not see come back as one redacted row rather
than being dropped, so the page keeps its shape. Warnings and notes are
simply absent for anyone without clearance: a bar there would tell the
whole squad that somebody has been warned.

EA's match window is short and its history is erased with every new title
(see season.py), so milestones count what this site has recorded, not a
player's whole career.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

import roles

APPS_STEPS = (25, 50, 100, 200, 300)
GOALS_STEPS = (10, 25, 50, 100)
ASSISTS_STEPS = (10, 25, 50, 100)
MOTM_STEPS = (5, 10, 25)
CLEAN_SHEET_STEPS = (5, 10, 25)
HAT_TRICK_GOALS = 3
# A "personal best" out of two or three games is just the highest of a few.
MIN_RATED_FOR_BEST = 5

# Filter groups, in the order the chips show.
GROUPS = (
    ("milestone", "Milestones"),
    ("squad", "Squad moves"),
    ("honour", "Honors"),
    ("staff", "Staff entries"),
)

# Ribbon stripes per milestone family: (colour token, colour token, colour token).
_RIBBON_STRIPES = {
    "apps": ("accent", "text", "accent"),
    "goals": ("accent-2", "text", "accent-2"),
    "assists": ("text", "accent-2", "text"),
    "cs": ("accent-2", "accent", "accent-2"),
    "motm": ("gold", "gold", "gold"),
}


# --------------------------------------------------------------------------- #
# Who sees what
# --------------------------------------------------------------------------- #
def can_view(kind: str, *, is_self: bool, is_staff: bool) -> bool:
    if kind == "COMMENDATION":
        return True
    if kind == "WARNING":
        return is_self or is_staff
    if kind == "NOTE":
        return is_staff and not is_self
    return False


def can_add(*, is_self: bool, is_staff: bool) -> bool:
    """Staff write entries about other people -- nobody commends, warns or
    notes themselves, which also keeps a coach from filing a note they
    could not read back."""
    return is_staff and not is_self


def can_delete(kind: str, author_id: str | None, user: dict | None, *, is_self: bool) -> bool:
    """The entry's author, or management -- and only an entry the user is
    cleared to see."""
    if not user or not user.get("is_staff"):
        return False
    if not can_view(kind, is_self=is_self, is_staff=True):
        return False
    return bool(user.get("is_management")) or author_id == str(user.get("id"))


# --------------------------------------------------------------------------- #
# Milestones, computed from recorded matches
# --------------------------------------------------------------------------- #
def _played(row: dict) -> datetime | None:
    ts = row.get("played_at")
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None) if ts else None


def _entry(group: str, kind: str, at: datetime | None, title: str, detail: str = "", **extra) -> dict:
    return {"group": group, "kind": kind, "at": at, "title": title, "detail": detail,
            "redacted": False, "entry_id": None, "author": None, **extra}


def _vs(row: dict) -> str:
    score = ""
    if row.get("us_score") is not None and row.get("opp_score") is not None:
        score = f", {row['us_score']}–{row['opp_score']}"
    return f"vs {row.get('opp_name') or 'opponent'}{score}"


def compute_milestones(matches: list[dict]) -> list[dict]:
    """Service-record entries for the player's recorded matches, which must
    be in the order they were played (db.player_trend gives that)."""
    out: list[dict] = []
    apps = goals = assists = motm = clean = 0
    best = None
    rated = 0
    for m in matches:
        at = _played(m)
        where = _vs(m)
        apps += 1
        if apps == 1:
            out.append(_entry("milestone", "apps", at, "Debut", where))
        elif apps in APPS_STEPS:
            out.append(_entry("milestone", "apps", at, f"{apps} appearances", where))

        g, a = m.get("goals") or 0, m.get("assists") or 0
        before = goals
        goals += g
        if before == 0 and goals >= 1:
            out.append(_entry("milestone", "goals", at, "First goal", where))
        for step in GOALS_STEPS:
            if before < step <= goals:
                out.append(_entry("milestone", "goals", at, f"{step} goals", where))
        before = assists
        assists += a
        if before == 0 and assists >= 1:
            out.append(_entry("milestone", "assists", at, "First assist", where))
        for step in ASSISTS_STEPS:
            if before < step <= assists:
                out.append(_entry("milestone", "assists", at, f"{step} assists", where))
        if g >= HAT_TRICK_GOALS:
            out.append(_entry("milestone", "goals", at, "Hat-trick" if g == 3 else f"{g} goals in a match",
                              where))

        if m.get("mom"):
            motm += 1
            if motm == 1:
                out.append(_entry("milestone", "motm", at, "First Man of the Match", where))
            elif motm in MOTM_STEPS:
                out.append(_entry("milestone", "motm", at, f"{motm} Man of the Match awards", where))

        # Only a goalkeeper or a defender keeps a clean sheet in EA's eyes
        # (see db.record_matches), but the position is checked here too so
        # a stray flag on anybody else is not credited.
        if m.get("clean_sheet") and (m.get("pos") or "") in ("goalkeeper", "defender"):
            clean += 1
            if clean in CLEAN_SHEET_STEPS:
                out.append(_entry("milestone", "cs", at, f"{clean} clean sheets", where))

        rating = m.get("rating")
        if rating:
            rated += 1
            if best is None or rating > best[0]:
                best = (rating, at, where)
    if best and rated >= MIN_RATED_FOR_BEST:
        out.append(_entry("milestone", "rating", best[1], f"Personal best rating, {best[0]:.1f}", best[2]))
    return out


def career_totals(matches: list[dict]) -> dict:
    """Headline numbers across every recorded match."""
    rated = [m["rating"] for m in matches if m.get("rating")]
    return {
        "apps": len(matches),
        "goals": sum(m.get("goals") or 0 for m in matches),
        "assists": sum(m.get("assists") or 0 for m in matches),
        "motm": sum(1 for m in matches if m.get("mom")),
        "clean_sheets": sum(1 for m in matches if m.get("clean_sheet")
                            and (m.get("pos") or "") in ("goalkeeper", "defender")),
        "rating": round(sum(rated) / len(rated), 1) if rated else None,
        "best": max(rated) if rated else None,
    }


def career_months(matches: list[dict]) -> list[dict]:
    """Recorded matches grouped by month, newest first. EA's history is
    erased with each new title, so months are the finest honest grouping
    of "seasons" the data supports."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for m in matches:
        at = _played(m)
        buckets[at.strftime("%Y-%m") if at else "undated"].append(m)
    rows = []
    for key, ms in buckets.items():
        t = career_totals(ms)
        t["key"] = key
        t["label"] = datetime.strptime(key, "%Y-%m").strftime("%B %Y") if key != "undated" else "Undated"
        rows.append(t)
    rows.sort(key=lambda r: r["key"], reverse=True)
    return rows


# --------------------------------------------------------------------------- #
# Ribbons
# --------------------------------------------------------------------------- #
def ribbons(honours: list, potm_months: list[str]) -> list[dict]:
    """The ribbon rack on the ID card: one ribbon per recognition milestone
    reached (recognition.MILESTONES) and per Player of the Month won."""
    out = [{"label": f"Player of the Month, {m}", "stripes": _RIBBON_STRIPES["motm"], "potm": True}
           for m in potm_months]
    for h in honours:
        family = h.key.split("-")[0]
        out.append({"label": h.label, "stripes": _RIBBON_STRIPES.get(family, _RIBBON_STRIPES["apps"]),
                    "potm": False})
    return out


# --------------------------------------------------------------------------- #
# The timeline
# --------------------------------------------------------------------------- #
def _contract_entries(contracts: list) -> list[dict]:
    out = []
    for c in contracts:
        role = " / ".join(x for x in (c.position, c.secondary_position) if x)
        detail = ", ".join(x for x in (roles.status_label(c.squad_status), role) if x)
        out.append(_entry("squad", "contract", c.starts_at, "Signed a contract", detail))
        if c.ended_at:
            out.append(_entry("squad", "contract", c.ended_at, "Contract ended", detail))
    return out


def _move_entries(moves: list) -> list[dict]:
    out = []
    for m in moves:
        if m.kind == "offer":
            title = "Offered a contract" + (f" ({m.position})" if m.position else "")
        elif m.kind == "staff_offer":
            title = f"Offered the {m.position} role"
        elif m.kind == "renewal":
            title = "Offered a renewal"
        else:
            title = "Left the club"
        tail = {"accepted": "accepted", "declined": "declined"}.get(m.response or "", "")
        if m.confirmed_at:
            tail = f"{tail}, confirmed" if tail else "confirmed"
        out.append(_entry("squad", "move", m.announced_at, title, tail.capitalize()))
    return out


def _ea_entries(ea_moves: list[dict]) -> list[dict]:
    out = []
    for m in ea_moves:
        at = datetime.fromtimestamp(m["moved_at"], tz=timezone.utc).replace(tzinfo=None)
        out.append(_entry("squad", "move", at,
                          "Joined the EA club" if m["move"] == "joined" else "Left the EA club"))
    return out


def _written_entries(entries: list, *, is_self: bool, is_staff: bool) -> list[dict]:
    out = []
    for e in entries:
        if not can_view(e.kind, is_self=is_self, is_staff=is_staff):
            continue
        group = "honour" if e.kind == "COMMENDATION" else "staff"
        out.append(_entry(group, e.kind.lower(), e.occurred_at, e.kind.capitalize(), e.body,
                          entry_id=e.id, author=e.author_name, author_id=e.author_discord_id))
    return out


def build_timeline(*, matches: list[dict], potm: list, contracts: list, moves: list,
                   ea_moves: list[dict], written: list, is_self: bool, is_staff: bool) -> list[dict]:
    """The merged timeline, newest first. `contracts`, `moves` and
    `ea_moves` are only read for the player and the staff; anybody else gets
    a single redacted row in their place. Undated entries sort last."""
    see_private = is_self or is_staff
    items = compute_milestones(matches)
    items += [_entry("honour", "potm", a.awarded_at, "Player of the Month",
                     f"{datetime.strptime(a.month, '%Y-%m').strftime('%B %Y')}, {a.votes} votes")
              for a in potm]
    items += _written_entries(written, is_self=is_self, is_staff=is_staff)
    if see_private:
        items += _contract_entries(contracts) + _move_entries(moves) + _ea_entries(ea_moves)
    items.sort(key=lambda i: (i["at"] is not None, i["at"] or datetime.min), reverse=True)
    if not see_private:
        items.append({**_entry("squad", "contract", None, ""), "redacted": True,
                      "clearance": "Player & staff", "what": "Contract and squad moves"})
    return items


def groups_present(timeline: list[dict]) -> list[tuple[str, str]]:
    """The filter chips worth showing: a group with nothing in it is left out."""
    have = {i["group"] for i in timeline}
    return [(key, label) for key, label in GROUPS if key in have]
