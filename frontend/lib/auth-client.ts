"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { API_URL } from "./api";
import type { Role } from "./types";

/**
 * better-auth talks to the backend directly at :4000. The session cookie is set
 * on `localhost`, and cookies ignore port, so :3000 sends it back in dev.
 * On separate deployed domains this needs `crossSubDomainCookies` or an
 * `/api` rewrite — that's the trap A11 budgets two hours for.
 *
 * Additional fields are declared here rather than inferred from the server
 * types, because the team chose duplicated contracts over a shared package.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields({
      user: {
        // input:false mirrors the server — role is assigned by the backend,
        // never sent from here, so it must not appear in the signUp payload.
        role: { type: "string", input: false },
        companyName: { type: "string", required: false },
        phone: { type: "string", required: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyName?: string | null;
  phone?: string | null;
  image?: string | null;
};
