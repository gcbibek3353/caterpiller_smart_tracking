import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyName?: string | null;
  phone?: string | null;
  image?: string | null;
};

/** Hono generics for the whole app. Import this into every route file. */
export type AppEnv = {
  Variables: {
    user: SessionUser;
    sessionId: string;
    validJson: unknown;
    validQuery: unknown;
    validParam: unknown;
  };
};
