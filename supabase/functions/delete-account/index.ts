// Delete the account: every copy, then the user. docs/ACCOUNTS.md.
//
// This is the one operation that needs the service role, because deleting
// an auth user is an admin action. So it lives here, in a function whose
// environment holds that key, and never in the app — SPEC's rule that no
// secret ships in the client. The caller proves who they are with their
// own session token; the function acts only on that user, never on an id
// the caller names.
//
// Deletion on request is one of the duties of holding this data at all,
// so it is immediate and total: the rows go (the foreign key would cascade
// them anyway; deleting first makes the order explicit), then the user.
// Nothing is soft-deleted and nothing is retained.

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return new Response("unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return new Response("misconfigured", { status: 500 });

  // who is asking — resolved from THEIR token, with the anon key, so the
  // service role is never used to decide identity
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !user) return new Response("unauthorized", { status: 401 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: rowsErr } = await admin.from("copies").delete().eq("user_id", user.id);
  if (rowsErr) return new Response("failed", { status: 500 });

  const { error: userErr } = await admin.auth.admin.deleteUser(user.id);
  if (userErr) return new Response("failed", { status: 500 });

  return new Response(null, { status: 204 });
});
