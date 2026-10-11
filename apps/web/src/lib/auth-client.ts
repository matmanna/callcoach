import { createAuthClient } from "better-auth/react";

/** Better Auth client. Same origin; the API mounts the handler at /api/auth/*. */
export const authClient = createAuthClient({ basePath: "/api/auth" });

export async function signUpCoordinator(input: { email: string; password: string; name: string }) {
  // user_type is an additional field on the server; public sign-up accepts only "coordinator".
  const res = await authClient.signUp.email({ ...input, user_type: "coordinator" } as Parameters<typeof authClient.signUp.email>[0]);
  if (res.error) throw new Error(res.error.message ?? "Sign-up failed");
}

export async function signIn(email: string, password: string) {
  const res = await authClient.signIn.email({ email, password });
  if (res.error) throw new Error(res.error.message ?? "Sign-in failed");
}

export async function signOut() {
  await authClient.signOut();
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
  if (res.error) throw new Error(res.error.message ?? "Password change failed");
}
