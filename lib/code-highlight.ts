// Syntax highlighting for code posts: Prism, with a grammar for each language
// in lib/code-files.ts, turned into plain data the code view renders as
// elements (no HTML strings).
import Prism from "prismjs"
import type { Token, TokenStream } from "prismjs"
// Prism's main file has HTML (markup), CSS, C-like and JavaScript. Each of
// these comes after the grammars it builds on.
import "prismjs/components/prism-typescript.js"
import "prismjs/components/prism-jsx.js"
import "prismjs/components/prism-tsx.js"
import "prismjs/components/prism-scss.js"
import "prismjs/components/prism-json.js"
import "prismjs/components/prism-python.js"
import "prismjs/components/prism-java.js"
import "prismjs/components/prism-csharp.js"
import "prismjs/components/prism-c.js"
import "prismjs/components/prism-cpp.js"
import "prismjs/components/prism-go.js"
import "prismjs/components/prism-rust.js"
import "prismjs/components/prism-markup-templating.js"
import "prismjs/components/prism-php.js"
import "prismjs/components/prism-ruby.js"
import "prismjs/components/prism-kotlin.js"
import "prismjs/components/prism-swift.js"
import "prismjs/components/prism-dart.js"
import "prismjs/components/prism-sql.js"
import "prismjs/components/prism-bash.js"
import "prismjs/components/prism-yaml.js"
import "prismjs/components/prism-markdown.js"
import "prismjs/components/prism-docker.js"
import "prismjs/components/prism-graphql.js"
import { languageById } from "@/lib/code-files"

// A piece of highlighted code: plain text, or a token with Prism's class
// names around its own pieces.
export type Highlighted = string | { classes: string; content: Highlighted[] }

function pieces(stream: TokenStream): Highlighted[] {
  if (typeof stream === "string") return [stream]
  if (Array.isArray(stream)) return stream.flatMap(pieces)
  const token = stream as Token
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : []
  return [{ classes: ["token", token.type, ...aliases].join(" "), content: pieces(token.content) }]
}

// The code in highlighted pieces; plain text for a language with no grammar.
export function highlight(code: string, language: string): Highlighted[] {
  const name = languageById(language)?.prism
  const grammar = name ? Prism.languages[name] : undefined
  return grammar ? pieces(Prism.tokenize(code, grammar)) : [code]
}
