import React from "react";

// Classic checkerboard drawn behind images so transparent regions read as
// transparent (rather than blending into whatever pane they sit in). Shared by
// the result/thumbnail slots (ImageSlot) and the full-screen gallery.
const TRANSPARENCY_TILE_SIZE = 16;
const TRANSPARENCY_BLOOM_BLUE = "rgba(29, 143, 175, 0.2)";
const TRANSPARENCY_PATTERN_SIZE = TRANSPARENCY_TILE_SIZE * 2;

const TRANSPARENCY_CHECKERBOARD_IMAGE = (() => {
  const tile = TRANSPARENCY_TILE_SIZE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile * 2}" height="${
    tile * 2
  }" shape-rendering="crispEdges"><rect width="${tile}" height="${tile}" fill="${TRANSPARENCY_BLOOM_BLUE}"/><rect x="${tile}" y="${tile}" width="${tile}" height="${tile}" fill="${TRANSPARENCY_BLOOM_BLUE}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

// Classic checkerboard of Bloom blue and white for transparent regions.
export const TRANSPARENCY_BACKGROUND_STYLE: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage: TRANSPARENCY_CHECKERBOARD_IMAGE,
  backgroundSize: `${TRANSPARENCY_PATTERN_SIZE}px ${TRANSPARENCY_PATTERN_SIZE}px`,
};
