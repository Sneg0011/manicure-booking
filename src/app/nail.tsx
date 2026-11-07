export function Nail() {
  return (
    <svg className="hero-nail" viewBox="0 0 300 1000" aria-hidden="true">
      <defs>
        <linearGradient id="skin" x1="0" x2="1">
          <stop offset="0" stopColor="#b98468" />
          <stop offset=".22" stopColor="#dcae93" />
          <stop offset=".55" stopColor="#e6bda3" />
          <stop offset=".85" stopColor="#d2a083" />
          <stop offset="1" stopColor="#a97458" />
        </linearGradient>
        <linearGradient id="gel" x1="0" x2="1">
          <stop offset="0" stopColor="#d59f83" />
          <stop offset=".12" stopColor="#eec5ad" />
          <stop offset=".5" stopColor="#f6d8c6" />
          <stop offset=".86" stopColor="#ecbfa6" />
          <stop offset="1" stopColor="#c58d70" />
        </linearGradient>
        <linearGradient id="tip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".75" />
        </linearGradient>
        <filter id="soft" x="-40%" y="-10%" width="180%" height="120%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="blur3">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path
        d="M38 -20 C34 120 40 210 66 250 L234 250 C260 210 266 120 262 -20Z"
        fill="url(#skin)"
      />
      <path
        d="M70 215 C70 150 110 118 150 118 C190 118 230 150 230 215 C238 500 196 860 164 958 C158 978 142 978 136 958 C104 860 62 500 70 215Z"
        fill="#6b4634"
        opacity=".34"
        filter="url(#soft)"
        transform="translate(16 18)"
      />
      <path
        d="M66 214 C66 146 108 112 150 112 C192 112 234 146 234 214 C242 500 198 860 165 958 C158 980 142 980 135 958 C102 860 58 500 66 214Z"
        fill="url(#gel)"
      />
      <path
        d="M84 196 C92 150 120 130 150 130 C180 130 208 150 216 196 C190 176 110 176 84 196Z"
        fill="#fff4ec"
        opacity=".78"
        filter="url(#blur3)"
      />
      <path
        d="M192 190 C198 460 180 760 158 930 C166 760 182 470 178 190Z"
        fill="#fff"
        opacity=".92"
        filter="url(#blur3)"
      />
      <path
        d="M100 230 C104 420 118 620 132 780 C112 620 92 420 90 230Z"
        fill="#fff"
        opacity=".28"
        filter="url(#blur3)"
      />
      <path
        d="M66 214 C66 146 108 112 150 112 C192 112 234 146 234 214 C242 500 198 860 165 958 C158 980 142 980 135 958 C102 860 58 500 66 214Z"
        fill="url(#tip)"
      />
    </svg>
  );
}
