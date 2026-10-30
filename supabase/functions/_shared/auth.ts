import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface Caller {
  userId: string;
}

let admin: SupabaseClient | null = null;

/** Service-role client: server-side only, used for token verification and the quota RPC. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('supabase env missing');
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/**
 * Verifies the bearer token with Supabase Auth. The publishable (anon) key alone is NOT
 * accepted: it carries no user, so `getUser` fails. A client-supplied user id is never trusted.
 */
export async function authenticate(req: Request): Promise<Caller | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}
