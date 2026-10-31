// The three RSVP answers, shared by the site and the Discord buttons. Before
// an event an Attendance row holds one of them; the AAR replaces it.

export const RSVP_CHOICES = ["ATTENDING", "TENTATIVE", "ABSENT"] as const;
export type RsvpChoice = (typeof RSVP_CHOICES)[number];

/** The RSVP a stored attendance status represents, if any (AAR marks aren't RSVPs). */
export const rsvpOf = (s: string | null | undefined): RsvpChoice | null => ((RSVP_CHOICES as readonly string[]).includes(s ?? "") ? (s as RsvpChoice) : null);
