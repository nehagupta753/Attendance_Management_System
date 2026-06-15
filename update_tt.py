import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace renderTimetable
render_timetable_pattern = r'function renderTimetable\(container\).*?(?=\nfunction renderMonitoring|\nwindow\.showAddTeacherModal)'
render_timetable_replacement = r'''function renderTimetable(container) {
    if (!currentState.timetableFilters) {
        currentState.timetableFilters = {
            year: '',
            branch: currentState.selectedDept === 'IT' ? 'IT' : currentState.selectedDept,
            section: ''
        };
    }

    const filters = currentState.timetableFilters;
    const branches = currentState.selectedDept === 'IT' ? ['IT', 'DS'] : [currentState.selectedDept];
    
    const coordinator = currentState.teachers.find(t => t.department === currentState.selectedDept && t.is_coordinator);
    const coordinatorName = coordinator ? coordinator.name : 'Not Assigned';

    const filtered = currentState.timetable.filter(t => {
        return (!filters.year || t.classes?.year === filters.year) &&
               (!filters.branch || t.classes?.branch === filters.branch) &&
               (!filters.section || t.classes?.section === filters.section);
    });

    const timeSlots = ['10.30-11.20', '11.20-12.10', '12.10-1.00', '1.00-1.50', '1.50-2.40', '2.40-3.30', '3.30-4.15', '4.15-5.00'];
    const days = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'];

    const grid = {};
    days.forEach(d => {
        grid[d] = {};
        timeSlots.forEach(ts => {
            grid[d][ts] = filtered.find(t => t.day_of_week === d && `${t.start_time}-${t.end_time}` === ts);
        });
    });

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Timetable Schedule</h1>
            <button class="btn-primary" onclick="showAddTimetableModal()">+ Schedule Lecture</button>
        </div>

        <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end; margin-bottom: 2rem;">
            <div class="form-group">
                <label>Branch</label>
                <select onchange="updateTimetableFilter('branch', this.value)">
                    <option value="" disabled>Select Branch</option>
                    ${branches.map(b => `<option value="${b}" ${filters.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Year</label>
                <select onchange="updateTimetableFilter('year', this.value)">
                    <option value="">Select Year</option>
                    <option value="1st" ${filters.year === '1st' ? 'selected' : ''}>1st</option>
                    <option value="2nd" ${filters.year === '2nd' ? 'selected' : ''}>2nd</option>
                    <option value="3rd" ${filters.year === '3rd' ? 'selected' : ''}>3rd</option>
                    <option value="4th" ${filters.year === '4th' ? 'selected' : ''}>4th</option>
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select onchange="updateTimetableFilter('section', this.value)">
                    <option value="">Select Section</option>
                    <option value="1" ${filters.section === '1' ? 'selected' : ''}>1</option>
                    <option value="2" ${filters.section === '2' ? 'selected' : ''}>2</option>
                    <option value="3" ${filters.section === '3' ? 'selected' : ''}>3</option>
                    <option value="4" ${filters.section === '4' ? 'selected' : ''}>4</option>
                    <option value="5" ${filters.section === '5' ? 'selected' : ''}>5</option>
                </select>
            </div>
        </div>

        ${(!filters.year || !filters.branch || !filters.section) ? `
            <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="calendar" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.5;"></i>
                <h2>Select Class</h2>
                <p>Please select Branch, Year, and Section to view the timetable grid.</p>
            </div>
        ` : `
            <div class="card" style="margin-bottom: 2rem; background: var(--bg-dark); border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                    <div style="font-weight: 700; color: var(--primary); font-size: 1.25rem;">Class: ${filters.branch} ${filters.year} - Sec ${filters.section}</div>
                    <div style="font-weight: 600; color: var(--accent); font-size: 1.25rem;">Coordinator: ${coordinatorName}</div>
                </div>
            </div>

            <div class="card" style="padding: 0; overflow-x: auto;">
                <div class="table-container" style="margin: 0; padding: 0;">
                    <table style="text-align: center; border-collapse: collapse; min-width: 1000px; width: 100%; border: none;">
                        <thead>
                            <tr style="background: var(--bg-dark);">
                                <th style="border-right: 1px solid var(--border); width: 80px;">DAY / TIME</th>
                                <th>10.30-11.20<br><small style="color:var(--text-muted)">I</small></th>
                                <th>11.20-12.10<br><small style="color:var(--text-muted)">II</small></th>
                                <th>12.10-1.00<br><small style="color:var(--text-muted)">III</small></th>
                                <th style="width: 60px; background: rgba(99, 102, 241, 0.05);">1.00-1.50</th>
                                <th>1.50-2.40<br><small style="color:var(--text-muted)">IV</small></th>
                                <th>2.40-3.30<br><small style="color:var(--text-muted)">V</small></th>
                                <th>3.30-4.15<br><small style="color:var(--text-muted)">VI</small></th>
                                <th>4.15-5.00<br><small style="color:var(--text-muted)">VII</small></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${days.map((day, dIdx) => `
                                <tr>
                                    <td style="font-weight: 700; border-right: 1px solid var(--border); background: var(--bg-dark);">${day}</td>
                                    ${[
                                        '10.30-11.20', '11.20-12.10', '12.10-1.00'
                                    ].map(ts => {
                                        const entry = grid[day][ts];
                                        if (entry) {
                                            return \`<td>
                                                <div style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">\${entry.subjects?.code || ''}</div>
                                                <div style="font-size: 0.75rem; color: var(--primary); margin: 0.2rem 0;">\${entry.subjects?.name || ''}</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">(\${entry.teachers?.name || ''})</div>
                                                <div style="margin-top: 0.5rem;"><button onclick="deleteTimetable('\${entry.id}')" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 0.7rem;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button></div>
                                            </td>\`;
                                        } else {
                                            return \`<td><button onclick="showAddTimetableModal('\${day}', '\${ts}')" style="background: transparent; border: 1px dashed var(--border); border-radius: 0.25rem; color: var(--text-muted); padding: 0.5rem; cursor: pointer; width: 100%; transition: all 0.2s;">+</button></td>\`;
                                        }
                                    }).join('')}
                                    
                                    ${dIdx === 0 ? `<td rowspan="6" style="writing-mode: vertical-rl; text-orientation: upright; font-weight: 800; letter-spacing: 0.5rem; color: var(--primary); background: rgba(99, 102, 241, 0.05); border-left: 1px solid var(--border); border-right: 1px solid var(--border); padding: 1rem;">LUNCH</td>` : ''}
                                    
                                    ${[
                                        '1.50-2.40', '2.40-3.30', '3.30-4.15', '4.15-5.00'
                                    ].map(ts => {
                                        const entry = grid[day][ts];
                                        if (entry) {
                                            return \`<td>
                                                <div style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">\${entry.subjects?.code || ''}</div>
                                                <div style="font-size: 0.75rem; color: var(--primary); margin: 0.2rem 0;">\${entry.subjects?.name || ''}</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">(\${entry.teachers?.name || ''})</div>
                                                <div style="margin-top: 0.5rem;"><button onclick="deleteTimetable('\${entry.id}')" style="background: none; border: none; color: var(--error); cursor: pointer; font-size: 0.7rem;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button></div>
                                            </td>\`;
                                        } else {
                                            return \`<td><button onclick="showAddTimetableModal('\${day}', '\${ts}')" style="background: transparent; border: 1px dashed var(--border); border-radius: 0.25rem; color: var(--text-muted); padding: 0.5rem; cursor: pointer; width: 100%; transition: all 0.2s;">+</button></td>\`;
                                        }
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `}
    `;
    lucide.createIcons();
}

window.updateTimetableFilter = (key, value) => {
    currentState.timetableFilters[key] = value;
    renderActiveView();
}
'''

