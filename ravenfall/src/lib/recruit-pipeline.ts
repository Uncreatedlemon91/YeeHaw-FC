import type { RecruitStage } from "@prisma/client";
import { BASIC_TRAINING_QUAL, RECRUIT_RANK } from "@/config/unit";
import { prisma } from "./prisma";

// The recruit pipeline, from application to first op. Before the decision
// the stage is the recruiter's (RecruitmentApplication.stage); after it, a
// Recruit's progress is read from their file: an RSVP to a recruit night or
// training (booked), the basic training qualification (trained) and an op
// attended (deployed). Nothing to keep in step by hand.

export type Stage = RecruitStage | "ENLISTED" | "BOOKED" | "TRAINED" | "DEPLOYED";

export const STAGE_LABEL: Record<Stage, string> = {
  APPLIED: "Applied",
  CONTACTED: "Contacted",
  INTERVIEW_SET: "Interview set",
  INTERVIEWED: "Interviewed",
  ENLISTED: "Enlisted",
  BOOKED: "Training booked",
  TRAINED: "Trained",
  DEPLOYED: "First op",
};

export const APPLICANT_STAGES: RecruitStage[] = ["APPLIED", "CONTACTED", "INTERVIEW_SET", "INTERVIEWED"];
export const RECRUIT_STAGES = ["ENLISTED", "BOOKED", "TRAINED", "DEPLOYED"] as const;
export type RecruitProgressStage = (typeof RECRUIT_STAGES)[number];

/** What the recruiter should do next at each applicant stage. */
export const NEXT_ACTION: Record<RecruitStage, string> = {
  APPLIED: "Reach out on Discord",
  CONTACTED: "Set an interview",
  INTERVIEW_SET: "Hold the interview",
  INTERVIEWED: "Approve or deny",
};

const DAY = 864e5;
/** Days at one stage before a card is flagged as going cold. */
export const COLD_DAYS: Partial<Record<Stage, number>> = {
  APPLIED: 2,
  CONTACTED: 4,
  INTERVIEWED: 2,
  ENLISTED: 10,
  BOOKED: 21,
  TRAINED: 21,
};

export function isCold(stage: Stage, since: Date, now = new Date(), interviewAt?: Date | null): boolean {
  // An interview that has come and gone without being marked is cold too.
  if (stage === "INTERVIEW_SET") return !!interviewAt && interviewAt.getTime() < now.getTime() - DAY;
  const days = COLD_DAYS[stage];
  return days !== undefined && now.getTime() - since.getTime() > days * DAY;
}

export type RecruitProgress = {
  userId: string;
  stage: RecruitProgressStage;
  enlistedAt: Date | null;
  /** The upcoming event they've signed up for, if any. */
  booked: { id: string; title: string; startTime: Date } | null;
  trainedAt: Date | null;
  firstOpAt: Date | null;
  /** When they reached their current stage, for "going cold". */
  since: Date;
};

/** Progress for each Recruit (or the given members), from their file. */
export async function recruitProgress(opts: { userIds?: string[] } = {}, now = new Date()): Promise<RecruitProgress[]> {
  const users = await prisma.user.findMany({
    where: opts.userIds ? { id: { in: opts.userIds } } : { status: "ACTIVE", rank: RECRUIT_RANK },
    select: {
      id: true,
      enlistedAt: true,
      createdAt: true,
      qualifications: { where: { qualification: { slug: BASIC_TRAINING_QUAL } }, select: { awardedAt: true } },
      attendances: {
        where: { status: "ATTENDING" },
        select: { event: { select: { id: true, title: true, type: true, startTime: true, openToRecruits: true } } },
      },
    },
  });
  return users.map((u) => {
    const events = u.attendances.map((a) => a.event).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const booked = events.find((e) => e.startTime >= now && (e.openToRecruits || e.type === "TRAINING")) ?? null;
    const firstOp = events.find((e) => e.startTime < now && e.type === "OP") ?? null;
    const trainedAt = u.qualifications[0]?.awardedAt ?? null;
    const enlistedAt = u.enlistedAt ?? u.createdAt;
    const stage: RecruitProgressStage = firstOp ? "DEPLOYED" : trainedAt ? "TRAINED" : booked ? "BOOKED" : "ENLISTED";
    const since = stage === "DEPLOYED" ? firstOp!.startTime : stage === "TRAINED" ? trainedAt! : enlistedAt;
    return {
      userId: u.id,
      stage,
      enlistedAt: u.enlistedAt,
      booked: booked && { id: booked.id, title: booked.title, startTime: booked.startTime },
      trainedAt,
      firstOpAt: firstOp?.startTime ?? null,
      since,
    };
  });
}

/** Upcoming events a recruit can sign up for: recruit nights and the like. */
export function recruitEvents(take = 5, now = new Date()) {
  return prisma.event.findMany({
    where: { openToRecruits: true, startTime: { gte: now } },
    orderBy: { startTime: "asc" },
    take,
  });
}
