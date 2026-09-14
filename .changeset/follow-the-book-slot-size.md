---
"bloom-ai-image-tools": patch
---

Inside Bloom, every tool that makes the picture for a book slot now asks for the size
Bloom says that slot wants. Bloom already told the editor the slot's pixel size, but only
the Upscale tool listened; Generate Image made a 1024-pixel square for a 1417x945 slot
unless someone hand-picked a size and shape, and the edit tools followed whatever size
the source image happened to be.

The Size picker on Generate Image and Coloring Book has a new first entry, "Auto", showing
the slot's pixels, and it is the default. With Auto selected the Shape control follows the
slot too and says so. Picking a size by hand turns Auto off. Outside Bloom there is no
slot, so Auto stands for the smallest size and the picker looks as it did.

The edit tools with no size picker (Remove Object, Change Ethnicity, Improve Drawing and
the rest) follow the slot whenever Bloom supplies one, keeping a shape you set at the
slot's long edge. Upscale keeps its own Auto option, and the tools that make something
other than the slot's picture (Break Comic, the cast and game-piece sheets, GIF frames,
the palette strip) are unchanged.
