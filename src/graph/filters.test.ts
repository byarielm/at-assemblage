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
