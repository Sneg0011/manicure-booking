'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type Work = {
  src: string;
  width: number;
  height: number;
  chip: string;
  title: string;
  description: string;
  alt: string;
  href: string;
};

export function WorksRail({ works }: { works: Work[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  function updateEdges() {
    const node = rail.current;
    if (node)
      setEdges({
        start: node.scrollLeft <= 2,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2,
      });
  }
  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, []);
  function move(direction: number) {
    const node = rail.current;
    const card = node?.querySelector<HTMLElement>('.work-card');
    if (!node || !card) return;
    node.scrollBy({
      left: direction * (card.offsetWidth + 18),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  return (
    <section className="works-section" id="works">
      <h2 className="giant" aria-label="Работы">
        <span aria-hidden="true">РАБОТЫ</span>
      </h2>
      <div className="works-rail-wrap">
        <div className="works-rail" ref={rail} tabIndex={0} onScroll={updateEdges}>
          {works.map((work) => (
            <article className="work-card" key={work.src}>
              <div className="work-image">
                <Image
                  src={work.src}
                  width={work.width}
                  height={work.height}
                  sizes="(max-width: 760px) 250px, 27vw"
                  alt={work.alt}
                />
                <span className="chip">{work.chip}</span>
              </div>
              <div className="work-copy">
                <h3>{work.title}</h3>
                <p>{work.description}</p>
                <a href={work.href}>
                  Записаться <span aria-hidden="true">→</span>
                </a>
              </div>
            </article>
          ))}
        </div>
        <div className="works-controls">
          <button type="button" aria-label="Назад" disabled={edges.start} onClick={() => move(-1)}>
            ←
          </button>
          <button type="button" aria-label="Вперёд" disabled={edges.end} onClick={() => move(1)}>
            →
          </button>
        </div>
      </div>
    </section>
  );
}
