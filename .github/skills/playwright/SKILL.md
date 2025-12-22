---
name: playwright
description: How to make good playwright (e2e) tests for this project.
---

# Skill Instructions

- Always look for opportunities to refactor common code to the playwright_helpers.ts file.
- Never use explicit timeouts to wait for things to happen. If you can't get it to work without that, get the user's permission and then record that permission in a comment.
- Never match elements using fragile things like matching on labels, matching on prompts, etc. Add test ID attributes as needed.
- Use inexpensive_model_for_testing from playwright_helpers unless instructed by the user to use a different one. If they agree, record the user's permission as a comment.
- You MUST NOT use mocks.
