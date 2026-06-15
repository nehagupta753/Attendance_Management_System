import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace Dashboard Overview
content = content.replace('Dashboard Overview', 'Welcome back, Admin 👋')

# 2. Section options from A, B, C to 1, 2, 3, 4, 5 in history filter
content = re.sub(
    r'<option value="A" \${currentState\.historyFilters\.section === \'A\' \? \'selected\' : \'\'}>A</option>.*?</option>',
    '''<option value="1" ${currentState.historyFilters.section === '1' ? 'selected' : ''}>1</option>
                    <option value="2" ${currentState.historyFilters.section === '2' ? 'selected' : ''}>2</option>
                    <option value="3" ${currentState.historyFilters.section === '3' ? 'selected' : ''}>3</option>
                    <option value="4" ${currentState.historyFilters.section === '4' ? 'selected' : ''}>4</option>
                    <option value="5" ${currentState.historyFilters.section === '5' ? 'selected' : ''}>5</option>''',
    content, flags=re.DOTALL
)

# 3. Replace all section text inputs with selects
content = re.sub(
    r'<input type="text" id="([^"]*section)" list="[^"]*" placeholder="[^"]*" required>',
    r'<select id="\1" required><option value="" disabled selected>Select Section</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>',
    content
)
content = re.sub(
    r'<input type="text" id="([^"]*section)" list="[^"]*" value="\${([^}]*)}" required>',
    r'<select id="\1" required><option value="1" ${ \2 === "1" ? "selected" : "" }>1</option><option value="2" ${ \2 === "2" ? "selected" : "" }>2</option><option value="3" ${ \2 === "3" ? "selected" : "" }>3</option><option value="4" ${ \2 === "4" ? "selected" : "" }>4</option><option value="5" ${ \2 === "5" ? "selected" : "" }>5</option></select>',
    content
)

# 4. Replace all year text inputs with selects
content = re.sub(
    r'<input type="text" id="([^"]*year)" list="[^"]*" placeholder="[^"]*" required>',
    r'<select id="\1" required><option value="" disabled selected>Select Year</option><option value="1st">1st</option><option value="2nd">2nd</option><option value="3rd">3rd</option><option value="4th">4th</option></select>',
    content
)
content = re.sub(
    r'<input type="text" id="([^"]*year)" list="[^"]*" value="\${([^}]*)}" required>',
    r'<select id="\1" required><option value="1st" ${ \2 === "1st" ? "selected" : "" }>1st</option><option value="2nd" ${ \2 === "2nd" ? "selected" : "" }>2nd</option><option value="3rd" ${ \2 === "3rd" ? "selected" : "" }>3rd</option><option value="4th" ${ \2 === "4th" ? "selected" : "" }>4th</option></select>',
    content
)

# 5. In add new subject, add a branch option (IT, DS)
# Original:
# <div class="form-group"><label>Department</label><input type="text" id="sb-dept" value="${currentState.selectedDept || ''}" required></div>
# </form>
subject_form_replacement = r'''<div class="form-group"><label>Department</label><input type="text" id="sb-dept" value="${currentState.selectedDept || ''}" readonly required style="background: var(--bg-dark); color: var(--text-muted); cursor: not-allowed; opacity: 0.8;"></div>
            <div class="form-group">
                <label>Branch</label>
                <select id="sb-branch" required>
                    <option value="" disabled selected>Select Branch</option>
                    ${currentState.selectedDept === 'IT' ? `
                        <option value="IT">IT</option>
                        <option value="DS">DS</option>
                    ` : `
                        <option value="${currentState.selectedDept}">${currentState.selectedDept}</option>
                    `}
                </select>
            </div>'''
content = re.sub(r'<div class="form-group"><label>Department</label><input type="text" id="sb-dept" value="\${currentState\.selectedDept \|\| \'\'}" required></div>', subject_form_replacement, content)

# 6. In Class Management / Add Class, branch options as IT and DS
class_form_replacement = r'''<div class="form-group">
                <label>Branch</label>
                <select id="c-branch" required>
                    <option value="" disabled selected>Select Branch</option>
                    ${currentState.selectedDept === 'IT' ? `
                        <option value="IT">IT</option>
                        <option value="DS">DS</option>
                    ` : `
                        <option value="${currentState.selectedDept}">${currentState.selectedDept}</option>
                    `}
                </select>
            </div>'''
content = re.sub(r'<div class="form-group"><label>Branch</label><input type="text" id="c-branch" list="dl-branch" value="\${currentState\.selectedBranch \|\| \'\'}" required></div>', class_form_replacement, content)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
