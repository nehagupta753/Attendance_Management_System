import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

matches = list(re.finditer(r'IntersectionObserver', js_content, re.IGNORECASE))
print(f"Found {len(matches)} IntersectionObserver matches.")
