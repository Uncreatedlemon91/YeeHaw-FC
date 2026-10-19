import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SignInButton } from "@/components/auth-buttons";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { APPLICATION_QUESTIONS, UNIT } from "@/config/unit";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { submitApplication } from "./actions";
import { REAPPLY_DAYS } from "./rules";

export const metadata = { title: "Enlist" };

export default async function Apply() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Container className="max-w-xl py-20 text-center">
        <PageHeader eyebrow="Recruitment" title={`Enlist with ${UNIT.name}`} className="block border-0" />
        <p className="text-sm text-muted-foreground">
          Applications are tied to your Discord account, so sign in first. We only read your username and your roles on
          our server.
        </p>
        <SignInButton callbackUrl="/apply" size="lg" className="mt-8" />
      </Container>
    );
  }

  if (hasPerm(user.perms, "OPERATOR")) {
    return (
      <Status icon={<CheckCircle2 className="size-10 text-success-fg" />} title="You're already enlisted">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Status>
    );
  }

  const latest = await prisma.recruitmentApplication.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (latest?.status === "PENDING") {
    return (
      <Status icon={<Clock className="size-10 text-accent" />} title="Application under review">
        <p className="text-sm text-muted-foreground">
          Submitted {fmt(latest.createdAt)}. Recruiters have been notified on Discord — you'll get a DM and new roles when
          a decision is made.
        </p>
      </Status>
    );
  }
  if (latest?.status === "APPROVED") {
    return (
      <Status icon={<CheckCircle2 className="size-10 text-success-fg" />} title="Approved — welcome aboard">
        <p className="text-sm text-muted-foreground">
          Your roles may take up to five minutes to reach the site. Sign out and back in to pick them up immediately.
        </p>
      </Status>
    );
  }
  const reapplyAt = latest ? new Date(latest.updatedAt.getTime() + REAPPLY_DAYS * 864e5) : null;
  if (latest?.status === "DENIED" && reapplyAt && reapplyAt > new Date()) {
    return (
      <Status icon={<XCircle className="size-10 text-destructive-fg" />} title="Application not accepted">
        <p className="text-sm text-muted-foreground">
          Thanks for your interest. You can apply again from {fmt(reapplyAt, "d MMM yyyy")}.
        </p>
      </Status>
    );
  }

  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Recruitment"
        title="Application"
        description={`Answer honestly — there are no wrong answers. Recruiters see this exactly as you write it.`}
      />
      {!user.inGuild && (
        <p className="mb-6 rounded border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          You don't appear to be in our Discord server yet. Join it before applying, or we won't be able to give you your
          roles when you're approved.
          {UNIT.discordInvite && (
            <>
              {" "}
              <a href={UNIT.discordInvite} className="underline">
                Join here
              </a>
              .
            </>
          )}
        </p>
      )}
      <Card>
        <CardContent className="py-6">
          <ActionForm action={submitApplication}>
            {APPLICATION_QUESTIONS.map((q) => (
              <Field
                key={q.key}
                label={q.label + (q.required ? "" : " (optional)")}
                htmlFor={q.key}
                help={"help" in q ? q.help : undefined}
              >
                {q.type === "textarea" ? (
                  <Textarea id={q.key} name={q.key} required={q.required} maxLength={q.max} />
                ) : q.type === "number" ? (
                  <Input id={q.key} name={q.key} type="number" min={13} max={99} required={q.required} className="w-28" />
                ) : (
                  <Input id={q.key} name={q.key} required={q.required} maxLength={"max" in q ? q.max : undefined} />
                )}
              </Field>
            ))}
            <SubmitButton variant="accent" size="lg" pendingText="Submitting…" className="self-start">
              Submit application
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}

function Status({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Container className="flex max-w-lg flex-col items-center gap-4 py-24 text-center">
      {icon}
      <h1 className="text-2xl font-bold uppercase">{title}</h1>
      {children}
    </Container>
  );
}
