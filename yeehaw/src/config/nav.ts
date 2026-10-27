import type { Perm } from "@/lib/permissions";

// The site's navigation, in one place: the header, the mobile menu and the
// home page's shortcuts all read it. `perm` hides an item below that level
// (the page still checks for itself). `children` makes a dropdown.
export type NavItem = {
  href: string;
  label: string;
  perm?: Perm;
  children?: readonly { href: string; label: string }[];
};

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/squad", label: "Squad" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/news", label: "News" },
  {
    href: "/club",
    label: "Club",
    children: [
      { href: "/club/stats", label: "Stats" },
      { href: "/club/league", label: "League table" },
    ],
  },
  { href: "/training", label: "Training", perm: "MEMBER" },
  { href: "/availability", label: "Availability", perm: "MEMBER" },
  {
    href: "/staff",
    label: "Staff",
    perm: "STAFF",
    children: [
      { href: "/staff/tactics", label: "Tactics" },
      { href: "/staff/set-pieces", label: "Set pieces" },
      { href: "/staff/recruitment", label: "Recruitment" },
      { href: "/staff/lineup", label: "Lineup" },
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
