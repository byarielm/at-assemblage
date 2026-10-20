import { chooseSides, type Rect } from './edgeSides'

const card = (x: number, y: number): Rect => ({ x, y, width: 260, height: 120 })

describe('chooseSides', () => {
  const origin = card(0, 0)

  it('connects side by side cards horizontally, in either direction', () => {
    expect(chooseSides(origin, card(400, 20))).toEqual({ source: 'right', target: 'left' })
    expect(chooseSides(origin, card(-400, -20))).toEqual({ source: 'left', target: 'right' })
  })

  it('connects stacked cards vertically, in either direction', () => {
    expect(chooseSides(origin, card(30, 300))).toEqual({ source: 'bottom', target: 'top' })
    expect(chooseSides(origin, card(-30, -300))).toEqual({ source: 'top', target: 'bottom' })
  })

  it('uses the larger clear gap for diagonal placements', () => {
    // 340px apart horizontally (80px clear) vs 400px vertically (280px clear): vertical wins.
    expect(chooseSides(origin, card(340, 400))).toEqual({ source: 'bottom', target: 'top' })
    // 700px horizontally (440px clear) vs 200px vertically (80px clear): horizontal wins.
    expect(chooseSides(origin, card(700, 200))).toEqual({ source: 'right', target: 'left' })
  })

  it('still picks facing sides when cards overlap', () => {
    expect(chooseSides(origin, card(50, 10))).toEqual({ source: 'right', target: 'left' })
  })
})
