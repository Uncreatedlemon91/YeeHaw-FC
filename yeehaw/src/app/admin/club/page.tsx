import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/club-profile";
import { ClubForm } from "./club-form";

export const metadata = { title: "Club profile" };
export const dynamic = "force-dynamic";

export default async function AdminClub() {
  const profile = await getProfile();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Club profile</CardTitle>
          <CardDescription>What the public Club page says about the club. Anyone can read it, signed in or not.</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/club">View Club page</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ClubForm initial={profile} />
      </CardContent>
    </Card>
  );
}
