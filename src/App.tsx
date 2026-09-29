import { useRef } from 'react'
import HeroTitle from './components/HeroTitle/HeroTitle.tsx'
import PrismField from './components/PrismField/PrismField.tsx'

function App() {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <>
      <PrismField titleRef={titleRef} />
      <HeroTitle ref={titleRef} />
    </>
  )
}

export default App
