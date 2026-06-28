import { supabase } from '../utils/supabase';

function stripEmDashes(text) {
  if (!text) return text;
  return text.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, ', ');
}

async function readFunctionError(error) {
  let detail = error.message;
  try {
    const body = await error.context?.json?.();
    if (body?.error) detail = body.error;
  } catch {}
  return detail;
}

// Explicitly attaches the current session token so the Edge Function always
// receives a valid user JWT, regardless of when the SDK propagated the session
// into the functions client's internal header state.
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchDailyNudge(accountCreatedAt, displayName, excludeDate) {
  const realToday = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.functions.invoke('generate-nudge', {
    body: {
      accountCreatedAt: accountCreatedAt || null,
      displayName: displayName || null,
      excludeDate: excludeDate ?? realToday,
    },
    headers: await authHeaders(),
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] nudge:', detail);
    throw new Error(detail);
  }
  if (data?.message) data.message = stripEmDashes(data.message);
  return data;
}

export async function fetchReflection(period = 'weekly', accountCreatedAt, displayName, excludeDate) {
  const realToday = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.functions.invoke('generate-reflection', {
    body: {
      period,
      accountCreatedAt: accountCreatedAt || null,
      displayName: displayName || null,
      excludeDate: excludeDate ?? realToday,
    },
    headers: await authHeaders(),
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] reflection:', detail);
    throw new Error(detail);
  }
  if (data?.message) data.message = stripEmDashes(data.message);
  return data;
}
