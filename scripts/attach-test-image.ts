import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IMAGE_PATH = path.join(process.cwd(), '..', '..', '..', 'public', 'Cigar Images', '10829.png')

async function run() {
  // 1. Get the first cigar
  console.log('Fetching first cigar...')
  const { data: cigars, error: fetchError } = await supabase
    .from('cigar_catalog')
    .select('id, name, brand')
    .order('id', { ascending: true })
    .limit(1)

  if (fetchError || !cigars?.length) {
    console.error('Error fetching cigar:', fetchError)
    process.exit(1)
  }

  const cigar = cigars[0]
  console.log(`Found: ${cigar.brand} ${cigar.name} (id: ${cigar.id})`)

  // 2. Read image
  const imageBuffer = readFileSync(IMAGE_PATH)
  const fileName = `${cigar.id}.png`
  console.log(`\nUploading ${fileName} to cigar-images bucket...`)

  // 3. Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('cigar-photos')
    .upload(fileName, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    process.exit(1)
  }

  console.log('Uploaded:', uploadData.path)

  // 4. Get public URL
  const { data: urlData } = supabase.storage
    .from('cigar-photos')
    .getPublicUrl(fileName)

  const publicUrl = urlData.publicUrl
  console.log('Public URL:', publicUrl)

  // 5. Update cigar_catalog
  const { error: updateError } = await supabase
    .from('cigar_catalog')
    .update({ image_url: publicUrl })
    .eq('id', cigar.id)

  if (updateError) {
    console.error('Update error:', updateError)
    process.exit(1)
  }

  console.log(`\n✓ Done! ${cigar.brand} ${cigar.name} now has image attached.`)
  console.log(`  URL: ${publicUrl}`)
}

run()
