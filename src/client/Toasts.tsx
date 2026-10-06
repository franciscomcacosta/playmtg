// The design's toast strip (top centre), used on every page except the lobby (which draws its own).
import React from 'react';
import { useStore } from './store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div aria-live="polite" style={{ position: 'fixed', top: 84, left: '50%', transform: 'translateX(-50%)', zIndex: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            maxWidth: 460, padding: '11px 22px', textAlign: 'center',
            background: 'linear-gradient(90deg,rgba(20,14,6,0),rgba(20,14,6,.95) 15%,rgba(20,14,6,.95) 85%,rgba(20,14,6,0))',
            borderTop: `1px solid ${t.err ? 'rgba(224,105,79,.6)' : 'rgba(201,160,80,.5)'}`, borderBottom: `1px solid ${t.err ? 'rgba(224,105,79,.6)' : 'rgba(201,160,80,.5)'}`,
            fontFamily: 'Cinzel,serif', fontSize: 13, fontWeight: 700, color: t.err ? '#ffb3a3' : '#f7dc9a', animation: 'mfToastIn .3s cubic-bezier(.2,.8,.2,1)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
