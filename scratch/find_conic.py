import sys

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out_lines = []
for idx, line in enumerate(lines):
    if 'conic-gradient' in line:
        out_lines.append(f"Line {idx+1}: {line.strip()}")

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\scratch\conic_matches.txt', 'w', encoding='utf-8') as f_out:
    f_out.write('\n'.join(out_lines))

print(f"Found {len(out_lines)} matches.")
