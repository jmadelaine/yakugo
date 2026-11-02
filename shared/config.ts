import { parse } from 'yaml'
import { compilePlaceholderPattern, type PlaceholderConfig } from './placeholders'
import { slugify } from './translations'

/** Name of the config file at the root of the translations repo. */
export const CONFIG_FILE = 'yakugo.yaml'

export const FILE_FORMAT = { JSON: 'json', CSV: 'csv' } as const
export type FileFormat = (typeof FILE_FORMAT)[keyof typeof FILE_FORMAT]

/** Built-in field names. Every other field is a shared, per-key text column. */
export const FIELD = { KEY: 'key', VALUE: 'value' } as const

/** Placeholder in `files` and in field paths. */
export const LOCALE_TOKEN = '{locale}'

/**
 * Where each field lives inside one record. JSON: dotted path, `.` for the
 * record itself. CSV: column header. `{locale}` may appear in `value` only: in
 * a file that holds all locales it selects the locale; in per-locale files it
 * is replaced by the file's locale.
 */
export type FieldPaths = { key: string; value: string } & Record<string, string>

export interface ProjectConfig {
  /** URL-safe id derived from the name. */
  id: string
  name: string
  /** Sub directory of the repo holding this project's files ('' for the root). */
  path: string
  /** File pattern inside `path`. With `{locale}` there is one file per locale. */
  files: string
  format: FileFormat
  /** JSON only: dotted path to the object or array holding the records; '' for the root. */
  records: string
  fields: FieldPaths
  /** Custom field names in config order. */
  customFields: string[]
  /** Reference locale, shown first in the editor. */
  sourceLocale: string
  /** How placeholders look in this project's strings, and example values for previews. */
  placeholders?: PlaceholderConfig
}

export interface YakugoConfig {
  projects: ProjectConfig[]
}

/** Values used when a project, or the whole file, leaves them out. */
export interface ConfigDefaults {
  files: string
  sourceLocale: string
}

const LOCALE_NAME = /^[\w-]+$/

/** Parses `yakugo.yaml`. See README for the schema. */
export function parseConfig(text: string, defaults: ConfigDefaults): YakugoConfig {
  const data = asMapping(text.trim() ? parse(text) : {}, CONFIG_FILE)
  const fileDefaults: ConfigDefaults = {
    files: readString(data, 'files') ?? defaults.files,
    sourceLocale: readString(data, 'sourceLocale') ?? defaults.sourceLocale,
  }
  const list = data.projects
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${CONFIG_FILE}: projects must be a non-empty list`)

  const projects = list.map((item, index) => {
    const entry = asMapping(item, `projects[${index}]`)
    const name = readString(entry, 'name')
    if (!name) throw new Error(`${CONFIG_FILE}: projects[${index}] needs a name`)
    return buildProject({
      name,
      path: readString(entry, 'path') ?? '',
      files: readString(entry, 'files') ?? fileDefaults.files,
      format: readString(entry, 'format'),
      records: readString(entry, 'records') ?? '',
      fields: entry.fields === undefined ? {} : asMapping(entry.fields, `${name} fields`),
      sourceLocale: readString(entry, 'sourceLocale') ?? fileDefaults.sourceLocale,
      placeholders: entry.placeholders === undefined ? undefined : readPlaceholders(asMapping(entry.placeholders, `${name} placeholders`), name),
    })
  })

  const ids = new Set<string>()
  for (const project of projects) {
    if (ids.has(project.id)) throw new Error(`${CONFIG_FILE}: two projects share the id "${project.id}"`)
    ids.add(project.id)
  }
  return { projects }
}

/** Config for a repo without `yakugo.yaml`: one project at `path`. */
export function defaultConfig(path: string, defaults: ConfigDefaults): YakugoConfig {
  return {
    projects: [
      buildProject({ name: 'Translations', path, files: defaults.files, records: '', fields: {}, sourceLocale: defaults.sourceLocale }),
    ],
  }
}

interface ProjectInput {
  name: string
  path: string
  files: string
  format?: string
  records: string
  fields: Record<string, unknown>
  sourceLocale: string
  placeholders?: PlaceholderConfig
}

function readPlaceholders(data: Record<string, unknown>, project: string): PlaceholderConfig {
  const pattern = readString(data, 'pattern')
  if (!pattern) throw new Error(`${CONFIG_FILE}: ${project}: placeholders.pattern is required`)
  const examples: Record<string, string> = {}
  if (data.examples !== undefined) {
    for (const [name, value] of Object.entries(asMapping(data.examples, `${project} placeholders.examples`))) {
      if (value === null || typeof value === 'object') throw new Error(`${CONFIG_FILE}: ${project}: example for ${name} must be a value`)
      examples[name] = String(value)
    }
  }
  const config = { pattern, examples }
  try {
    compilePlaceholderPattern(config)
  } catch (error) {
    throw new Error(`${CONFIG_FILE}: ${project}: ${(error as Error).message}`)
  }
  return config
}

function buildProject(input: ProjectInput): ProjectConfig {
  const { name } = input
  const files = input.files.replace(/^\/+|\/+$/g, '')
  const perLocale = files.includes(LOCALE_TOKEN)
  const format = detectFormat(input.format, files, name)

  const fields: Record<string, string> = {}
  for (const [field, value] of Object.entries(input.fields)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${CONFIG_FILE}: ${name}: field ${field} must be a path`)
    if (!/^[\w-]+$/.test(field)) throw new Error(`${CONFIG_FILE}: ${name}: invalid field name "${field}"`)
    fields[field] = value.trim()
  }
  // JSON object records are keyed by property name, and a plain leaf is its own value.
  fields[FIELD.KEY] ??= format === FILE_FORMAT.CSV ? FIELD.KEY : '.'
  fields[FIELD.VALUE] ??= format === FILE_FORMAT.CSV ? (perLocale ? FIELD.VALUE : LOCALE_TOKEN) : '.'

  // One file per locale, or one file whose value path selects the locale. Both at
  // once is fine too: per-locale files whose value column is named after the locale.
  if (!perLocale && !fields[FIELD.VALUE].includes(LOCALE_TOKEN)) {
    throw new Error(
      `${CONFIG_FILE}: ${name}: ${LOCALE_TOKEN} must appear in files (one file per locale) or in the value path (one file for all locales)`,
    )
  }
  for (const [field, path] of Object.entries(fields)) {
    if (field !== FIELD.VALUE && path.includes(LOCALE_TOKEN)) {
      throw new Error(`${CONFIG_FILE}: ${name}: only the value path may contain ${LOCALE_TOKEN} (field ${field})`)
    }
  }
  if (format === FILE_FORMAT.CSV && fields[FIELD.KEY] === '.') {
    throw new Error(`${CONFIG_FILE}: ${name}: CSV projects need a key column`)
  }

  const project: ProjectConfig = {
    id: slugify(name),
    name,
    path: normalizePath(input.path),
    files,
    format,
    records: normalizePath(input.records),
    fields: fields as FieldPaths,
    customFields: Object.keys(fields).filter((field) => field !== FIELD.KEY && field !== FIELD.VALUE),
    sourceLocale: input.sourceLocale,
    ...(input.placeholders ? { placeholders: input.placeholders } : {}),
  }
  projectFiles(project)
  if (!LOCALE_NAME.test(project.sourceLocale)) throw new Error(`${CONFIG_FILE}: invalid sourceLocale for ${name}`)
  return project
}

