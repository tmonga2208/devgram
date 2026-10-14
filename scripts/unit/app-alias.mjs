import { registerHooks } from "node:module"

// The app imports through the "@/" path alias. Import this file before the
// module under test (with a dynamic import) so Node finds those .ts files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context)
    return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context)
  },
})
