/* Enables type definitions for React's experimental APIs (currently
   ViewTransition + related). Next 16's `experimental: { viewTransition:
   true }` flag turns the runtime behavior on, but the corresponding
   type definitions live in `@types/react/experimental.d.ts` and aren't
   loaded by default. This reference pulls them in globally so TS sees
   `<ViewTransition>` as a valid import from "react".

   Remove this file once ViewTransition graduates to stable React
   typings. */

/// <reference types="react/experimental" />
