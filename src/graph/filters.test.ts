import { applyFilters, EMPTY_FILTERS, isFiltering } from './filters'
import type { GraphData, GraphItem } from './model'

const item = (id: string, extra: Partial<GraphItem> = {}): GraphItem => ({
  id,
  kind: 'URL',
  title: id,
  notes: [],
  groupIds: ['g1'],
  endpoints: [],
  ...extra,
})

const data: GraphData = {
  items: [
    item('a', { domain: 'example.com', notes: ['about cats'] }),
    item('b', { domain: 'example.org', groupIds: ['g2'] }),
    item('c', { domain: 'example.com', url: 'https://example.com/dogs' }),
  ],
  links: [
    { id: 'ab', sourceId: 'a', targetId: 'b', type: 'SUPPORTS' },
    { id: 'ac', sourceId: 'a', targetId: 'c', type: 'RELATED' },
    { id: 'bc', sourceId: 'b', targetId: 'c' },
  ],
  warnings: [],
}

const annotations = new Map([['a', [{ id: 'n', url: 'x', text: 'hi' }]]])

describe('applyFilters', () => {
  it('shows everything with no filters', () => {
    const r = applyFilters(data, EMPTY_FILTERS, annotations)
    expect([...r.itemIds]).toEqual(['a', 'b', 'c'])
    expect(r.linkIds.size).toBe(3)
    expect(isFiltering(EMPTY_FILTERS)).toBe(false)
  })

  it('searches titles, notes, URLs and collection names', () => {
    expect([...applyFilters(data, { ...EMPTY_FILTERS, search: 'CATS' }, annotations).itemIds]).toEqual(['a'])
    expect([...applyFilters(data, { ...EMPTY_FILTERS, search: 'dogs' }, annotations).itemIds]).toEqual(['c'])
    const names = new Map([['g2', 'Reading list']])
    expect([...applyFilters(data, { ...EMPTY_FILTERS, search: 'reading' }, annotations, names).itemIds]).toEqual(['b'])
  })

  it('hides links whose endpoints are hidden', () => {
    const r = applyFilters(data, { ...EMPTY_FILTERS, domains: ['example.com'] }, annotations)
    expect([...r.itemIds]).toEqual(['a', 'c'])
    expect([...r.linkIds]).toEqual(['ac'])
  })

  it('filters by collection, link type (including untyped) and annotation presence', () => {
    expect([...applyFilters(data, { ...EMPTY_FILTERS, groupIds: ['g2'] }, annotations).itemIds]).toEqual(['b'])
    expect([...applyFilters(data, { ...EMPTY_FILTERS, linkTypes: ['SUPPORTS', ''] }, annotations).linkIds]).toEqual(['ab', 'bc'])
    expect([...applyFilters(data, { ...EMPTY_FILTERS, annotations: 'with' }, annotations).itemIds]).toEqual(['a'])
    expect([...applyFilters(data, { ...EMPTY_FILTERS, annotations: 'without' }, annotations).itemIds]).toEqual(['b', 'c'])
  })
})

describe('external items', () => {
  const withExternal: GraphData = {
    items: [item('a'), item('b', { groupIds: ['g2'] }), item('x', { external: { label: 'outside' }, groupIds: [] })],
    links: [
      { id: 'ax', sourceId: 'a', targetId: 'x', type: 'SUPPORTS' },
      { id: 'bx', sourceId: 'b', targetId: 'x', type: 'RELATED' },
    ],
    warnings: [],
  }

  it('shows an external item when a visible link reaches it', () => {
    const r = applyFilters(withExternal, EMPTY_FILTERS, new Map())
    expect([...r.itemIds].sort()).toEqual(['a', 'b', 'x'])
    expect(r.linkIds.size).toBe(2)
  })

  it('hides it when all of its links are filtered out', () => {
    const r = applyFilters(withExternal, { ...EMPTY_FILTERS, linkTypes: ['OPPOSES'] }, new Map())
    expect(r.itemIds.has('x')).toBe(false)
  })

  it('is not affected by item filters such as search', () => {
    const r = applyFilters(withExternal, { ...EMPTY_FILTERS, search: 'a' }, new Map())
    expect([...r.itemIds].sort()).toEqual(['a', 'x'])
  })

  it('can be switched off', () => {
    const r = applyFilters(withExternal, EMPTY_FILTERS, new Map(), new Map(), { showExternal: false })
    expect(r.itemIds.has('x')).toBe(false)
    expect(r.linkIds.size).toBe(0)
  })
})
