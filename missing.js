
window.deleteStudent = async (id) => {
    if (confirm('Delete this student?')) {
        const { error } = await supabaseClient.from('students').delete().eq('id', id);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); renderActiveView(); showToast('Student deleted'); }
    }
};

window.deleteTeacher = async (id) => {
    if (confirm('Delete this teacher?')) {
        const { error } = await supabaseClient.from('teachers').delete().eq('id', id);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); renderActiveView(); showToast('Teacher deleted'); }
    }
};

window.deleteSubject = async (id) => {
    if (confirm('Delete this subject?')) {
        const { error } = await supabaseClient.from('subjects').delete().eq('id', id);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); renderActiveView(); showToast('Subject deleted'); }
    }
};

window.deleteClass = async (id) => {
    if (confirm('Delete this class?')) {
        const { error } = await supabaseClient.from('classes').delete().eq('id', id);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); renderActiveView(); showToast('Class deleted'); }
    }
};

window.deleteTimetable = async (id) => {
    if (confirm('Delete this scheduled lecture?')) {
        const { error } = await supabaseClient.from('timetable').delete().eq('id', id);
        if (error) showToast(error.message, 'error');
        else { await loadAllData(); renderActiveView(); showToast('Lecture deleted'); }
    }
};

// Initialize Application
init();
