# Retry — your previous output failed validation

Reason: {{reason}}

Output a fresh, complete JSON array that matches the schema exactly. Common pitfalls: missing `body` on a step (every step needs prose, even diagram steps), referencing files or line numbers not in the diff, wrong `panel`/`code` or `panel`/`diagram` pairing, JSON not wrapped in an array. Do not include any prose, markdown fences, or commentary — only the JSON array.
