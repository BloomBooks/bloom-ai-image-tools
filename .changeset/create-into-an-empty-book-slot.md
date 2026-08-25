---
"bloom-ai-image-tools": patch
---

Open on "Create an Image" when the host launches us on an empty book slot.

Bloom now offers "Edit with AI..." on an image placeholder (BL-16744), so the slot named by
`selectedBookImageId` can be one that holds no image. There is nothing to edit there, so the
editor no longer treats it like an ordinary launch target: the slot's placeholder graphic is
kept out of the "Image to Edit" panel, and the tool that makes an image from a description is
opened instead.

The slot itself is remembered, so a result created in that state carries it. That is what
makes the result's "Use this Image" button appear and put the new image into the slot the
user launched on; before, a created image belonged to no slot and the user had to drag it
onto the strip by hand.

An empty slot is also marked as holding no image, and the Book Images strip treats it
accordingly: it is not draggable, it offers no copy or download button, and the target and
reference panels refuse it even if some other route offers it. It is drawn against white,
not against the transparency checkerboard, which would say "this picture has transparent
parts" about a picture that is not there.

Each slot in the strip now shows the label the host gives it, such as "Page 2 - Image 2".
Empty slots all show the same graphic, so on a page with two of them the label is the only
thing that tells the user which slot is which.
