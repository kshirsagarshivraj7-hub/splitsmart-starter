import { createClient } from '@supabase/supabase-js';

const rawUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://undgosiehqxmjwsgwgyd.supabase.co';

const rawKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_0-zl9BYlW_q0CymDJ1sTqw_N1IoDjH7';

// Clean the URL in case it has trailing slashes or /rest/v1/ appended
const cleanedUrl = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const validUrl =
  cleanedUrl.startsWith('http://') || cleanedUrl.startsWith('https://')
    ? cleanedUrl
    : 'https://undgosiehqxmjwsgwgyd.supabase.co';

const validKey = rawKey.trim() || 'sb_publishable_0-zl9BYlW_q0CymDJ1sTqw_N1IoDjH7';

export const isSupabaseConfigured = Boolean(
  validUrl &&
  validKey &&
  !validUrl.includes('placeholder')
);

export const supabase = createClient(validUrl, validKey);

export default supabase;
