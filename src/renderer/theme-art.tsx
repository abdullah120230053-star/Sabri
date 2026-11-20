import { useRef, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import light from './assets/theme-art/light.webp';
import dark from './assets/theme-art/dark.webp';
import racing from './assets/theme-art/f1.webp';
import cyberpunk from './assets/theme-art/cyberpunk.webp';
import nature from './assets/theme-art/nature.webp';
import football from './assets/theme-art/football.webp';
import anime from './assets/theme-art/anime.webp';
import islamic from './assets/theme-art/islamic.webp';

export const artwork: Record<string,string> = { light,dark,f1:racing,cyberpunk,nature,football,anime,islamic };
const particles: Record<string,string> = { light:'✧',dark:'✦',f1:'▪',cyberpunk:'✦',nature:'❧',football:'◦',anime:'✿',islamic:'✧' };
export function ThemeArt({ theme,motion }: { theme: string; motion: boolean }) {
  const art = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const animate = motion && !reduced;
  return <div className={'theme-scene '+(animate ? 'theme-scene-moving':'')} data-art={theme} aria-hidden="true" ref={art}
    onPointerMove={(event) => {
      if (!animate || !art.current || event.pointerType !== 'mouse') return;
      const rect = art.current.getBoundingClientRect();
      art.current.style.setProperty('--scene-y',((event.clientX-rect.left)/rect.width-.5)*11+'deg');
      art.current.style.setProperty('--scene-x',((event.clientY-rect.top)/rect.height-.5)*-9+'deg');
    }} onPointerLeave={() => {
      art.current?.style.setProperty('--scene-y','0deg');
      art.current?.style.setProperty('--scene-x','0deg');
    }}>
    <div className="scene-picture"><img key={theme} src={artwork[theme] ?? light} alt="" fetchPriority="high" draggable="false"/></div>
    <div className="scene-light"/>
    {animate && Array.from({ length:6 },(_,index) => <i key={index} className="scene-particle" style={{ '--particle-index':index } as CSSProperties}>{particles[theme] ?? '✧'}</i>)}
  </div>;
}

