// Ткань между разделами: гребень в центре, чтобы руки выходили из неё, а текст по бокам оставался свободным.
export function Satin() {
  return (
    <svg className="satin" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="satin-hump">
          <stop stopColor="#a8978a" />
          <stop offset=".3" stopColor="#c9baac" />
          <stop offset=".5" stopColor="#f3eadf" />
          <stop offset=".7" stopColor="#c9baac" />
          <stop offset="1" stopColor="#a8978a" />
        </linearGradient>
      </defs>
      <path
        className="wave-back"
        fill="url(#satin-hump)"
        d="M0 250 C160 250 300 230 420 170 C520 110 600 40 720 36 C840 40 930 120 1040 176 C1150 226 1300 250 1440 244 L1440 300 L0 300Z"
      />
      <path
        className="wave-sheen"
        d="M0 250 C160 250 300 230 420 170 C520 110 600 40 720 36 C840 40 930 120 1040 176 C1150 226 1300 250 1440 244"
      />
      <path
        className="wave-mid"
        fill="url(#satin-mid)"
        d="M0 274 C180 272 330 256 450 206 C550 160 630 104 730 100 C830 100 920 160 1030 210 C1150 256 1290 272 1440 268 L1440 300 L0 300Z"
      />
      <path
        className="wave-sheen"
        d="M0 274 C180 272 330 256 450 206 C550 160 630 104 730 100 C830 100 920 160 1030 210 C1150 256 1290 272 1440 268"
      />
      <path
        className="wave-front"
        fill="var(--night)"
        d="M0 292 C220 290 400 280 540 256 C620 240 680 226 740 224 C810 226 880 244 960 258 C1120 282 1290 292 1440 288 L1440 300 L0 300Z"
      />
    </svg>
  );
}
