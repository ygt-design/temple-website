import { createLabel } from '../../lib/label.ts'

const TEXT = 'cover'
const TEXT_COLOR = '#0000ff'
const FONT_SIZE = 0.18

export const createCover = (width: number, height: number) =>
  createLabel(width, height, TEXT, { color: TEXT_COLOR, fontSize: FONT_SIZE })
