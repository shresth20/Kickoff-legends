window.FC = window.FC || {};

// To add a character: give it an id and a palette (used by the placeholder
// art), then put its PNG parts in assets/characters/<id>/ (see RIG_SPEC.md).
// Any part that is missing falls back to the placeholder.
FC.CHARACTERS = [
  {
    id: 'blaze',
    name: 'Blaze',
    palette: {
      skin: '#f2b98a', hair: '#d8402f', jersey: '#e53935', jerseyDark: '#a82522',
      shorts: '#222831', socks: '#f5f5f5', boots: '#fdd835', sole: '#5d4037',
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    palette: {
      skin: '#c98f62', hair: '#e8f4ff', jersey: '#4fc3f7', jerseyDark: '#1f86b8',
      shorts: '#f5f5f5', socks: '#1f86b8', boots: '#263238', sole: '#90a4ae',
    },
  },
];
