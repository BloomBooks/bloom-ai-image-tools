---
"bloom-ai-image-tools": patch
---

Rename `IBloomHostInitPayload.demoOnly` to `playgroundMode`, and tell a playground session
what it can do. On opening, a dialog says "In the playground mode you can look around but
you can't yet use the AI image generators."; the offer to connect an OpenRouter account is
gone, since this session cannot use one. Tools whose run would reach OpenRouter stay
disabled, with "Not available in playground mode" as the reason. The dev harness flag is
now `?playground=on`.
