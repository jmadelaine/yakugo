import { describe, expect, it } from 'vitest'
import { parseConfig } from './config'
import { decodeProject, encodeProject } from './format'

const defaults = { files: '{locale}.json', sourceLocale: 'en' }

function project(yaml: string) {
  return parseConfig(`projects:\n${yaml}`, defaults).projects[0]
}

describe('plain per-locale JSON', () => {
  const p = project(`  - name: Web\n    path: locales\n`)
  const files = {
    'locales/en.json': '{\n  "cart": {\n    "empty": "Empty",\n    "count": 3\n  }\n}\n',
    'locales/de.json': '{\n  "cart.empty": "Leer"\n}\n',
    'locales/README.md': 'ignored',
  }

  it('decodes nested and flat files into dot keys, source locale first', () => {
    const data = decodeProject(p, files)
    expect(data.locales).toEqual(['en', 'de'])
    expect(data.fields).toEqual([])
    expect(data.values).toEqual({ en: { 'cart.empty': 'Empty', 'cart.count': '3' }, de: { 'cart.empty': 'Leer' } })
  })

  it('writes nothing when content is unchanged', () => {
    const data = decodeProject(p, files)
    expect(encodeProject(p, files, data)).toEqual([])
  })

  it('keeps each file layout, adds and removes keys, creates new locale files', () => {
    const data = decodeProject(p, files)
    data.values.en['cart.empty'] = 'Your cart is empty'
    delete data.values.en['cart.count']
    data.values.de['cart.checkout'] = 'Zur Kasse'
    data.values.fr = { 'cart.empty': 'Vide' }
    const writes = encodeProject(p, files, data)
    expect(writes.map((w) => w.path)).toEqual(['locales/en.json', 'locales/de.json', 'locales/fr.json'])
    expect(JSON.parse(writes[0].content)).toEqual({ cart: { empty: 'Your cart is empty' } })
    expect(JSON.parse(writes[1].content)).toEqual({ 'cart.empty': 'Leer', 'cart.checkout': 'Zur Kasse' })
    expect(JSON.parse(writes[2].content)).toEqual({ cart: { empty: 'Vide' } })
  })

  it('prunes empty parent objects when the last key in a group goes', () => {
    const data = decodeProject(p, files)
    data.values.en = {}
    const [write] = encodeProject(p, files, data)
    expect(JSON.parse(write.content)).toEqual({})
  })
})

describe('structured JSON records with a shared field', () => {
  const p = project(`  - name: Ext\n    path: _locales\n    files: "{locale}/messages.json"\n    fields:\n      value: message\n      description: description\n`)
  const files = {
    '_locales/en/messages.json': JSON.stringify({ hello: { message: 'Hello', description: 'Greeting', placeholders: {} } }),
    '_locales/de/messages.json': JSON.stringify({ hello: { message: 'Hallo', description: 'stale' } }),
  }

  it('reads values per locale and fields from the source locale only', () => {
    const data = decodeProject(p, files)
    expect(data.fields).toEqual(['description'])
    expect(data.values).toEqual({ en: { hello: 'Hello' }, de: { hello: 'Hallo' } })
    expect(data.fieldValues).toEqual({ description: { hello: 'Greeting' } })
  })

  it('writes fields to the source file and keeps unknown properties', () => {
    const data = decodeProject(p, files)
    data.fieldValues.description.hello = 'A greeting'
    data.values.de.bye = 'Tschüss'
    data.fieldValues.description.bye = 'Farewell'
    const writes = Object.fromEntries(encodeProject(p, files, data).map((w) => [w.path, JSON.parse(w.content)]))
    expect(writes['_locales/en/messages.json']).toEqual({
      hello: { message: 'Hello', description: 'A greeting', placeholders: {} },
      bye: { description: 'Farewell' },
    })
    expect(writes['_locales/de/messages.json']).toEqual({ hello: { message: 'Hallo', description: 'stale' }, bye: { message: 'Tschüss' } })
  })
})

