// The public About section. To add a page: create app/about/<slug>/page.tsx
// and add one line here. The nav dropdown, the mobile menu, the section's tab
// strip and the /about landing cards all read this list.
export type AboutPage = { href: string; label: string; blurb: string };

export const ABOUT_PAGES: readonly AboutPage[] = [
  { href: "/about/ranks", label: "Ranks", blurb: "The rank ladder from Recruit to Commander, and what it takes to climb each step." },
  { href: "/about/billets", label: "Billets", blurb: "The order of battle: every squad, its slots, and the roles and training behind them." },
];
