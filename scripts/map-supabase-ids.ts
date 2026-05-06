/**
 * Maps Supabase UUIDs into the cleaned cigar JSON using brand+series+name as the match key.
 * Reads cigars_clean.json (cleaned format), fetches UUIDs from Supabase,
 * and outputs cigars_clean.json with the Supabase UUID in the id field.
 *
 * Usage: npx ts-node scripts/map-supabase-ids.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const JSON_PATH   = path.join(process.cwd(), 'scripts', 'cigars_clean.json')
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', 'cigars_clean.json')

function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

async function run() {
  // 1. Fetch all Supabase records keyed by brand+series+name
  console.log('Fetching records from Supabase...')
  let allRows: { id: string; brand: string | null; series: string | null; format: string | null }[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('cigar_catalog')
      .select('id, brand, series, format')
      .range(from, from + batchSize - 1)

    if (error) { console.error('Fetch error:', error); process.exit(1) }
    if (!data?.length) break
    allRows = allRows.concat(data)
    from += batchSize
    if (data.length < batchSize) break
  }

  console.log(`Fetched ${allRows.length} records from Supabase.`)

  // Build lookup: normalized "brand|series|format" -> uuid
  // Supabase "format" = vitola (e.g. "Robusto"); cleaned JSON "name" = same field
  const lookup = new Map<string, string>()
  for (const row of allRows) {
    const key = `${normalize(row.brand)}|${normalize(row.series)}|${normalize(row.format)}`
    lookup.set(key, row.id)
  }

  // 2. Load cleaned JSON
  let raw = readFileSync(JSON_PATH, 'utf-8').trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  /* Input shape from `scripts/data/cigars_clean.json`. Only the join-key
     fields are typed; the rest passes through via spread. */
  interface InputCigar { brand: string | null; series: string | null; name: string | null; [k: string]: unknown }
  const cigars = JSON.parse(raw) as InputCigar[]

  console.log(`Loaded ${cigars.length} cigars from JSON.`)

  let matched = 0
  let unmatched = 0

  const output = cigars.map((c) => {
    const key = `${normalize(c.brand)}|${normalize(c.series)}|${normalize(c.name)}`
    const uuid = lookup.get(key) ?? null

    if (uuid) matched++
    else unmatched++

    return { id: uuid, ...c }
  })

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2))

  console.log(`\nDone.`)
  console.log(`  Matched:   ${matched}`)
  console.log(`  Unmatched: ${unmatched}`)

  if (unmatched > 0) {
    console.log(`\nFirst 10 unmatched:`)
    output.filter((c) => !c.id).slice(0, 10).forEach((c) => {
      console.log(`  "${c.brand}" | "${c.series}" | "${c.name}"`)
    })
  }
}

run()
