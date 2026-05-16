import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// ─── 타입 (관리자 수동 매칭 화면과 동일한 필드 기준) ─────────────────────────

interface Profile {
  id: string
  phone?: string | null
  gender: string | null
  age: number | null
  regions: string[] | null
  religion: string | null
  smoking: string | null
  drinking: string | null
  interests: string[] | null
  approval_status: string | null
  deleted_at?: string | null
}

// ─── 전화번호·차단 (UsersPage.tsx 와 동일) ───────────────────────────────────

function phoneMatchKey(phone?: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('82') && d.length >= 10) return `0${d.slice(2)}`
  return d
}

function phoneKeyVariants(phone?: string | null): string[] {
  if (!phone?.trim()) return []
  const t = phone.trim()
  const digits = t.replace(/\D/g, '')
  const variants = new Set<string>([t])
  if (digits) variants.add(digits)
  const local0 = phoneMatchKey(phone)
  if (local0) {
    variants.add(local0)
    if (local0.startsWith('0') && local0.length === 11) {
      variants.add(`${local0.slice(0, 3)}-${local0.slice(3, 7)}-${local0.slice(7)}`)
    }
  }
  return [...variants].filter(Boolean)
}

function getRegionOverlapScore(a: Profile, b: Profile): number {
  const aRegions = a.regions ?? []
  const bRegions = b.regions ?? []
  return aRegions.filter((r) => bRegions.includes(r)).length
}

function getArrayOverlapScore(aArr?: string[] | null, bArr?: string[] | null): number {
  if (!aArr || !bArr) return 0
  return aArr.filter((item) => bArr.includes(item)).length
}

/** 관리자 ManualMatchModal 의 sortCandidates 와 동일한 우선순위 */
function sortCandidates(userA: Profile, candidates: Profile[]): Profile[] {
  return [...candidates].sort((a, b) => {
    const regionA = getRegionOverlapScore(userA, a)
    const regionB = getRegionOverlapScore(userA, b)
    if (regionB !== regionA) return regionB - regionA

    const ageDiffA = Math.abs((userA.age ?? 0) - (a.age ?? 0))
    const ageDiffB = Math.abs((userA.age ?? 0) - (b.age ?? 0))
    if (ageDiffA !== ageDiffB) return ageDiffA - ageDiffB

    const relA = userA.religion === a.religion ? 1 : 0
    const relB = userA.religion === b.religion ? 1 : 0
    if (relB !== relA) return relB - relA

    const intA = getArrayOverlapScore(userA.interests, a.interests)
    const intB = getArrayOverlapScore(userA.interests, b.interests)
    if (intB !== intA) return intB - intA

    const lifeA = (userA.smoking === a.smoking ? 1 : 0) + (userA.drinking === a.drinking ? 1 : 0)
    const lifeB = (userA.smoking === b.smoking ? 1 : 0) + (userA.drinking === b.drinking ? 1 : 0)
    return lifeB - lifeA
  })
}

async function fetchBlockedIdsForMatch(
  userId: string,
  userPhone: string | null | undefined,
  allProfiles: Profile[],
): Promise<Set<string>> {
  const phoneVariants = phoneKeyVariants(userPhone ?? undefined)
  const ids = new Set<string>()

  const byMe = await supabaseAdmin.from('blocked_contacts').select('phone').eq('owner_id', userId)
  if (byMe.error) throw new Error(`차단 목록 조회 실패: ${byMe.error.message}`)

  const blockedPhones = (byMe.data ?? []).map((r: { phone: string }) => r.phone)

  if (phoneVariants.length > 0) {
    const byOthers = await supabaseAdmin.from('blocked_contacts').select('owner_id').in('phone', phoneVariants)
    if (byOthers.error) throw new Error(`역차단 조회 실패: ${byOthers.error.message}`)
    for (const r of byOthers.data ?? []) {
      ids.add((r as { owner_id: string }).owner_id)
    }
  }

  const blockedKeys = new Set(blockedPhones.map((p) => phoneMatchKey(p)).filter(Boolean))
  for (const u of allProfiles) {
    const key = phoneMatchKey(u.phone)
    if (key && blockedKeys.has(key)) ids.add(u.id)
  }

  return ids
}

const PROFILE_SELECT =
  'id, phone, gender, age, regions, religion, smoking, drinking, interests, approval_status, deleted_at'

async function autoMatchForUser(userId: string, matchCount: number) {
  const { data: userA, error: userErr } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single<Profile>()

  if (userErr || !userA) {
    throw new Error(`유저를 찾을 수 없습니다: ${userId}`)
  }

  // 관리자 화면: 성별 없으면 이성 필터만 생략할 뿐 매칭 자체는 가능 — Edge 도 동일하게 허용

  const { data: existingIntros, error: introErr } = await supabaseAdmin
    .from('intros')
    .select('card_profile_id')
    .eq('receiver_id', userId)

  if (introErr) throw new Error(`기존 소개(intros) 조회 실패: ${introErr.message}`)

  const alreadyIntroducedIds = new Set(
    (existingIntros ?? []).map((row: { card_profile_id: string }) => row.card_profile_id),
  )

  const { data: allUsers, error: allErr } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('approval_status', 'approved')
    .is('deleted_at', null)

  if (allErr) throw new Error(`전체 유저 조회 실패: ${allErr.message}`)

  const allList = (allUsers ?? []) as Profile[]
  const blockedIds = await fetchBlockedIdsForMatch(userId, userA.phone, allList)

  const candidates: Profile[] = allList.filter((u) => {
    if (u.id === userId) return false
    if (alreadyIntroducedIds.has(u.id)) return false
    if (blockedIds.has(u.id)) return false
    if (userA.gender && u.gender && u.gender === userA.gender) return false
    return true
  })

  if (candidates.length === 0) {
    console.log(`[${userId}] 매칭 가능한 후보 없음`)
    return { matched: [] as { user_id: string }[] }
  }

  const sorted = sortCandidates(userA, candidates)
  const topN = sorted.slice(0, matchCount)

  const inserts = topN.map((card) => ({
    receiver_id: userId,
    card_profile_id: card.id,
    source: 'admin_manual' as const,
  }))

  const { error: insertErr } = await supabaseAdmin.from('intros').insert(inserts)

  if (insertErr) throw new Error(`소개(intros) 저장 실패: ${insertErr.message}`)

  console.log(`[${userId}] ${topN.length}명 admin_manual 소개 완료:`, topN.map((p) => p.id))

  return {
    matched: topN.map((p) => ({ user_id: p.id })),
  }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { user_id, count } = body

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id는 필수입니다.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const matchCount = Math.max(1, Math.min(Number(count) || 2, 10))

    const result = await autoMatchForUser(user_id, matchCount)

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auto-match] 오류:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