describe('one JSON file for all locales', () => {
  const p = project(`  - name: Catalog\n    files: catalog.json\n    records: entries\n    fields:\n      key: id\n      value: "text.{locale}"\n      note: comment\n`)
  const files = {
    'catalog.json': JSON.stringify({ version: 1, entries: [{ id: 'a', comment: 'first', text: { en: 'A', de: 'Ä' } }] }),
  }

  it('discovers locales from the records', () => {
    const data = decodeProject(p, files)
    expect(data.locales).toEqual(['en', 'de'])
    expect(data.values).toEqual({ en: { a: 'A' }, de: { a: 'Ä' } })
    expect(data.fieldValues).toEqual({ note: { a: 'first' } })
  })

  it('updates records in place and appends new ones', () => {
    const data = decodeProject(p, files)
    data.values.de.a = 'Ae'
    data.values.en.b = 'B'
    data.fieldValues.note.b = 'second'
    const [write] = encodeProject(p, files, data)
    expect(JSON.parse(write.content)).toEqual({
      version: 1,
      entries: [
        { id: 'a', comment: 'first', text: { en: 'A', de: 'Ae' } },
        { id: 'b', text: { en: 'B' }, comment: 'second' },
      ],
    })
  })

  it('handles nested object records keyed by property', () => {
    const q = project(`  - name: Wide\n    files: strings.json\n    fields:\n      value: "{locale}"\n`)
    const wide = { 'strings.json': JSON.stringify({ nav: { home: { en: 'Home', de: 'Start' } } }) }
    const data = decodeProject(q, wide)
    expect(data.values).toEqual({ en: { 'nav.home': 'Home' }, de: { 'nav.home': 'Start' } })
    data.values.de['nav.home'] = 'Startseite'
    expect(JSON.parse(encodeProject(q, wide, data)[0].content)).toEqual({ nav: { home: { en: 'Home', de: 'Startseite' } } })
  })
})

describe('CSV', () => {
  it('reads and writes a wide CSV with a column per locale', () => {
    const p = project(`  - name: Marketing\n    files: strings.csv\n    fields:\n      key: Key\n      description: Context\n`)
    const files = { 'strings.csv': 'Key,Context,en,de\nhero.title,Top banner,Welcome,Willkommen\nhero.cta,,Buy now,\n' }
    const data = decodeProject(p, files)
    expect(data.locales).toEqual(['en', 'de'])
    expect(data.values).toEqual({ en: { 'hero.title': 'Welcome', 'hero.cta': 'Buy now' }, de: { 'hero.title': 'Willkommen' } })
    expect(data.fieldValues).toEqual({ description: { 'hero.title': 'Top banner' } })
    expect(encodeProject(p, files, data)).toEqual([])

    data.values.de['hero.cta'] = 'Jetzt kaufen'
    data.fieldValues.description['hero.cta'] = 'Button, keep it short'
    delete data.values.en['hero.title']
    delete data.values.de['hero.title']
    delete data.fieldValues.description['hero.title']
    data.values.ja = { 'hero.cta': '今すぐ購入' }
    const [write] = encodeProject(p, files, data)
    expect(write.content).toBe('Key,Context,en,de,ja\nhero.cta,"Button, keep it short",Buy now,Jetzt kaufen,今すぐ購入\n')
  })

  it('reads and writes one CSV per locale', () => {
    const p = project(`  - name: Legacy\n    path: legacy\n    files: "{locale}.csv"\n    fields:\n      key: id\n      value: text\n`)
    const files = { 'legacy/en.csv': 'id,text\na,A\n', 'legacy/de.csv': 'id,text,extra\na,Ä,x\n' }
    const data = decodeProject(p, files)
    expect(data.values).toEqual({ en: { a: 'A' }, de: { a: 'Ä' } })
    data.values.de.b = 'B'
    const writes = encodeProject(p, files, data)
    expect(writes).toEqual([{ path: 'legacy/de.csv', content: 'id,text,extra\na,Ä,x\nb,B,\n' }])
  })

  it('resolves {locale} in the value column of per-locale files', () => {
    const p = project(
      `  - name: Phrase\n    path: phrase-data\n    files: "app-{locale}-copy.csv"\n    fields:\n      key: key_name\n      value: "{locale}"\n      comment: comment\n`,
    )
    const files = {
      'phrase-data/app-en-copy.csv': 'key_name,en,comment\napp_title,Shop,Page title\napp_tagline,Delivered,\n',
      'phrase-data/app-ja-copy.csv': 'key_name,ja,comment\napp_title,ショップ,Page title\n',
      'phrase-data/app-tags.csv': 'ignored',
    }
    const data = decodeProject(p, files)
    expect(data.locales).toEqual(['en', 'ja'])
    expect(data.values).toEqual({ en: { app_title: 'Shop', app_tagline: 'Delivered' }, ja: { app_title: 'ショップ' } })
    expect(data.fieldValues).toEqual({ comment: { app_title: 'Page title' } })
    data.values.ja.app_tagline = 'お届け'
    expect(encodeProject(p, files, data)).toEqual([
      { path: 'phrase-data/app-ja-copy.csv', content: 'key_name,ja,comment\napp_title,ショップ,Page title\napp_tagline,お届け,\n' },
    ])
  })

  it('reports a missing key column', () => {
    const p = project(`  - name: Bad\n    files: x.csv\n    fields:\n      key: Key\n`)
    expect(() => decodeProject(p, { 'x.csv': 'id,en\na,A\n' })).toThrow('key column')
  })
})