content = re.sub(render_timetable_pattern, render_timetable_replacement, content, flags=re.DOTALL)


# Replace showAddTimetableModal
show_add_timetable_pattern = r'window\.showAddTimetableModal = \(\) => \{.*?(?=\nfunction showModal)'
show_add_timetable_replacement = r'''window.showAddTimetableModal = (presetDay = '', presetTime = '') => {
    const tFilters = currentState.timetableFilters || {};
    const branches = currentState.selectedDept === 'IT' ? ['IT', 'DS'] : [currentState.selectedDept];

    showModal('Schedule Lecture', `
        <form id="add-timetable-form">
            <div class="form-group">
                <label>Day of Week</label>
                <select id="tt-day" required>
                    <option value="" disabled selected>Select Day</option>
                    ${['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT'].map(d => `<option value="${d}" ${presetDay === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Time Slot</label>
                <select id="tt-time" required>
                    <option value="" disabled selected>Select Slot</option>
                    ${['10.30-11.20', '11.20-12.10', '12.10-1.00', '1.50-2.40', '2.40-3.30', '3.30-4.15', '4.15-5.00'].map(ts => `<option value="${ts}" ${presetTime === ts ? 'selected' : ''}>${ts}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group"><label>Teacher Name</label><input type="text" id="tt-teacher" list="dl-tt-teacher" required></div>
            <datalist id="dl-tt-teacher">${currentState.teachers.map(t => `<option value="${t.name}">`).join('')}</datalist>
            
            <div class="form-group"><label>Subject Code</label><input type="text" id="tt-subject" list="dl-tt-subject" required></div>
            <datalist id="dl-tt-subject">${currentState.subjects.map(s => `<option value="${s.code}">`).join('')}</datalist>

            <div class="form-group">
                <label>Branch</label>
                <select id="tt-branch" required>
                    <option value="" disabled selected>Select Branch</option>
                    ${branches.map(b => `<option value="${b}" ${tFilters.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Year</label>
                <select id="tt-year" required>
                    <option value="" disabled selected>Select Year</option>
                    <option value="1st" ${tFilters.year === '1st' ? 'selected' : ''}>1st</option>
                    <option value="2nd" ${tFilters.year === '2nd' ? 'selected' : ''}>2nd</option>
                    <option value="3rd" ${tFilters.year === '3rd' ? 'selected' : ''}>3rd</option>
                    <option value="4th" ${tFilters.year === '4th' ? 'selected' : ''}>4th</option>
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select id="tt-section" required>
                    <option value="" disabled selected>Select Section</option>
                    <option value="1" ${tFilters.section === '1' ? 'selected' : ''}>1</option>
                    <option value="2" ${tFilters.section === '2' ? 'selected' : ''}>2</option>
                    <option value="3" ${tFilters.section === '3' ? 'selected' : ''}>3</option>
                    <option value="4" ${tFilters.section === '4' ? 'selected' : ''}>4</option>
                    <option value="5" ${tFilters.section === '5' ? 'selected' : ''}>5</option>
                </select>
            </div>
        </form>
    `, async () => {
        const dayVal = document.getElementById('tt-day').value;
        const timeVal = document.getElementById('tt-time').value;
        const [startVal, endVal] = timeVal.split('-');
        
        const teacherName = document.getElementById('tt-teacher').value.trim();
        const subjectCode = document.getElementById('tt-subject').value.trim();
        const branchVal = document.getElementById('tt-branch').value;
        const yearVal = document.getElementById('tt-year').value;
        const sectionVal = document.getElementById('tt-section').value;

        if (!dayVal || !timeVal || !teacherName || !subjectCode || !branchVal || !yearVal || !sectionVal) {
            showToast('Please fill all fields', 'error');
            return;
        }

        const teacher = currentState.teachers.find(t => t.name.toLowerCase() === teacherName.toLowerCase());
        const subject = currentState.subjects.find(s => s.code.toLowerCase() === subjectCode.toLowerCase());
        const classObj = currentState.classes.find(c => 
            c.branch.toLowerCase() === branchVal.toLowerCase() && 
            c.year.toLowerCase() === yearVal.toLowerCase() && 
            c.section.toLowerCase() === sectionVal.toLowerCase()
        );

        if (!teacher) return showToast('Teacher not found', 'error');
        if (!subject) return showToast('Subject not found', 'error');
        if (!classObj) return showToast('Class not found. Create it first.', 'error');

        const data = {
            teacher_id: teacher.id,
            subject_id: subject.id,
            class_id: classObj.id,
            day_of_week: dayVal,
            start_time: startVal,
            end_time: endVal
        };

        const { error } = await supabaseClient.from('timetable').insert([data]);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); closeModal(); renderActiveView(); showToast('Lecture scheduled!'); }
    });
}
'''
content = re.sub(show_add_timetable_pattern, show_add_timetable_replacement, content, flags=re.DOTALL)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
