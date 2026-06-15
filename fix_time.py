import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Patch renderTimetable
render_tt_pattern = r'''    const grid = {};
    days\.forEach\(d => \{
        grid\[d\] = \{\};
        timeSlots\.forEach\(ts => \{
            grid\[d\]\[ts\] = filtered\.find\(t => t\.day_of_week === d && `\$\{t\.start_time\}-\$\{t\.end_time\}` === ts\);
        \}\);
    \}\);'''

render_tt_replacement = r'''    const formatDbTime = (dbTime) => {
        if (!dbTime) return '';
        const parts = dbTime.split(':');
        const hr = parseInt(parts[0], 10);
        const min = parts[1];
        if (hr === 10 || hr === 11 || hr === 12) return `${hr}.${min}`;
        return `${hr > 12 ? hr - 12 : hr}.${min}`;
    };

    const grid = {};
    days.forEach(d => {
        grid[d] = {};
        timeSlots.forEach(ts => {
            grid[d][ts] = filtered.find(t => {
                const tStart = formatDbTime(t.start_time);
                const tEnd = formatDbTime(t.end_time);
                return t.day_of_week === d && `${tStart}-${tEnd}` === ts;
            });
        });
    });'''

content = content.replace(render_tt_pattern.replace('\\.', '.').replace('\\[', '[').replace('\\]', ']').replace('\\{', '{').replace('\\}', '}').replace('\\(', '(').replace('\\)', ')').replace('\\$', '$'), render_tt_replacement)


# 2. Patch showAddTimetableModal insertion data
modal_pattern = r'''        const \[startVal, endVal\] = timeVal\.split\('-'\);

        // Get class ID
        const classObj = currentState\.classes\.find\(c => 
            c\.branch === branchVal && 
            c\.year === yearVal && 
            c\.section === sectionVal
        \);

        if \(!classObj\) return showToast\('Class not found\. Create it first in Class Management\.', 'error'\);

        const data = \{
            teacher_id: teacherId,
            subject_id: subjectId,
            class_id: classObj\.id,
            day_of_week: dayVal,
            start_time: startVal,
            end_time: endVal
        \};'''

modal_replacement = r'''        const [startVal, endVal] = timeVal.split('-');

        const timeMap = {
            '10.30': '10:30:00',
            '11.20': '11:20:00',
            '12.10': '12:10:00',
            '1.00': '13:00:00',
            '1.50': '13:50:00',
            '2.40': '14:40:00',
            '3.30': '15:30:00',
            '4.15': '16:15:00',
            '5.00': '17:00:00'
        };
        const dbStart = timeMap[startVal];
        const dbEnd = timeMap[endVal];

        // Get class ID
        const classObj = currentState.classes.find(c => 
            c.branch === branchVal && 
            c.year === yearVal && 
            c.section === sectionVal
        );

        if (!classObj) return showToast('Class not found. Create it first in Class Management.', 'error');

        const data = {
            teacher_id: teacherId,
            subject_id: subjectId,
            class_id: classObj.id,
            day_of_week: dayVal,
            start_time: dbStart,
            end_time: dbEnd
        };'''

content = content.replace(modal_pattern.replace('\\.', '.').replace('\\[', '[').replace('\\]', ']').replace('\\{', '{').replace('\\}', '}').replace('\\(', '(').replace('\\)', ')'), modal_replacement)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
