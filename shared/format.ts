import { FIELD, FILE_FORMAT, LOCALE_TOKEN, escapeRegex, projectFiles, type ProjectConfig } from './config'
import { parseCsv, serializeCsv } from './csv'
import type { LocaleWrite } from './translations'
import type { FlatTranslations, ProjectContent, ProjectData } from './types'

/** Repo path → file text. */
export type FileTexts = Record<string, string>

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
type JsonObject = { [key: string]: JsonValue }

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || (typeof value !== 'object' && typeof value !== 'function')
}

/** Primitive JSON leaf as editor text. Non-strings keep their JSON text so they survive the round trip. */
function toText(value: unknown): string | undefined {
  if (value === undefined || isObject(value) || Array.isArray(value)) return undefined
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// ---- dotted paths -----------------------------------------------------------

function splitPath(path: string): string[] {
  return path === '' || path === '.' ? [] : path.split('.')
}

function getPath(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const segment of splitPath(path)) {
    if (!isObject(node)) return undefined
    node = node[segment]
  }
  return node
}

function setPath(root: JsonObject, path: string, value: JsonValue): void {
  const segments = splitPath(path)
  let node = root
  for (const segment of segments.slice(0, -1)) {
    const child = node[segment]
    if (isObject(child)) {
      node = child
    } else {
      const created: JsonObject = {}
      node[segment] = created
      node = created
    }
  }
  node[segments[segments.length - 1]] = value
}

/** Deletes the value at `path` and any objects on the way that became empty. */
function deletePath(root: JsonObject, path: string): void {
  const segments = splitPath(path)
  const parents: JsonObject[] = [root]
  for (const segment of segments.slice(0, -1)) {
    const child = parents[parents.length - 1][segment]
    if (!isObject(child)) return
    parents.push(child)
  }
  delete parents[parents.length - 1][segments[segments.length - 1]]
  for (let i = parents.length - 1; i > 0; i -= 1) {
    if (Object.keys(parents[i]).length > 0) break
    delete parents[i - 1][segments[i - 1]]
  }
}

// ---- JSON records -----------------------------------------------------------

interface JsonLayout {
  /** The record itself holds the value (`value: .`). */
  leafIsValue: boolean
  /** Path from the record to the object whose keys are locales (wide files only). */
  localePrefix?: string
  /** Path from a locale entry down to the text (wide files only). */
  localeSuffix: string
}

function jsonLayout(project: ProjectConfig): JsonLayout {
  const valuePath = project.fields[FIELD.VALUE]
  if (!valuePath.includes(LOCALE_TOKEN)) return { leafIsValue: splitPath(valuePath).length === 0, localeSuffix: '' }
  const [prefix, suffix] = valuePath.split(LOCALE_TOKEN)
  return { leafIsValue: false, localePrefix: prefix.replace(/\.$/, ''), localeSuffix: suffix.replace(/^\./, '') }
}

/** Decides whether a node under an object container is one record or a group of nested keys. */
function isRecord(node: JsonValue, project: ProjectConfig, layout: JsonLayout): boolean {
  if (layout.localePrefix !== undefined) {
    if (!isObject(node)) return false
    const locales = getPath(node, layout.localePrefix)
    return isObject(locales) && Object.keys(locales).length > 0 && Object.values(locales).every((entry) => !isObject(entry) || layout.localeSuffix !== '')
  }
  if (layout.leafIsValue) return !isObject(node)
  return isObject(node) && isPrimitive(getPath(node, project.fields[FIELD.VALUE]))
}

interface JsonRecord {
  key: string
  node: JsonValue
}

