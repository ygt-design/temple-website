export type SliderDef = { label: string; default: number; range: number[] }
export type SliderGroupDef = Record<string, SliderDef>
export type SliderValues<G extends SliderGroupDef> = Record<keyof G, number>

export const lerp = (range: number[], v: number) => range[0] + (range[1] - range[0]) * (v / 100)

export const sliderDefaults = <G extends SliderGroupDef>(group: G) =>
  Object.fromEntries(Object.keys(group).map((k) => [k, group[k].default])) as SliderValues<G>

export const resolveSliders = <G extends SliderGroupDef>(group: G, values: SliderValues<G>) =>
  Object.fromEntries(
    Object.keys(group).map((k) => [k, lerp(group[k].range, values[k])]),
  ) as SliderValues<G>
