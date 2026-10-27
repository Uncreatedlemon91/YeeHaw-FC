import type { Perm } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      slug: string;
      discordId: string;
      name: string;
      image: string | null;
      perms: Perm[];
      inGuild: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    slug?: string;
    discordId?: string;
    perms?: Perm[];
    inGuild?: boolean;
    rolesAt?: number;
  }
}
