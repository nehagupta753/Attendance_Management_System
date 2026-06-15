import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

matches = list(re.finditer(r'html|body', css_content, re.IGNORECASE))
print(f"Found {len(matches)} html/body matches.")
for m in matches[:10]:
    line_no = css_content.count('\n', 0, m.start()) + 1
    lines = css_content.split('\n')
    print(f"Line {line_no}: {lines[line_no-1].strip()}")
