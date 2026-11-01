import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Clean the URL in case it has trailing slashes or /rest/v1/ appended
const cleanedUrl = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const validUrl =
  cleanedUrl.startsWith('http://') || cleanedUrl.startsWith('https://')
    ? cleanedUrl
    : 'https://placeholder.supabase.co';

const validKey = rawKey.trim() || 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl !== 'https://your-project.supabase.co' &&
  !rawUrl.includes('placeholder')
);

export const supabase = createClient(validUrl, validKey);

export default supabase;
