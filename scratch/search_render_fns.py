import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Let's search for functions that render view content
matches = list(re.finditer(r'function\s+render\w+|async\s+function\s+render\w+', js_content))
print("Rendering functions in app.js:")
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    print(f"  Line {line_no}: {m.group()}")
