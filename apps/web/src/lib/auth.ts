import { createAuth } from "@kawabunga/auth";

export const { handlers, signIn, signOut, auth } = createAuth({
  pages: { signIn: "/" },
});
