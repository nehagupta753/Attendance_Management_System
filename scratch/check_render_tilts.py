import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Let's search for functions that render views and check their last 15 lines for init3DTilt or similar calls
render_matches = list(re.finditer(r'(async\s+)?function\s+(renderCoord\w+|renderMarkAttendance|renderStudentHistory|renderDashboard)\b', js_content))
for rm in render_matches:
    func_name = re.search(r'render\w+', rm.group()).group()
    # Find the end of the function (by matching braces or searching next 300 lines)
    start_pos = rm.start()
    # Let's search for init3DTilt in the next 150 lines
    scope = js_content[start_pos:start_pos + 4000]
    has_tilt = 'init3DTilt' in scope
    print(f"Function {func_name}: has init3DTilt? {has_tilt}")
