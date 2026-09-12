---
"bloom-ai-image-tools": patch
---

The model picker offers a Quality setting for GPT Image 2.5 (Auto, Low, Medium, High,
Extra high, Max). It starts at Auto, which is what every request sent before, so nothing
changes until someone picks. Measured on a 1024x1024 generation, Low returned in 7.7s
against about 13s at Auto for the same price; how Low looks on book art is for you to
judge.

Size labels now say what GPT Image 2.5 will actually be sent. That model takes exact
pixels within a budget (at most 3840 on an edge, at most about 8.3 million pixels), so
the size picker reads "2880x2880" where it used to read "4k", and the Upscale tool's
"4K" option reads the size that fits (3520 x 2352 for a 3:2 image) rather than 4096 on
the long edge. Two sizes that come out the
same ("512k" and "1k" both become 1024) are offered once. The Gemini models, which take
the tier names as they are, keep their labels.

The reasoning picker for Gemini 3 Pro Image no longer offers Medium. Google documents
Low and High for that model; Medium was accepted but silently turned into one of those.
