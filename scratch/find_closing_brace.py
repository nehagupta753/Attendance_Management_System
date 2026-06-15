with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

lines = js_content.split('\n')

# Find start of renderCoordEditAttendance
start_idx = -1
for idx, line in enumerate(lines):
    if 'async function renderCoordEditAttendance' in line:
        start_idx = idx
        break

if start_idx == -1:
    print("Function not found!")
    exit(1)

# Find closing brace by matching opening and closing braces
open_braces = 0
closing_idx = -1
for idx in range(start_idx, len(lines)):
    line = lines[idx]
    open_braces += line.count('{')
    open_braces -= line.count('}')
    if open_braces == 0:
        closing_idx = idx
        break

print(f"Function starts on line {start_idx+1}")
print(f"Function ends on line {closing_idx+1}:")
for idx in range(closing_idx - 5, closing_idx + 2):
    print(f"  {idx+1}: {lines[idx]}")
