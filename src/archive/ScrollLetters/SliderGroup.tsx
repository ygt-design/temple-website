import type { Dispatch, SetStateAction } from 'react'
import type { SliderGroupDef, SliderValues } from './sliderValues.ts'

type Props<G extends SliderGroupDef> = {
  group: G
  values: SliderValues<G>
  setValues: Dispatch<SetStateAction<SliderValues<G>>>
}

function SliderGroup<G extends SliderGroupDef>({ group, values, setValues }: Props<G>) {
  return (Object.keys(group) as (keyof G & string)[]).map((k) => (
    <label key={k} className="scroll-letters__slider">
      <span className="scroll-letters__slider-label">{group[k].label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={values[k]}
        onChange={(e) => setValues((v) => ({ ...v, [k]: Number(e.target.value) }))}
      />
    </label>
  ))
}

export default SliderGroup
