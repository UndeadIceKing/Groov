import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toDateOnly(isoStr: string): string {
  return isoStr.split('T')[0]
}

function localDate(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  return d
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    // Prefer the client-supplied accountCreatedAt (derived from actual first usage),
    // fall back to Supabase auth created_at only if not provided.
    const accountCreatedStr: string = body.accountCreatedAt
      ?? toDateOnly(user.created_at)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toDateOnly(today.toISOString())

    // Return today's cached nudge if it exists
    const { data: cached } = await supabase
      .from('ai_nudges')
      .select('message')
      .eq('user_id', user.id)
      .eq('date', todayStr)
      .maybeSingle()

    if (cached?.message) {
      return new Response(
        JSON.stringify({ message: cached.message, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountCreatedDate = localDate(accountCreatedStr)

    // Global query window: up to 30 days back, no earlier than account creation
    const rawCutoff = new Date(today)
    rawCutoff.setDate(rawCutoff.getDate() - 29)
    const globalCutoffDate = rawCutoff > accountCreatedDate ? rawCutoff : accountCreatedDate
    const globalCutoffStr = toDateOnly(globalCutoffDate.toISOString())

    // Account-level active days (for overall streak cap)
    const msPerDay = 1000 * 60 * 60 * 24
    const accountActiveDays = Math.round((today.getTime() - accountCreatedDate.getTime()) / msPerDay) + 1

    const [{ data: habits }, { data: completionRows }] = await Promise.all([
      supabase.from('habits').select('id, name, icon, volume_goal, created_at').eq('user_id', user.id),
      supabase
        .from('completions')
        .select('date, habit_id, count')
        .eq('user_id', user.id)
        .gte('date', globalCutoffStr),
    ])

    if (!habits?.length) {
      return new Response(
        JSON.stringify({ message: null, reason: 'no_habits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build completions lookup: date -> habitId -> count
    const completions: Record<string, Record<string, number>> = {}
    for (const row of completionRows ?? []) {
      if (!completions[row.date]) completions[row.date] = {}
      completions[row.date][row.habit_id] = row.count
    }

    // Per-habit stats — each habit uses its own creation date as the floor
    const habitStats = habits.map((h) => {
      const habitCreatedStr = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
      const habitCreatedDate = localDate(habitCreatedStr)
      // Habit's active window starts at whichever is latest: global cutoff or habit creation
      const habitStartDate = habitCreatedDate > globalCutoffDate ? habitCreatedDate : globalCutoffDate
      const habitStartStr = toDateOnly(habitStartDate.toISOString())
      const habitActiveDays = Math.round((today.getTime() - habitStartDate.getTime()) / msPerDay) + 1

      // Streak: count back from today, stopping at habit start
      let streak = 0
      const d = new Date(today)
      while (streak < habitActiveDays) {
        const dateStr = toDateOnly(d.toISOString())
        if (((completions[dateStr] ?? {})[h.id] ?? 0) >= h.volume_goal) {
          streak++
          d.setDate(d.getDate() - 1)
        } else break
      }

      const completedDays = Object.entries(completions)
        .filter(([date]) => date >= habitStartStr)
        .filter(([, day]) => (day[h.id] ?? 0) >= h.volume_goal)
        .length

      return {
        name: h.name,
        icon: h.icon ?? '',
        createdStr: habitCreatedStr,
        streak,
        completedDays,
        activeDays: habitActiveDays,
        rate: Math.round((completedDays / habitActiveDays) * 100),
      }
    })

    // Overall streak (all habits done each day), capped at account active days
    let overallStreak = 0
    const od = new Date(today)
    while (overallStreak < accountActiveDays) {
      const dateStr = toDateOnly(od.toISOString())
      const day = completions[dateStr] ?? {}
      // Only check habits that existed on this date
      const activeHabits = habits.filter(h => {
        const hCreated = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
        return dateStr >= hCreated
      })
      if (activeHabits.length > 0 && activeHabits.every((h) => (day[h.id] ?? 0) >= h.volume_goal)) {
        overallStreak++
        od.setDate(od.getDate() - 1)
      } else break
    }

    const best = [...habitStats].sort((a, b) => b.rate - a.rate)[0]
    const worst = [...habitStats].sort((a, b) => a.rate - b.rate)[0]

    const accountAgeLine = accountActiveDays === 1
      ? `Account active since: ${accountCreatedStr} (first day — be encouraging and welcoming)`
      : `Account active since: ${accountCreatedStr} (${accountActiveDays} day${accountActiveDays !== 1 ? 's' : ''})`

    const prompt = `You are a warm, encouraging habit coach. Based on the user's data below, write a concise daily nudge (2–3 sentences). Acknowledge what they're doing well using specific numbers, then give ONE actionable tip for the habit they struggle with most. Avoid generic openers like "Great job" or "Keep it up".

IMPORTANT: Each habit shows its own active days since it was created. Use each habit's own denominator for its completion rate — never assume all habits have been active for the same number of days.

Today: ${todayStr}
${accountAgeLine}
Overall streak: ${overallStreak} day${overallStreak !== 1 ? 's' : ''}
Strongest habit: ${best.icon} ${best.name} — ${best.streak}-day streak, ${best.completedDays}/${best.activeDays} active days (${best.rate}%)
Needs work: ${worst.icon} ${worst.name} — ${worst.streak}-day streak, ${worst.completedDays}/${worst.activeDays} active days (${worst.rate}%)
All habits:
${habitStats.map((h) => `  • ${h.icon} ${h.name}: ${h.streak}-day streak, ${h.completedDays}/${h.activeDays} days (${h.rate}%) — active since ${h.createdStr}`).join('\n')}

Write the nudge:`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const aiResponse = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })

    const message =
      aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''

    await supabase.from('ai_nudges').upsert({ user_id: user.id, date: todayStr, message })

    return new Response(
      JSON.stringify({ message, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('generate-nudge error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