function detectFormat(explicit: string | undefined, files: string, name: string): FileFormat {
  const format = explicit ?? (files.toLowerCase().endsWith('.csv') ? FILE_FORMAT.CSV : FILE_FORMAT.JSON)
  if (format !== FILE_FORMAT.JSON && format !== FILE_FORMAT.CSV) {
    throw new Error(`${CONFIG_FILE}: ${name}: format must be json or csv`)
  }
  return format
}

function normalizePath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  return clean === '.' ? '' : clean
}

function asMapping(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${CONFIG_FILE}: ${what} must be a mapping`)
  }
  return value as Record<string, unknown>
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${CONFIG_FILE}: ${key} must be a non-empty string`)
  return value.trim()
}

/** How a project's files are found in the repo. */
export type ProjectFiles =
  | { kind: 'perLocale'; pattern: LocalePattern }
  | { kind: 'single'; path: string }

export function projectFiles(project: ProjectConfig): ProjectFiles {
  const full = project.path ? `${project.path}/${project.files}` : project.files
  if (full.includes(LOCALE_TOKEN)) return { kind: 'perLocale', pattern: compilePattern(full) }
  checkSegments(full)
  return { kind: 'single', path: full }
}

export interface LocalePattern {
  /** Directory whose entries are matched against the `{locale}` segment ('' for the repo root). */
  dir: string
  /** Path from a matched entry down to the file; '' when `{locale}` is in the file name. */
  suffix: string
  /** Locale encoded in one entry name of `dir`, if it matches the pattern segment. */
  localeFromEntry(name: string): string | undefined
  /** Locale encoded in a full repo path, if the path matches the pattern. */
  localeFromPath(path: string): string | undefined
  pathFor(locale: string): string
}

function checkSegments(pattern: string): string[] {
  const segments = pattern.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${CONFIG_FILE}: paths must be relative without empty or dot segments (${pattern})`)
  }
  return segments
}

/**
 * Turns a path pattern into path helpers. The pattern is split at the segment
 * holding `{locale}`: everything before is the directory to list, everything
 * after is a fixed suffix.
 */
export function compilePattern(files: string): LocalePattern {
  const pattern = files.replace(/^\/+|\/+$/g, '')
  const segments = checkSegments(pattern)
  const index = segments.findIndex((segment) => segment.includes(LOCALE_TOKEN))
  if (index === -1 || pattern.split(LOCALE_TOKEN).length !== 2) {
    throw new Error(`${CONFIG_FILE}: files must contain ${LOCALE_TOKEN} exactly once (${files})`)
  }

  const [before, after] = segments[index].split(LOCALE_TOKEN)
  const segmentRegex = new RegExp(`^${escapeRegex(before)}([\\w-]+)${escapeRegex(after)}$`)
  const dir = segments.slice(0, index).join('/')
  const suffix = segments.slice(index + 1).join('/')
  const prefix = dir ? `${dir}/` : ''
  const tail = suffix ? `/${suffix}` : ''

  return {
    dir,
    suffix,
    localeFromEntry: (name) => segmentRegex.exec(name)?.[1],
    localeFromPath: (path) => {
      if (!path.startsWith(prefix) || !path.endsWith(tail)) return undefined
      const entry = path.slice(prefix.length, path.length - tail.length)
      if (entry.includes('/')) return undefined
      return segmentRegex.exec(entry)?.[1]
    },
    pathFor: (locale) => {
      if (!LOCALE_NAME.test(locale)) throw new Error(`Invalid locale name: ${locale}`)
      return `${prefix}${before}${locale}${after}${tail}`
    },
  }
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
