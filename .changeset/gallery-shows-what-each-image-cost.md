---
"bloom-ai-image-tools": patch
---

The gallery now says what each image is: the model that made it, what it cost, how long it took,
the megabytes in and out, and the first line of the prompt, with the whole prompt in a popup on
hover. Ctrl+mouse-wheel zooms the images themselves, wrapping into more rows as they get smaller,
instead of zooming the window. Images whose bytes are no longer in storage hold their place with a
label saying so, rather than collapsing into a broken-image sliver.

Costs read the same everywhere: to the cent, or to a tenth of a cent when they are under one cent.
