import { Fragment, type Ref } from 'react'

type HeroTitleProps = { lines?: string[]; ref?: Ref<HTMLHeadingElement> }

function HeroTitle({ lines = ['Temple of', 'Designers'], ref }: HeroTitleProps) {
  return (
    <div className="hero-title">
      <h1 ref={ref} className="hero-title__text">
        {lines.map((line, i) => (
          <Fragment key={line}>
            {i > 0 && ' '}
            <span className="hero-title__line">{line}</span>
          </Fragment>
        ))}
      </h1>
    </div>
  )
}

export default HeroTitle
