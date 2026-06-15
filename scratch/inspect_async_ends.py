import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Let's search for async rendering functions
view_names = [
    'renderMarkAttendance',
    'renderStudentHistory',
    'renderCoordDashboard',
    'renderCoordAllStudents',
    'renderCoordEditStudents',
    'renderCoordEditAttendance'
]

lines = js_content.split('\n')

for name in view_names:
    print(f"=== {name} ===")
    matches = list(re.finditer(r'async\s+function\s+' + name, js_content))
    if not matches:
        print("  Not found!")
        continue
    start_pos = matches[0].start()
    line_no = js_content.count('\n', 0, start_pos) + 1
    # Search for the function's end by finding the closing brace or looking ahead
    # Let's inspect around where it might end.
    # Since these functions are large, let's find the text where container.innerHTML is set or the end of the function.
    # We can search for the next 'function ' or 'async function ' or we can search for the end of the file.
    end_pos = len(js_content)
    for next_m in re.finditer(r'(async\s+)?function\s+', js_content[start_pos + 10:]):
        end_pos = start_pos + 10 + next_m.start()
        break
    
    # Get the last 15 lines of this function scope
    func_scope = js_content[start_pos:end_pos]
    func_lines = func_scope.strip().split('\n')
    print(f"  Starts at line {line_no}")
    print("  Last 10 lines of scope:")
    for l in func_lines[-12:]:
        print(f"    {l}")
    print("-" * 50)
