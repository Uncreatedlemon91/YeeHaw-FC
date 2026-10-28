import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { coverUrl, listArticles } from "@/lib/news";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/news-rules";
import { hasPerm } from "@/lib/permissions";
import { fmtDate } from "@/lib/time";
import type { ArticleCategory } from "@prisma/client";
import { TabLinks } from "@/components/tab-links";

export const metadata = { title: "News" };
export const dynamic = "force-dynamic";

const PAGE = 12;

// News: staff-written articles and the 48-hour roundup, newest first. Public;
// staff also see drafts and get the "Write an article" button.
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; category?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const staff = hasPerm(user?.perms, "STAFF");
  const category = CATEGORIES.find((c) => c === sp.category) as ArticleCategory | undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { items, total } = await listArticles({ includeDrafts: staff, category, skip: (page - 1) * PAGE, take: PAGE });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number, c = category) => `/news?${new URLSearchParams({ ...(c ? { category: c } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");

  return (
    <Container>
      <PageHeader
        eyebrow="Club"
        title="News"
        description="Match reports, transfers and the 48-hour roundup."
        actions={staff && <Button asChild><Link href="/news/new">Write an article</Link></Button>}
      />
      <TabLinks
        label="News categories"
        items={[{ href: "/news", label: "All", active: !category }, ...CATEGORIES.map((c) => ({ href: href(1, c), label: CATEGORY_LABEL[c], active: c === category }))]}
      />
      {items.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-muted-foreground">Nothing here yet.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/news/${a.slug}`} className="group block h-full overflow-hidden rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {coverUrl(a.coverThumb) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl(a.coverThumb)!} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <div className="pitch-glow aspect-[16/9] w-full" aria-hidden />
                )}
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{CATEGORY_LABEL[a.category]}</Badge>
                    {!a.published && <Badge variant="accent">Draft</Badge>}
                    {a.publishedAt && <span>{fmtDate(a.publishedAt)}</span>}
                  </div>
                  <h2 className="font-display text-lg font-bold leading-snug group-hover:underline">{a.title}</h2>
                  {a.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{a.summary}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-accent underline underline-offset-2">Newer</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="text-accent underline underline-offset-2">Older</Link> : <span />}
        </nav>
      )}
    </Container>
  );
}
