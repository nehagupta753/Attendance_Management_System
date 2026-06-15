import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

# Let's find all selectors with :hover
hover_blocks = re.findall(r'([^{}\n]+:hover[^{}]*\{[^{}]*\})', css_content)
print(f"Found {len(hover_blocks)} hover selectors:")
for block in hover_blocks[:30]:
    print(block.strip())
    print("-" * 40)
