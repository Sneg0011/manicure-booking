'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Pill } from './pill';

export const coats = [
  {
    id: 'nude',
    name: 'Нюд',
    sample: '#e9c6ae',
    coat: 'transparent',
    coatOn: 0,
    w1: '#fff1e4',
    w2: '#e8c3a3',
    w3: '#8a6048',
    glow: '#5a3a28',
  },
  {
    id: 'milk',
    name: 'Молочный',
    sample: '#f1e8dd',
    coat: '#efe4d8',
    coatOn: 1,
    w1: '#ffffff',
    w2: '#e9dfd4',
    w3: '#8f8377',
    glow: '#4a4038',
  },
  {
    id: 'rose',
    name: 'Розовый',
    sample: '#d98aa0',
    coat: '#d57f99',
    coatOn: 1,
    w1: '#ffe3ea',
    w2: '#ec9db4',
    w3: '#9c4f6b',
    glow: '#6b2640',
  },
  {
    id: 'cherry',
    name: 'Вишня',
    sample: '#7c0f24',
    coat: '#7c0f24',
    coatOn: 1,
    w1: '#ffc9cf',
    w2: '#d24a5c',
    w3: '#6a0f20',
    glow: '#5a0f1e',
  },
  {
    id: 'mocha',
    name: 'Мокко',
    sample: '#5c3a2e',
    coat: '#5c3a2e',
    coatOn: 1,
    w1: '#f3d6c0',
    w2: '#b98163',
    w3: '#54342a',
    glow: '#3f261c',
  },
  {
    id: 'black',
    name: 'Чёрный',
    sample: '#17110f',
    coat: '#17110f',
    coatOn: 1,
    w1: '#ffffff',
    w2: '#b5aeb0',
    w3: '#3a3436',
    glow: '#2c2628',
  },
] as const;

export function HeroTryon({ nextLabel, priceFrom }: { nextLabel: string; priceFrom: string }) {
  const [selected, setSelected] = useState<(typeof coats)[number]>(coats[2]);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--w1', selected.w1);
    root.setProperty('--w2', selected.w2);
    root.setProperty('--w3', selected.w3);
    root.setProperty('--glow', selected.glow);
  }, [selected]);
  const style = {
    '--w1': selected.w1,
    '--w2': selected.w2,
    '--w3': selected.w3,
    '--glow': selected.glow,
    '--coat': selected.coat,
    '--coat-on': selected.coatOn,
  } as CSSProperties;

  return (
    <header className="hero" id="top" style={style}>
      <div className="hero-bar">
        <a className="hero-brand" href="#top">
          <span>лунка</span>
          <small>студия маникюра</small>
        </a>
        <nav aria-label="Разделы">
          <a href="#price">Прайс</a>
          <a href="#works">Работы</a>
          <a href="#masters">Мастера</a>
          <a href="#contacts">Контакты</a>
          <Pill href="/book" rose>
            Записаться
          </Pill>
        </nav>
      </div>
      <h1 className="hero-word" aria-label="Лунка, студия маникюра">
        <span aria-hidden="true">ЛУНКА</span>
      </h1>
      <div className="hero-hand">
        <Image
          src="/photos/hero-hand.webp"
          width={1600}
          height={1711}
          priority
          sizes="(max-width: 760px) 122vw, 58vw"
          alt="Рука с нюдовым маникюром в рукаве с жемчугом"
        />
        <div className="hero-coat" aria-hidden="true" />
        <div className="hero-light" aria-hidden="true" />
        <p className="hero-note">
          <small>Маникюр</small>
          <b>{priceFrom}</b>
        </p>
      </div>
      <div className="hero-side-left">
        <p className="hero-intro">
          Маникюр и педикюр у двух мастеров. Запись онлайн, только на свободное время.
        </p>
        <fieldset className="tryon">
          <legend>Примерьте цвет</legend>
          <div className="tryon-choices">
            {coats.map((color) => (
              <label className="tryon-choice" key={color.id}>
                <input
                  type="radio"
                  name="coat"
                  value={color.id}
                  checked={selected.id === color.id}
                  onChange={() => setSelected(color)}
                />
                <span
                  className="tryon-swatch"
                  style={{ backgroundColor: color.sample }}
                  aria-hidden="true"
                />
                <span className="visually-hidden">{color.name}</span>
              </label>
            ))}
          </div>
          <output aria-live="polite">{selected.name}</output>
        </fieldset>
      </div>
      <div className="hero-side-right">
        <p className="hero-next">
          <small>Ближайшее свободное</small>
          {nextLabel}
        </p>
        <a className="hero-ring" href="/book">
          <span>
            Выбрать
            <br className="desktop-only" /> время
          </span>
        </a>
      </div>
      <svg
        className="hero-wave"
        viewBox="0 0 1440 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="satin-back">
            <stop stopColor="#a8978a" />
            <stop offset=".12" stopColor="#d8ccbf" />
            <stop offset=".21" stopColor="#f6eee4" />
            <stop offset=".3" stopColor="#bfae9f" />
            <stop offset=".5" stopColor="#8f7f73" />
            <stop offset=".7" stopColor="#bfae9f" />
            <stop offset=".79" stopColor="#f6eee4" />
            <stop offset=".88" stopColor="#d8ccbf" />
            <stop offset="1" stopColor="#a8978a" />
          </linearGradient>
          <linearGradient id="satin-mid">
            <stop stopColor="#e6dbcf" />
            <stop offset=".16" stopColor="#fffaf3" />
            <stop offset=".3" stopColor="#d6c9bb" />
            <stop offset=".5" stopColor="#fbf6ef" />
            <stop offset=".7" stopColor="#d6c9bb" />
            <stop offset=".84" stopColor="#fffaf3" />
            <stop offset="1" stopColor="#e6dbcf" />
          </linearGradient>
        </defs>
        <path
          className="wave-back"
          fill="url(#satin-back)"
          d="M0 190 C90 110 190 30 300 24 C400 18 470 120 540 190 C620 268 840 272 930 206 C1010 150 1090 84 1200 78 C1300 72 1380 120 1440 170 L1440 300 L0 300Z"
        />
        <path
          className="wave-sheen"
          d="M0 190 C90 110 190 30 300 24 C400 18 470 120 540 190 C620 268 840 272 930 206 C1010 150 1090 84 1200 78 C1300 72 1380 120 1440 170"
        />
        <path
          className="wave-mid"
          fill="url(#satin-mid)"
          d="M0 236 C120 170 230 110 340 112 C440 114 500 190 580 236 C660 282 800 286 890 250 C980 214 1060 158 1170 152 C1270 146 1360 190 1440 226 L1440 300 L0 300Z"
        />
        <path
          className="wave-sheen"
          d="M0 236 C120 170 230 110 340 112 C440 114 500 190 580 236 C660 282 800 286 890 250 C980 214 1060 158 1170 152 C1270 146 1360 190 1440 226"
        />
        <path
          className="wave-front"
          fill="var(--night)"
          d="M0 286 C170 250 300 226 430 236 C550 246 630 282 730 286 C830 288 930 244 1050 232 C1180 220 1310 246 1440 276 L1440 300 L0 300Z"
        />
      </svg>
    </header>
  );
}
