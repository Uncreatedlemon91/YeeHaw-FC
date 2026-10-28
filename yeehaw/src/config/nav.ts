import type { Perm } from "@/lib/permissions";

// The site's navigation, in one place: the header, the mobile menu and the
// home page's shortcuts all read it. `perm` hides an item below that level
// (the page still checks for itself). `children` makes a dropdown; each child
// may carry its own `perm`, and a dropdown left with one visible child shows
// as a plain link to it (a guest sees "Fixtures", not a menu of one).
export type NavChild = { href: string; label: string; perm?: Perm };
export type NavItem = {
  href: string;
  label: string;
  perm?: Perm;
  children?: readonly NavChild[];
};

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/squad", label: "Squad" },
  { href: "/news", label: "News" },
  {
    href: "/club",
    label: "Club",
    children: [
      { href: "/club/stats", label: "Stats" },
      { href: "/club/league", label: "League table" },
    ],
  },
  {
    href: "/fixtures",
    label: "Matchday",
    children: [
      { href: "/fixtures", label: "Fixtures" },
      { href: "/training", label: "Training", perm: "MEMBER" },
      { href: "/availability", label: "Availability", perm: "MEMBER" },
      // Members read the board and the routine book; staff edit them there.
      { href: "/staff/tactics", label: "Tactics", perm: "MEMBER" },
      { href: "/staff/set-pieces", label: "Set pieces", perm: "MEMBER" },
    ],
  },
  {
    href: "/staff",
    label: "Staff",
    perm: "STAFF",
    children: [
      { href: "/fixtures/new", label: "Schedule event" },
      { href: "/fixtures/series", label: "Recurring events" },
      { href: "/staff/lineup", label: "Lineup" },
      { href: "/staff/recruitment", label: "Recruitment" },
    ],
  },
  {
    href: "/admin",
    label: "Admin",
    perm: "MANAGEMENT",
    children: [
      { href: "/admin/seasons", label: "Seasons & contracts" },
      { href: "/admin/discord", label: "Discord roles & channels" },
      { href: "/admin/club", label: "Club profile" },
    ],
  },
];
