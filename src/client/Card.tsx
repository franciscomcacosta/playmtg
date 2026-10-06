import React from 'react';
import type { CardDef } from '../engine/cardTypes';
import type { CardView } from '../engine/engine';

export function cardImage(def: CardDef | undefined, face = 0): string | undefined {
  if (!def) return undefined;
  if (def.faces && def.faces.length > 1 && def.faces[face]?.image && ['transform', 'modal_dfc', 'meld', 'reversible_card', 'battle'].includes(def.layout)) return def.faces[face].image;
  return def.image ?? def.faces?.[0]?.image;
}

export function CardBack({ small }: { small?: boolean }) {
  return (
    <div className={`card-back ${small ? 'small' : ''}`}>
      <div className="card-back-inner">
        <span>◆</span>
      </div>
    </div>
  );
}

/** Text-only fallback frame for cards without an image (e.g. custom tokens). */
function TextCard({ def, name }: { def?: CardDef; name: string }) {
  return (
    <div className="text-card">
      <div className="tc-name">{name}</div>
      <div className="tc-type">{def?.typeLine}</div>
      <div className="tc-text">{def?.oracle}</div>
      {def?.power != null && (
        <div className="tc-pt">
          {def.power}/{def.toughness}
        </div>
      )}
    </div>
  );
}

export interface CardProps {
  card: CardView;
  def?: CardDef;
  onClick?: (e: React.MouseEvent) => void;
  onContext?: (e: React.MouseEvent) => void;
  onHover?: (iid: string | null) => void;
  selected?: boolean;
  targetable?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  dim?: boolean;
  small?: boolean;
  showPT?: boolean;
  badge?: string;
}

export function Card({ card, def, onClick, onContext, onHover, selected, targetable, attacking, blocking, dim, small, showPT = true, badge }: CardProps) {
  const hidden = card.hidden || !def;
  const img = hidden ? undefined : cardImage(def, card.face ?? 0);
  const name = def?.faces && def.faces.length > 1 && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[card.face ?? 0]?.name : def?.name;
  const isCreature = (card as any).types?.includes('creature');
  const basePow = def?.faces && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[card.face ?? 0]?.power : def?.power;
  const baseTou = def?.faces && ['transform', 'modal_dfc'].includes(def.layout) ? def.faces[card.face ?? 0]?.toughness : def?.toughness;
  const counters = Object.entries(card.counters ?? {}).filter(([, v]) => v);
  const cls = [
    'card',
    small ? 'small' : '',
    card.tapped ? 'tapped' : '',
    selected ? 'selected' : '',
    targetable ? 'targetable' : '',
    attacking ? 'attacking' : '',
    blocking ? 'blocking' : '',
    dim ? 'dim' : '',
    card.playable && !targetable && !selected ? 'playable' : '',
    card.sick && isCreature && card.zone === 'battlefield' ? 'sick' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      data-iid={card.iid}
      onClick={onClick}
      onContextMenu={(e) => {
        if (onContext) {
          e.preventDefault();
          onContext(e);
        }
      }}
      onMouseEnter={() => onHover?.(card.iid)}
      onMouseLeave={() => onHover?.(null)}
      title={hidden ? '' : name}
    >
      {hidden || card.faceDown ? <CardBack small={small} /> : img ? <img src={img} alt={name} loading="lazy" draggable={false} /> : <TextCard def={def} name={name ?? '?'} />}
      {card.faceDown && !hidden && <div className="facedown-peek">{name}</div>}
      {showPT && isCreature && card.p != null && (
        <div className={`pt ${card.p! > +(basePow ?? 0) || card.t! > +(baseTou ?? 0) ? 'up' : ''} ${card.p! < +(basePow ?? 0) || card.t! < +(baseTou ?? 0) ? 'down' : ''}`}>
          {card.p}/{(card.t ?? 0) - (card.damage ?? 0)}
          {card.damage ? <span className="dmg">({card.damage}✹)</span> : null}
        </div>
      )}
      {counters.length > 0 && (
        <div className="counters">
          {counters.map(([k, v]) => (
            <span key={k} className={`counter c-${k.replace(/[^a-z0-9]/gi, '')}`}>
              {k === 'loyalty' ? `◆${v}` : k === '+1/+1' ? `+${v}` : k === '-1/-1' ? `−${v}` : `${k} ${v}`}
            </span>
          ))}
        </div>
      )}
      {badge && <div className="card-badge">{badge}</div>}
      {(card as any).classLevel > 1 && <div className="lvl-chip">Lv {(card as any).classLevel}</div>}
      {(card as any).auto === 'manual' && <div className="auto-flag" title="Not automated — resolve by hand">✋</div>}
    </div>
  );
}
