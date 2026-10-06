import type { CardDef } from '../engine/cardTypes';

export type ApiCard = CardDef & { auto?: 'full' | 'partial' | 'manual' };

export async function searchCards(q: string, offset = 0, limit = 60): Promise<{ total: number; cards: ApiCard[] }> {
  const r = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`);
  return r.json();
}

export interface ParsedDeck {
  main: { count: number; card: ApiCard }[];
  side: { count: number; card: ApiCard }[];
  unknown: string[];
  total: number;
}

export async function parseDeck(text: string): Promise<ParsedDeck> {
  const r = await fetch('/api/decks/parse', { method: 'POST', body: JSON.stringify({ text }) });
  return r.json();
}

export async function status(): Promise<{ cards: number; tokens: number; built?: string }> {
  const r = await fetch('/api/status');
  return r.json();
}

export const CARD_BACK = 'back';
