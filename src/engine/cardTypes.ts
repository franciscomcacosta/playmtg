// Compact card definition built from Scryfall's oracle bulk data.

export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracle: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  image?: string;
}

export interface CardDef {
  id: string; // oracle id
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracle: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  layout: string;
  produced?: string[];
  faces?: CardFace[];
  image?: string; // normal-size image
  art?: string; // art crop
  set?: string;
  rarity?: string;
  legal?: string[]; // formats where legal
  token?: boolean;
}

export function frontFace(def: CardDef): CardFace {
  if (def.faces && def.faces.length && ['transform', 'modal_dfc', 'meld', 'reversible_card', 'battle'].includes(def.layout)) {
    return def.faces[0];
  }
  return {
    name: def.name,
    manaCost: def.manaCost,
    typeLine: def.typeLine,
    oracle: def.oracle,
    power: def.power,
    toughness: def.toughness,
    loyalty: def.loyalty,
    defense: def.defense,
    colors: def.colors,
    image: def.image,
  };
}