function collectRecords(container: JsonValue, project: ProjectConfig, layout: JsonLayout): JsonRecord[] {
  const records: JsonRecord[] = []
  if (Array.isArray(container)) {
    for (const item of container) {
      const key = toText(getPath(item, project.fields[FIELD.KEY]))
      if (key !== undefined) records.push({ key, node: item })
    }
    return records
  }
  if (!isObject(container)) return records
  const walk = (node: JsonObject, prefix: string) => {
    for (const [prop, child] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${prop}` : prop
      if (isRecord(child, project, layout)) records.push({ key, node: child })
      else if (isObject(child)) walk(child, key)
    }
  }
  walk(container, '')
  return records
}

function recordValue(record: JsonValue, project: ProjectConfig, layout: JsonLayout, locale: string | undefined): string | undefined {
  if (layout.localePrefix !== undefined) {
    const entry = getPath(getPath(record, layout.localePrefix), locale ?? '')
    return toText(layout.localeSuffix ? getPath(entry, layout.localeSuffix) : entry)
  }
  return toText(layout.leafIsValue ? record : getPath(record, project.fields[FIELD.VALUE]))
}

function recordLocales(record: JsonValue, layout: JsonLayout): string[] {
  const locales = getPath(record, layout.localePrefix ?? '')
  return isObject(locales) ? Object.keys(locales) : []
}

function usesNestedKeys(container: JsonValue, project: ProjectConfig, layout: JsonLayout): boolean {
  if (!isObject(container)) return false
  const hasGroup = Object.values(container).some((child) => isObject(child) && !isRecord(child, project, layout))
  if (hasGroup) return true
  // Flat files keep dots inside property names.
  return !Object.keys(container).some((prop) => prop.includes('.'))
}

/** For a per-locale file, resolves `{locale}` in the value path to that file's locale. */
function withLocale(project: ProjectConfig, locale: string | undefined): ProjectConfig {
  if (locale === undefined || !project.fields[FIELD.VALUE].includes(LOCALE_TOKEN)) return project
  return { ...project, fields: { ...project.fields, [FIELD.VALUE]: project.fields[FIELD.VALUE].split(LOCALE_TOKEN).join(locale) } }
}

// ---- decode -----------------------------------------------------------------

interface Decoded extends ProjectContent {
  locales: Set<string>
}

function emptyContent(): Decoded {
  return { values: {}, fieldValues: {}, locales: new Set() }
}

function put(map: Record<string, FlatTranslations>, column: string, key: string, text: string | undefined): void {
  if (text === undefined) return
  ;(map[column] ??= {})[key] = text
}

function decodeJsonFile(text: string, project: ProjectConfig, locale: string | undefined, withFields: boolean, out: Decoded): void {
  const layout = jsonLayout(project)
  const container = getPath(parseJson(text), project.records)
  if (container === undefined) return
  for (const record of collectRecords(container as JsonValue, project, layout)) {
    const locales = locale === undefined ? recordLocales(record.node, layout) : [locale]
    for (const entry of locales) {
      out.locales.add(entry)
      put(out.values, entry, record.key, recordValue(record.node, project, layout, locale === undefined ? entry : undefined))
    }
    if (withFields) {
      for (const field of project.customFields) put(out.fieldValues, field, record.key, toText(getPath(record.node, project.fields[field])))
    }
  }
}

function parseJson(text: string): JsonValue {
  const value = JSON.parse(text) as JsonValue
  if (!isObject(value) && !Array.isArray(value)) throw new Error('JSON file must contain an object or an array at the top level')
  return value
}

/** Columns of a wide CSV holding one locale each, from the `value` path pattern. */
function csvLocaleColumns(project: ProjectConfig, header: string[]): Map<string, number> {
  const [prefix, suffix] = project.fields[FIELD.VALUE].split(LOCALE_TOKEN)
  const regex = new RegExp(`^${escapeRegex(prefix)}([\\w-]+)${escapeRegex(suffix)}$`)
  const claimed = new Set(Object.entries(project.fields).filter(([field]) => field !== FIELD.VALUE).map(([, column]) => column))
  const columns = new Map<string, number>()
  header.forEach((name, index) => {
    const locale = regex.exec(name)?.[1]
    if (locale && !claimed.has(name) && !columns.has(locale)) columns.set(locale, index)
  })
  return columns
}

function csvColumnFor(project: ProjectConfig, locale: string): string {
  return project.fields[FIELD.VALUE].replace(LOCALE_TOKEN, locale)
}

function decodeCsvFile(text: string, project: ProjectConfig, locale: string | undefined, withFields: boolean, out: Decoded): void {
  const rows = parseCsv(text)
  if (rows.length === 0) return
  const header = rows[0]
  const keyIndex = header.indexOf(project.fields[FIELD.KEY])
  if (keyIndex === -1) throw new Error(`CSV is missing the key column "${project.fields[FIELD.KEY]}"`)
  const localeColumns = locale === undefined ? csvLocaleColumns(project, header) : new Map([[locale, header.indexOf(project.fields[FIELD.VALUE])]])
  const fieldColumns = project.customFields.map((field) => [field, header.indexOf(project.fields[field])] as const)

  for (const row of rows.slice(1)) {
    const key = row[keyIndex]
    if (!key) continue
    for (const [entry, index] of localeColumns) {
      out.locales.add(entry)
      if (index !== -1 && row[index]) put(out.values, entry, key, row[index])
    }
    if (withFields) {
      for (const [field, index] of fieldColumns) if (index !== -1 && row[index]) put(out.fieldValues, field, key, row[index])
    }
  }
}

/** Reads a project's content out of its files. Shared fields come from the source locale's file when there is one per locale. */
export function decodeProject(project: ProjectConfig, files: FileTexts): ProjectData {
  const out = emptyContent()
  const location = projectFiles(project)
  const decodeFile = project.format === FILE_FORMAT.CSV ? decodeCsvFile : decodeJsonFile

  for (const [path, text] of Object.entries(files)) {
    const locale = location.kind === 'perLocale' ? location.pattern.localeFromPath(path) : undefined
    if (location.kind === 'perLocale' && !locale) continue
    if (location.kind === 'single' && path !== location.path) continue
    try {
      decodeFile(text, withLocale(project, locale), locale, locale === undefined || locale === project.sourceLocale, out)
    } catch (error) {
      throw new Error(`Could not parse ${path}: ${(error as Error).message}`)
    }
  }

  const locales = [...out.locales].sort((a, b) => {
    if (a === project.sourceLocale) return -1
    if (b === project.sourceLocale) return 1
    return a.localeCompare(b)
  })
  for (const locale of locales) out.values[locale] ??= {}
  for (const field of project.customFields) out.fieldValues[field] ??= {}
  return { locales, fields: project.customFields, values: out.values, fieldValues: out.fieldValues }
}

// ---- encode -----------------------------------------------------------------

function keysOf(content: ProjectContent, locales: string[], withFields: boolean): string[] {
  const keys = new Set<string>()
  for (const locale of locales) for (const key of Object.keys(content.values[locale] ?? {})) keys.add(key)
  if (withFields) for (const map of Object.values(content.fieldValues)) for (const key of Object.keys(map)) keys.add(key)
  return [...keys]
}

/** Sets a text at `path` in `record`, leaving an equal non-string primitive untouched; empty text deletes. */
function writeText(record: JsonObject, path: string, text: string | undefined): void {
  if (text === undefined || text === '') {
    deletePath(record, path)
    return
  }
  const existing = getPath(record, path)
  if (existing !== undefined && toText(existing) === text) return
  setPath(record, path, text)
}

function encodeJsonFile(
  text: string | undefined,
  project: ProjectConfig,
  content: ProjectContent,
  locales: string[],
  withFields: boolean,
): string {
  const layout = jsonLayout(project)
  const arrayRecords = project.fields[FIELD.KEY] !== '.'
  const doc: JsonValue = text === undefined ? (project.records || !arrayRecords ? {} : []) : parseJson(text)
  let container = getPath(doc, project.records) as JsonValue | undefined
  if (container === undefined) {
    container = arrayRecords ? [] : {}
    setPath(doc as JsonObject, project.records, container)
  }

  const existing = new Map(collectRecords(container, project, layout).map((record) => [record.key, record.node]))
  const wanted = keysOf(content, locales, withFields)
  const wantedSet = new Set(wanted)
  const nested = Array.isArray(container) ? false : usesNestedKeys(container, project, layout)
  const keyPath = (key: string) => (nested ? key : key.replace(/\./g, '\u0000'))

  // Object containers address records by key path; '\0' stands in for literal dots in flat files.
  const getRecord = (key: string) => (Array.isArray(container) ? existing.get(key) : getPathFlat(container as JsonObject, keyPath(key)))
  const setRecord = (key: string, node: JsonValue) => {
    if (Array.isArray(container)) {
      const index = container.findIndex((item) => toText(getPath(item, project.fields[FIELD.KEY])) === key)
      if (index === -1) container.push(node)
      else container[index] = node
    } else {
      setPathFlat(container as JsonObject, keyPath(key), node)
    }
  }
  const removeRecord = (key: string) => {
    if (Array.isArray(container)) {
      const index = container.findIndex((item) => toText(getPath(item, project.fields[FIELD.KEY])) === key)
      if (index !== -1) container.splice(index, 1)
    } else {
      deletePathFlat(container as JsonObject, keyPath(key))
    }
  }

  for (const key of existing.keys()) if (!wantedSet.has(key)) removeRecord(key)

  for (const key of wanted) {
    const fieldTexts = withFields ? project.customFields.map((field) => [field, content.fieldValues[field]?.[key]] as const) : []
    if (layout.leafIsValue) {
      // The record is the value itself; shared fields have nowhere to live.
      const value = content.values[locales[0]]?.[key]
      if (value === undefined) removeRecord(key)
      else if (toText(getRecord(key)) !== value) setRecord(key, value)
      continue
    }

    const current = getRecord(key)
    const record: JsonObject = isObject(current) ? current : {}
    if (arrayRecords && getPath(record, project.fields[FIELD.KEY]) === undefined) setPath(record, project.fields[FIELD.KEY], key)
    if (layout.localePrefix !== undefined) {
      for (const locale of locales) {
        const path = [layout.localePrefix, locale, layout.localeSuffix].filter(Boolean).join('.')
        writeText(record, path, content.values[locale]?.[key])
      }
    } else {
      writeText(record, project.fields[FIELD.VALUE], content.values[locales[0]]?.[key])
    }
    for (const [field, value] of fieldTexts) writeText(record, project.fields[field], value)
    if (!isObject(current)) setRecord(key, record)
  }

  return `${JSON.stringify(doc, null, 2)}\n`
}

// Flat-file variants: '\0' marks a dot that is part of a property name.
function flatSegments(path: string): string[] {
  return splitPath(path).map((segment) => segment.split('\u0000').join('.'))
}
function getPathFlat(root: JsonObject, path: string): unknown {
  let node: unknown = root
  for (const segment of flatSegments(path)) {
    if (!isObject(node)) return undefined
    node = node[segment]
  }
  return node
}
function setPathFlat(root: JsonObject, path: string, value: JsonValue): void {
  const segments = flatSegments(path)
  let node = root
  for (const segment of segments.slice(0, -1)) {
    const child = node[segment]
    if (isObject(child)) node = child
    else {
      const created: JsonObject = {}
      node[segment] = created
      node = created
    }
  }
  node[segments[segments.length - 1]] = value
}
function deletePathFlat(root: JsonObject, path: string): void {
  const segments = flatSegments(path)
  const parents: JsonObject[] = [root]
  for (const segment of segments.slice(0, -1)) {
    const child = parents[parents.length - 1][segment]
    if (!isObject(child)) return
    parents.push(child)
  }
  delete parents[parents.length - 1][segments[segments.length - 1]]
  for (let i = parents.length - 1; i > 0; i -= 1) {
    if (Object.keys(parents[i]).length > 0) break
    delete parents[i - 1][segments[i - 1]]
  }
}

function encodeCsvFile(
  text: string | undefined,
  project: ProjectConfig,
  content: ProjectContent,
  locales: string[],
  withFields: boolean,
): string | undefined {
  const original = text === undefined ? [] : parseCsv(text)
  const header = original.length > 0 ? [...original[0]] : []
  const rows = original.slice(1).map((row) => [...row])
  const wide = project.fields[FIELD.VALUE].includes(LOCALE_TOKEN)

  const column = (name: string): number => {
    let index = header.indexOf(name)
    if (index === -1) {
      index = header.length
      header.push(name)
    }
    return index
  }
  const keyIndex = column(project.fields[FIELD.KEY])
  const fieldIndexes = withFields ? project.customFields.map((field) => [field, column(project.fields[field])] as const) : []
  const localeIndexes = locales.map((locale) => [locale, column(wide ? csvColumnFor(project, locale) : project.fields[FIELD.VALUE])] as const)

  const wanted = keysOf(content, locales, withFields)
  const wantedSet = new Set(wanted)
  const byKey = new Map<string, string[]>()
  const kept: string[][] = []
  for (const row of rows) {
    const key = row[keyIndex]
    if (key && !wantedSet.has(key)) continue
    if (key) byKey.set(key, row)
    kept.push(row)
  }
  for (const key of wanted) {
    let row = byKey.get(key)
    if (!row) {
      row = []
      row[keyIndex] = key
      kept.push(row)
    }
    for (const [locale, index] of localeIndexes) row[index] = content.values[locale]?.[key] ?? ''
    for (const [field, index] of fieldIndexes) row[index] = content.fieldValues[field]?.[key] ?? ''
  }
  const width = header.length
  const normalize = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? '')
  const result = [header, ...kept.map(normalize)]
  const unchanged = original.length === result.length && original.every((row, i) => normalize(row).join('\u0000') === result[i].join('\u0000'))
  return unchanged ? undefined : serializeCsv(result)
}

/**
 * Produces the files to write so that they hold `content`. Only files whose
 * text changes are returned. Files for locales with no values are left alone.
 */
export function encodeProject(project: ProjectConfig, files: FileTexts, content: ProjectContent): LocaleWrite[] {
  const location = projectFiles(project)
  const writes: LocaleWrite[] = []
  const isCsv = project.format === FILE_FORMAT.CSV

  const encode = (path: string, locales: string[], withFields: boolean, locale?: string) => {
    const text = files[path]
    const resolved = withLocale(project, locale)
    let next: string | undefined
    try {
      next = isCsv ? encodeCsvFile(text, resolved, content, locales, withFields) : encodeJsonFile(text, resolved, content, locales, withFields)
    } catch (error) {
      throw new Error(`Could not update ${path}: ${(error as Error).message}`)
    }
    if (next !== undefined && next !== text) writes.push({ path, content: next })
  }

  if (location.kind === 'single') {
    const locales = Object.keys(content.values).sort()
    encode(location.path, locales, true)
    return writes
  }

  const locales = new Set(Object.keys(content.values))
  for (const path of Object.keys(files)) {
    const locale = location.pattern.localeFromPath(path)
    if (locale) locales.add(locale)
  }
  for (const locale of locales) {
    encode(location.pattern.pathFor(locale), [locale], locale === project.sourceLocale, locale)
  }
  return writes
}
