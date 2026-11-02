import { isMap, isSeq, parseDocument, YAMLMap } from 'yaml'
import { CONFIG_FILE } from './config'

/**
 * Rewrites `placeholders.examples` of one project inside the yakugo.yaml text,
 * keeping comments and layout of everything else. Returns the original text
 * when nothing changes. The project must already declare `placeholders`.
 */
export function updatePlaceholderExamples(text: string, projectName: string, examples: Record<string, string>): string {
  const doc = parseDocument(text)
  const projects = doc.get('projects')
  if (!isSeq(projects)) throw new Error(`${CONFIG_FILE}: projects must be a list`)
  const project = projects.items.find((item) => isMap(item) && item.get('name') === projectName)
  if (!isMap(project)) throw new Error(`${CONFIG_FILE}: project "${projectName}" not found`)
  const placeholders = project.get('placeholders')
  if (!isMap(placeholders)) throw new Error(`${CONFIG_FILE}: project "${projectName}" has no placeholders section`)

  const current = placeholders.get('examples')
  const map = isMap(current) ? current : new YAMLMap()
  const existing: Record<string, string> = {}
  for (const item of map.items) existing[String(item.key)] = String((item.value as { value?: unknown })?.value ?? item.value)
  if (sameExamples(existing, examples)) return text

  // Update in place so unchanged keys keep their position and comments.
  for (const key of Object.keys(existing)) if (!(key in examples)) map.delete(key)
  for (const [name, value] of Object.entries(examples)) {
    if (existing[name] === value) continue
    map.set(name, /^(0|-?[1-9]\d*)$/.test(value) ? Number(value) : value)
  }
  if (!isMap(current)) placeholders.set('examples', map)
  return doc.toString()
}

function sameExamples(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key])
}
