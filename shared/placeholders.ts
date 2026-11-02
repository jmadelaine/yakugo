import { escapeRegex } from './config'

/** Placeholder settings of one project, as written in yakugo.yaml. */
export interface PlaceholderConfig {
  /** How a placeholder looks, with `placeholder` standing for its name: `{placeholder}`, `{{placeholder}}`, `$placeholder$`. */
  pattern: string
  /** Example value per placeholder name, used for previews. */
  examples: Record<string, string>
}

export interface PlaceholderPattern {
  config: PlaceholderConfig
  /** Placeholder names used in `text`, unique, in order of first use. */
  find(text: string): string[]
  /** `text` with every placeholder replaced by its example; names without an example are kept as written. */
  fill(text: string): string
}

const TOKEN = 'placeholder'

/**
 * Turns the template into a matcher. The literal parts around the token are
 * matched exactly; the placeholder name is one run of word characters, dots or dashes.
 */
export function compilePlaceholderPattern(config: PlaceholderConfig): PlaceholderPattern {
  const parts = config.pattern.split(TOKEN)
  if (parts.length !== 2) throw new Error(`placeholders.pattern must contain "${TOKEN}" exactly once (${config.pattern})`)
  const [before, after] = parts
  if (before === '' && after === '') throw new Error(`placeholders.pattern needs some text around "${TOKEN}"`)
  const regex = new RegExp(`${escapeRegex(before)}([\\w.-]+)${escapeRegex(after)}`, 'g')

  return {
    config,
    find(text) {
      const names: string[] = []
      for (const match of text.matchAll(regex)) if (!names.includes(match[1])) names.push(match[1])
      return names
    },
    fill(text) {
      return text.replace(regex, (whole, name: string) => config.examples[name] ?? whole)
    },
  }
}
