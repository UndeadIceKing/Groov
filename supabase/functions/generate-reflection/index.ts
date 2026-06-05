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
    const period: 'weekly' | 'monthly' = body.period === 'monthly' ? 'monthly' : 'weekly'
    const days = period === 'monthly' ? 30 : 7

    // Prefer the client-supplied accountCreatedAt (derived from actual first usage),
    // fall back to Supabase auth created_at only if not provided.
    const accountCreatedStr: string = body.accountCreatedAt
      ?? toDateOnly(user.created_at)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toDateOnly(today.toISOString())

    const accountCreatedDate = localDate(accountCreatedStr)

    // Effective period start: requested window capped at account creation
    const requestedStartDate = new Date(today)
    requestedStartDate.setDate(requestedStartDate.getDate() - days + 1)
    const effectiveStartDate = requestedStartDate > accountCreatedDate ? requestedStartDate : accountCreatedDate
    const periodStart = toDateOnly(effectiveStartDate.toISOString())

    // Account-level active days in this period
    const msPerDay = 1000 * 60 * 60 * 24
    const accountActiveDays = Math.round((today.getTime() - effectiveStartDate.getTime()) / msPerDay) + 1

    // Return cached reflection for this period_start if it exists
    const { data: cached } = await supabase
      .from('ai_reflections')
      .select('message, generated_at')
      .eq('user_id', user.id)
      .eq('period', period)
      .eq('period_start', periodStart)
      .maybeSingle()

    if (cached?.message) {
      return new Response(
        JSON.stringify({ message: cached.message, cached: true, generatedAt: cached.generated_at }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch habits with their individual creation dates + completions for the active period
    const [{ data: habits }, { data: completionRows }] = await Promise.all([
      supabase.from('habits').select('id, name, icon, volume_goal, created_at').eq('user_id', user.id),
      supabase
        .from('completions')
        .select('date, habit_id, count')
        .eq('user_id', user.id)
        .gte('date', periodStart)
        .lte('date', todayStr),
    ])

    if (!habits?.length) {
      return new Response(
        JSON.stringify({ message: null, reason: 'no_habits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build completions lookup
    const completions: Record<string, Record<string, number>> = {}
    for (const row of completionRows ?? []) {
      if (!completions[row.date]) completions[row.date] = {}
      completions[row.date][row.habit_id] = row.count
    }

    // Per-habit stats — each habit uses its own creation date as its floor
    const habitStats = habits.map((h) => {
      const habitCreatedStr = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
      const habitCreatedDate = localDate(habitCreatedStr)
      // Habit's active window starts at whichever is latest: period start or habit creation
      const habitStartDate = habitCreatedDate > effectiveStartDate ? habitCreatedDate : effectiveStartDate
      const habitStartStr = toDateOnly(habitStartDate.toISOString())
      const habitActiveDays = Math.round((today.getTime() - habitStartDate.getTime()) / msPerDay) + 1

      let completedDays = 0
      for (let i = 0; i < habitActiveDays; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = toDateOnly(d.toISOString())
        if (((completions[dateStr] ?? {})[h.id] ?? 0) >= h.volume_goal) completedDays++
      }

      return {
        name: h.name,
        icon: h.icon ?? '',
        createdStr: habitCreatedStr,
        completedDays,
        activeDays: habitActiveDays,
        rate: Math.round((completedDays / habitActiveDays) * 100),
        isNew: habitCreatedStr > periodStart,
      }
    })

    // Perfect days: all habits that existed on a given day were completed
    let perfectDays = 0
    for (let i = 0; i < accountActiveDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = toDateOnly(d.toISOString())
      const dayComps = completions[dateStr] ?? {}
      // Only consider habits that were active on this date
      const activeOnDay = habits.filter(h => {
        const hCreated = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
        return dateStr >= hCreated
      })
      if (activeOnDay.length > 0 && activeOnDay.every((h) => (dayComps[h.id] ?? 0) >= h.volume_goal)) {
        perfectDays++
      }
    }

    const best = [...habitStats].sort((a, b) => b.rate - a.rate)[0]
    const worst = [...habitStats].sort((a, b) => a.rate - b.rate)[0]

    const accountAgeLine = accountActiveDays < days
      ? `Note: Account created ${accountCreatedStr} — only ${accountActiveDays} active day${accountActiveDays !== 1 ? 's' : ''} in this period (not the full ${days}). Some habits may have even fewer active days — see per-habit counts below.`
      : `Account active since: ${accountCreatedStr}`

    const prompt = `You are a warm, insightful habit coach. Write a ${period} reflection summary (3–5 sentences) for a user based on the data below. Be specific and data-driven. Highlight the standout habit, address the one that needs attention, and give one concrete actionable tip. End on an encouraging note.

IMPORTANT: Each habit shows its own active days since it was created. Use each habit's own denominator — never compare completedDays against the full ${days}-day period if the habit was created more recently. Do not reference days before the account or any habit was created.

Period: ${periodStart} to ${todayStr}
${accountAgeLine}
Perfect days (all active habits done): ${perfectDays}/${accountActiveDays}

Habits (completions / days that habit was active):
${habitStats.map((h) => {
  const newTag = h.isNew ? ` — new habit, active since ${h.createdStr}` : ''
  return `  • ${h.icon} ${h.name}: ${h.completedDays}/${h.activeDays} days (${h.rate}%)${newTag}`
}).join('\n')}

Most consistent: ${best.icon} ${best.name} at ${best.rate}% (${best.completedDays}/${best.activeDays} days)
Needs attention: ${worst.icon} ${worst.name} at ${worst.rate}% (${worst.completedDays}/${worst.activeDays} days)

Write the reflection:`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const aiResponse = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const message =
      aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''
    const generatedAt = new Date().toISOString()

    await supabase.from('ai_reflections').upsert(
      { user_id: user.id, period, period_start: periodStart, period_end: todayStr, message },
      { onConflict: 'user_id,period,period_start' }
    )

    return new Response(
      JSON.stringify({ message, cached: false, generatedAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('generate-reflection error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
