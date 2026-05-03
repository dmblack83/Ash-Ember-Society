/* ------------------------------------------------------------------
   CigarImage

   Thin wrapper over next/image that resolves the cigar's photo URL
   (Supabase Storage) with the wrapper-appropriate default fallback
   from /public/Cigar Default Images/. Use this anywhere we used to
   write `<img src={getCigarImage(c.image_url, c.wrapper)} />`.

   The component just resolves `src`; every other next/image prop
   passes through unchanged so each call site picks the right
   `sizes`, `width`/`height` (or `fill`), `quality`, `priority`,
   `style`, and `className` for its render context.

   Usage examples:

     // Fixed-size thumbnail (44px square)
     <CigarImage
       imageUrl={c.image_url}
       wrapper={c.wrapper}
       alt={c.series ?? c.format ?? "Cigar"}
       width={44}
       height={44}
       sizes="44px"
       quality={75}
     />

     // Responsive hero inside a sized container
     <div style={{ position: "relative", aspectRatio: "4 / 3" }}>
       <CigarImage
         imageUrl={c.image_url}
         wrapper={c.wrapper}
         alt={c.series ?? c.format ?? "Cigar"}
         fill
         sizes="(max-width: 600px) 100vw, 600px"
         style={{ objectFit: "contain" }}
         priority
       />
     </div>
   ------------------------------------------------------------------ */

import Image from "next/image";
import type { ImageProps } from "next/image";
import { getCigarImage } from "@/lib/cigar-default-image";

export interface CigarImageProps extends Omit<ImageProps, "src"> {
  imageUrl: string | null | undefined;
  wrapper:  string | null | undefined;
}

export function CigarImage({ imageUrl, wrapper, alt, ...rest }: CigarImageProps) {
  const src = getCigarImage(imageUrl, wrapper);
  return <Image src={src} alt={alt} {...rest} />;
}
