// The design's web components (mf-assets.js) used directly in JSX.
import 'react';
type MF = any;
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mf-coin': MF; 'mf-ember': MF; 'mf-xp': MF; 'mf-cardback': MF; 'mf-frame': MF; 'mf-foil': MF; 'mf-rank': MF; 'mf-pack': MF; 'mf-loader': MF; 'mf-booster': MF;
    }
  }
}
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'mf-coin': MF; 'mf-ember': MF; 'mf-xp': MF; 'mf-cardback': MF; 'mf-frame': MF; 'mf-foil': MF; 'mf-rank': MF; 'mf-pack': MF; 'mf-loader': MF; 'mf-booster': MF;
    }
  }
}
