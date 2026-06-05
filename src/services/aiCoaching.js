import { supabase } from '../utils/supabase';

async function readFunctionError(error) {
  let detail = error.message;
  try {
    const body = await error.context?.json?.();
    if (body?.error) detail = body.error;
  } catch {}
  return detail;
}

export async function fetchDailyNudge(accountCreatedAt, displayName, excludeDate) {
  const realToday = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.functions.invoke('generate-nudge', {
    body: {
      accountCreatedAt: accountCreatedAt ?? null,
      displayName: displayName || null,
      excludeDate: excludeDate ?? realToday,
    },
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] nudge:', detail);
    throw new Error(detail);
  }
  return data;
}

export async function fetchReflection(period = 'weekly', accountCreatedAt, displayName, excludeDate) {
  const realToday = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.functions.invoke('generate-reflection', {
    body: {
      period,
      accountCreatedAt: accountCreatedAt ?? null,
      displayName: displayName || null,
      excludeDate: excludeDate ?? realToday,
    },
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] reflection:', detail);
    throw new Error(detail);
  }
  return data;
}
