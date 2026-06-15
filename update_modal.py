import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = r'''window.showAddTimetableModal = (presetDay = '', presetTime = '') => {
    const tFilters = currentState.timetableFilters || {};
    const branches = currentState.selectedDept === 'IT' ? ['IT', 'DS'] : [currentState.selectedDept];
    
    const scopedTeachers = currentState.teachers.filter(t => t.department === currentState.selectedDept);
    const scopedSubjects = currentState.subjects.filter(s => s.department === currentState.selectedDept);

    showModal('Schedule Lecture', `
        <form id="add-timetable-form">
            <div class="form-group" style="margin-top: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <label>Day of Week</label>
                    <select id="tt-day" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Day</option>
                        ${['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'].map(d => `<option value="${d}" ${presetDay === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label>Time Slot</label>
                    <select id="tt-time" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Slot</option>
                        ${['10.30-11.20', '11.20-12.10', '12.10-1.00', '1.50-2.40', '2.40-3.30', '3.30-4.15', '4.15-5.00'].map(ts => `<option value="${ts}" ${presetTime === ts ? 'selected' : ''}>${ts}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div class="form-group" style="margin-top: 1rem;">
                <label>Teacher</label>
                <select id="tt-teacher" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                    <option value="" disabled selected>Select Teacher</option>
                    ${scopedTeachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group" style="margin-top: 1rem;">
                <label>Subject</label>
                <select id="tt-subject" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                    <option value="" disabled selected>Select Subject</option>
                    ${scopedSubjects.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('')}
                </select>
            </div>

            <div class="form-group" style="margin-top: 1.5rem; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                <div>
                    <label>Branch</label>
                    <select id="tt-branch" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Branch</option>
                        ${branches.map(b => `<option value="${b}" ${tFilters.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label>Year</label>
                    <select id="tt-year" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Year</option>
                        <option value="1st" ${tFilters.year === '1st' ? 'selected' : ''}>1st</option>
                        <option value="2nd" ${tFilters.year === '2nd' ? 'selected' : ''}>2nd</option>
                        <option value="3rd" ${tFilters.year === '3rd' ? 'selected' : ''}>3rd</option>
                        <option value="4th" ${tFilters.year === '4th' ? 'selected' : ''}>4th</option>
                    </select>
                </div>
                <div>
                    <label>Section</label>
                    <select id="tt-section" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Section</option>
                        <option value="1" ${tFilters.section === '1' ? 'selected' : ''}>1</option>
                        <option value="2" ${tFilters.section === '2' ? 'selected' : ''}>2</option>
                        <option value="3" ${tFilters.section === '3' ? 'selected' : ''}>3</option>
                        <option value="4" ${tFilters.section === '4' ? 'selected' : ''}>4</option>
                        <option value="5" ${tFilters.section === '5' ? 'selected' : ''}>5</option>
                    </select>
                </div>
            </div>
        </form>
    `, async () => {
        const dayVal = document.getElementById('tt-day').value;
        const timeVal = document.getElementById('tt-time').value;
        const teacherId = document.getElementById('tt-teacher').value;
        const subjectId = document.getElementById('tt-subject').value;
        const branchVal = document.getElementById('tt-branch').value;
        const yearVal = document.getElementById('tt-year').value;
        const sectionVal = document.getElementById('tt-section').value;

        if (!dayVal || !timeVal || !teacherId || !subjectId || !branchVal || !yearVal || !sectionVal) {
            showToast('All fields are required', 'error');
            return;
        }

        const [startVal, endVal] = timeVal.split('-');

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
            start_time: startVal,
            end_time: endVal
        };

        const { error } = await supabaseClient.from('timetable').insert([data]);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); closeModal(); renderActiveView(); showToast('Lecture scheduled!'); }
    });
};
'''

content = re.sub(r'window\.showAddTimetableModal = \(\) => \{.*', replacement, content, flags=re.DOTALL)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
