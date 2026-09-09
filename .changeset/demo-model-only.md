---
"bloom-ai-image-tools": patch
---

Honor a host's demo mode as a limit on which model may run, not only on credentials.
`IBloomHostInitPayload.demoOnly` now means the session is limited to the demo model (the
free local dummy, which never calls OpenRouter): the hosted shell passes it to the new
`setDemoModelOnly()`, every tool's model list becomes that model alone whatever the host
says about developer tools, and `resolveToolModelId` cannot fall back to a paid model.
Bloom sends `demoOnly` when the collection's subscription does not cover AI image editing
-- a Playground book opens the editor regardless -- and withholds the OpenRouter key in
that case, so a paid model has neither an option in the picker nor a key to run on.
