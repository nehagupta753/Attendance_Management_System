const SUPABASE_URL = "https://heoxgbknrnxzhcdolgus.supabase.co";
const SUPABASE_KEY = "sb_publishable_P2YPf-iogij7qNnwcK79XA_YUbJe1Ll";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentState = {
  user: null,
  role: "admin", // admin or teacher
  teacherData: null,
  view: "dashboard",
  teachers: [],
  subjects: [],
  classes: [],
  timetable: [],
  submissions: [],
  students: [],
  attendanceRecords: [],
  mstSettings: [],
  mstTimetable: [],
  mstMarks: [],
};
window.currentState = currentState;
const compareRollNumbers = (rollA, rollB) => {
  const hasDA = /D/i.test(rollA);
  const hasDB = /D/i.test(rollB);
  if (hasDA && !hasDB) return 1;
  if (!hasDA && hasDB) return -1;
  return rollA.localeCompare(rollB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};
const formatDbTime = (dbTime) => {
  if (!dbTime) return "";
  const parts = dbTime.split(":");
  const hr = parseInt(parts[0], 10);
  const min = parts[1];
  if (hr >= 10) return `${hr}.${min}`;
  return `${hr > 12 ? hr - 12 : hr}.${min}`;
};
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.style = `
        position: fixed; bottom: 20px; right: 20px;
        padding: 1rem 2rem; border-radius: 0.5rem;
        background: ${type === "success" ? "var(--accent)" : "var(--error)"};
        color: #ffffff; font-weight: 600;
        box-shadow: var(--shadow); z-index: 2000;
        animation: slideIn 0.3s ease-out;
    `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
async function init() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    currentState.user = session.user;
    await checkRoleAndLoadData();
    renderMainLayout();
  } else {
    renderLogin();
  }
}

async function checkRoleAndLoadData() {
  const { data: teacher } = await supabaseClient
    .from("teachers")
    .select("*")
    .eq("email", currentState.user.email)
    .single();

  if (teacher) {
    currentState.role = "teacher";
    currentState.view = "markAttendance";
    currentState.teacherData = teacher;
    currentState.hodDept = teacher.hod_dept || teacher.department || "IT";
  } else {
    currentState.role = "admin";
    currentState.view = "dashboard";
    let savedDept = localStorage.getItem("admin_selected_dept") || "";
    if (savedDept === "IT/DS") {
      savedDept = "IT";
      localStorage.setItem("admin_selected_dept", "IT");
    }
    currentState.selectedDept = savedDept;
  }
  await loadAllData();
  if (currentState.role === "admin") {
    currentState.deptBranches = currentState.selectedDept
      ? window.getDeptBranches(currentState.selectedDept)
      : [];
  }
}

const DEFAULT_DEPTS = [
  { name: "IT" },
  { name: "CS" },
  { name: "CSIT" },
  { name: "AIML" },
  { name: "ECE" },
  { name: "ME" },
  { name: "CE" }
];

const DEFAULT_BRANCH_SECS_MAP = {
  IT: [{ branch: "IT", sections: ["1", "2"] }, { branch: "DS", sections: ["1"] }],
  CS: [{ branch: "CS", sections: ["1"] }],
  CSIT: [{ branch: "CSIT", sections: ["1"] }],
  AIML: [{ branch: "AIML", sections: ["1"] }],
  ECE: [{ branch: "ECE", sections: ["1"] }],
  ME: [{ branch: "ME", sections: ["1"] }],
  CE: [{ branch: "CE", sections: ["1"] }]
};

async function seedDefaultDepartments() {
  try {
    const { data: createdDepts, error } = await supabaseClient
      .from("departments")
      .insert(DEFAULT_DEPTS)
      .select();
      
    if (error) {
      console.warn("Seeding departments failed (expected if not signed in):", error.message);
      return false;
    }
    
    if (createdDepts && createdDepts.length > 0) {
      const defaultBranchSecs = [];
      const deptMap = {};
      createdDepts.forEach((d) => {
        deptMap[d.name] = d.id;
      });
      
      for (const [deptName, branches] of Object.entries(DEFAULT_BRANCH_SECS_MAP)) {
        const deptId = deptMap[deptName];
        if (!deptId) continue;
        
        for (const b of branches) {
          for (const year of ["1st", "2nd", "3rd", "4th"]) {
            for (const sec of b.sections) {
              defaultBranchSecs.push({
                department_id: deptId,
                branch: b.branch,
                year: year,
                section: sec
              });
            }
          }
        }
      }
      
      const { error: branchError } = await supabaseClient
        .from("branch_sections")
        .insert(defaultBranchSecs);
        
      if (branchError) {
        console.warn("Seeding branch sections failed:", branchError.message);
      }
      return true;
    }
  } catch (e) {
    console.error("Seeding error:", e);
  }
  return false;
}

window.getDeptBranches = (deptName) => {
  if (!currentState.branchSections || !currentState.departments) {
    return [deptName];
  }
  const dept = currentState.departments.find(d => d.name === deptName);
  if (!dept) {
    const map = DEFAULT_BRANCH_SECS_MAP[deptName];
    if (map) return map.map(m => m.branch);
    return [deptName];
  }
  const branches = [
    ...new Set(
      currentState.branchSections
        .filter((bs) => bs.department_id === dept.id)
        .map((bs) => bs.branch)
    )
  ];
  return branches.length > 0 ? branches : [deptName];
};

window.getBranchSectionsList = (branch) => {
  const classes = currentState.classes || [];
  const matching = branch ? classes.filter((c) => c.branch === branch) : classes;
  const secs = [...new Set(matching.map((c) => String(c.section)))];
  return secs.sort((a, b) => parseInt(a) - parseInt(b));
};

window.updateManualSectionOptions = () => {
  const branchEl = document.getElementById("sel-branch");
  const sectionEl = document.getElementById("sel-section");
  if (!branchEl || !sectionEl) return;
  const branch = branchEl.value;
  const currentVal = sectionEl.value;
  const secs = window.getBranchSectionsList(branch);
  let html = `<option value="" disabled selected>Select Section</option>`;
  secs.forEach((s) => {
    html += `<option value="${s}" ${currentVal === s ? "selected" : ""}>${s}</option>`;
  });
  sectionEl.innerHTML = html;
};

async function loadAllData() {
  const [t, s, c, tt, sub, st, mstS, mstTt, mstM, depts, branchSecs] = await Promise.all([
    supabaseClient.from("teachers").select("*"),
    supabaseClient.from("subjects").select("*"),
    supabaseClient.from("classes").select("*"),
    supabaseClient
      .from("timetable")
      .select("*, teachers(*), subjects(*), classes(*)"),
    supabaseClient
      .from("attendance_submissions")
      .select("*, teachers(*), classes(*)"),
    supabaseClient.from("students").select("*"),
    supabaseClient.from("mst_settings").select("*"),
    supabaseClient.from("mst_timetable").select("*, subjects(*), classes(*)"),
    supabaseClient.from("mst_marks").select("*, students(*), subjects(*)"),
    supabaseClient.from("departments").select("*"),
    supabaseClient.from("branch_sections").select("*"),
  ]);

  currentState.teachers = t.data || [];
  currentState.subjects = s.data || [];
  currentState.classes = c.data || [];
  currentState.timetable = tt.data || [];
  currentState.submissions = sub.data || [];
  currentState.students = (st.data || []).sort((a, b) =>
    compareRollNumbers(a.roll_no || "", b.roll_no || ""),
  );
  currentState.mstSettings = mstS.data || [];
  currentState.mstTimetable = mstTt.data || [];
  currentState.mstMarks = mstM.data || [];

  // Seeding/Loading logic
  let loadedDepts = depts.data || [];
  let loadedBranchSecs = branchSecs.data || [];

  if (loadedDepts.length === 0) {
    // Attempt database seed (will work if user is authenticated, or will print warning)
    const seedSuccess = await seedDefaultDepartments();
    if (seedSuccess) {
      const freshDepts = await supabaseClient.from("departments").select("*");
      const freshBranchSecs = await supabaseClient.from("branch_sections").select("*");
      loadedDepts = freshDepts.data || [];
      loadedBranchSecs = freshBranchSecs.data || [];
    } else {
      // Memory fallback if seed failed (e.g. public access write block)
      loadedDepts = DEFAULT_DEPTS.map((d, index) => ({ id: `mem-id-${index}`, name: d.name }));
      const memoryBranchSecs = [];
      loadedDepts.forEach((d) => {
        const branches = DEFAULT_BRANCH_SECS_MAP[d.name] || [];
        branches.forEach((b) => {
          for (const year of ["1st", "2nd", "3rd", "4th"]) {
            for (const sec of b.sections) {
              memoryBranchSecs.push({
                id: `mem-bs-${d.name}-${b.branch}-${year}-${sec}`,
                department_id: d.id,
                branch: b.branch,
                year: year,
                section: sec
              });
            }
          }
        });
      });
      loadedBranchSecs = memoryBranchSecs;
    }
  }

  currentState.departments = loadedDepts;
  currentState.branchSections = loadedBranchSecs;
}
function renderLogin() {
  const app = document.getElementById("app");
  const role = currentState.loginRole || "student";
  const savedEmailTeacher = localStorage.getItem("teacher_saved_email") || "";
  const savedEmailAdmin = localStorage.getItem("admin_saved_email") || "";
  const savedEmailHod = localStorage.getItem("hod_saved_email") || "";
  const savedEmail =
    role === "teacher"
      ? savedEmailTeacher
      : role === "admin"
        ? savedEmailAdmin
        : role === "hod"
          ? savedEmailHod
          : "";
  const isChecked = savedEmail ? "checked" : "";

  let formHtml = "";
  if (role === "student") {
    formHtml = `
            <form id="student-login-form" style="margin-top: 1rem;" onsubmit="event.preventDefault(); window.handleStudentLoginSubmit();">
                <div class="form-group">
                    <label style="font-weight: 700; color: #334155; margin-bottom: 0.5rem; display: block;">Roll Number (Unique ID)</label>
                    <div class="login-input-wrapper">
                        <i data-lucide="user" class="login-input-icon"></i>
                        <input type="text" id="login-roll" placeholder="e.g. 0827IT231085" required>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 1.25rem;">
                    <label style="font-weight: 700; color: #334155; margin-bottom: 0.5rem; display: block;">Password</label>
                    <div class="login-input-wrapper">
                        <i data-lucide="lock" class="login-input-icon"></i>
                        <input type="password" id="login-password" placeholder="Enter your password" required>
                        <i data-lucide="eye" class="login-input-toggle" onclick="window.toggleLoginPasswordVisibility()"></i>
                    </div>
                </div>
                <p id="login-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #00254d; border-color: #00254d; height: 46px; border-radius: 6px; font-weight: 600; font-size: 0.95rem;">
                    <i data-lucide="graduation-cap" style="width: 18px; height: 18px;"></i> Access Attendance
                </button>
            </form>
        `;
  } else {
    const isTeacher = role === "teacher";
    formHtml = `
            <form id="${role}-login-form" style="margin-top: 1rem;" onsubmit="event.preventDefault(); window.handleAuthLoginSubmit('${role}');">
                <div class="form-group">
                    <label style="font-weight: 700; color: #334155; margin-bottom: 0.5rem; display: block;">Email Address</label>
                    <div class="login-input-wrapper">
                        <i data-lucide="mail" class="login-input-icon"></i>
                        <input type="email" id="login-email" placeholder="Enter your email address" value="${savedEmail}" required>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 1.25rem;">
                    <label style="font-weight: 700; color: #334155; margin-bottom: 0.5rem; display: block;">Password</label>
                    <div class="login-input-wrapper">
                        <i data-lucide="lock" class="login-input-icon"></i>
                        <input type="password" id="login-password" placeholder="••••••••" required>
                        <i data-lucide="eye" class="login-input-toggle" onclick="window.toggleLoginPasswordVisibility()"></i>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="login-remember" ${isChecked} style="width: auto; cursor: pointer;">
                    <label for="login-remember" style="margin: 0; cursor: pointer; font-size: 0.85rem; color: #475569; font-weight: 600;">Remember email address</label>
                </div>
                <p id="login-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #00254d; border-color: #00254d; height: 46px; border-radius: 6px; font-weight: 600; font-size: 0.95rem;">
                    <i data-lucide="shield-check" style="width: 18px; height: 18px;"></i> Sign In
                </button>
            </form>
        `;
  }

  app.innerHTML = `
        <div class="auth-container" style="flex-direction: column; padding: 2rem; justify-content: center; overflow-y: auto; min-height: 100vh; height: auto;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="display: flex; justify-content: center; margin-bottom: 1.5rem; text-align: center;">
                    <img src="https://github.com/nehagupta753/Attendance_Management_System/blob/main/public/logo.png?raw=true" alt="Acropolis Logo" style="height: 100px; width: auto; max-width: 100%; object-fit: contain;">
                </div>
                <h1 style="font-family: Georgia, serif; font-size: 2.25rem; font-weight: 500; color: #00254d; margin-bottom: 0.5rem; text-align: center; letter-spacing: -0.01em;">
                    Attendance Management System
                </h1>
                <div style="width: 40px; height: 2px; background: #2563eb; margin: 0.75rem auto 1.25rem auto;"></div>
                <p style="color: #64748b; font-size: 0.95rem; max-width: 500px; margin: 0 auto; text-align: center;">
                    Select your portal to log in as a student, teacher, or administrator.
                </p>
            </div>
            
            <div class="auth-card" style="width: 100%; max-width: 500px; margin: 0 auto; padding: 3rem; box-sizing: border-box; border-radius: 8px;">
                <div class="login-tabs-container">
                    <button class="login-tab-btn student ${role === "student" ? "active" : ""}" onclick="setLoginRole('student')">
                        Student
                    </button>
                    <button class="login-tab-btn teacher ${role === "teacher" ? "active" : ""}" onclick="setLoginRole('teacher')">
                        Teacher
                    </button>
                    <button class="login-tab-btn admin ${role === "admin" ? "active" : ""}" onclick="setLoginRole('admin')">
                        Admin
                    </button>
                    <button class="login-tab-btn hod ${role === "hod" ? "active" : ""}" onclick="setLoginRole('hod')">
                        HOD
                    </button>
                </div>
                
                <div id="login-form-container">
                    ${formHtml}
                </div>
                
                <div style="margin-top: 2rem; text-align: center; color: #64748b; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; border-top: 1px solid #e2e8f0; padding-top: 1.25rem;">
                    <i data-lucide="lock" style="width: 14px; height: 14px;"></i> Secure access. Your information is protected.
                </div>
            </div>
        </div>
    `;
  lucide.createIcons();
}

window.toggleLoginPasswordVisibility = () => {
  const pwdInput = document.getElementById("login-password");
  const toggleIcon = document.querySelector(".login-input-toggle");
  if (pwdInput && toggleIcon) {
    if (pwdInput.type === "password") {
      pwdInput.type = "text";
      toggleIcon.setAttribute("data-lucide", "eye-off");
    } else {
      pwdInput.type = "password";
      toggleIcon.setAttribute("data-lucide", "eye");
    }
    lucide.createIcons();
  }
};

window.setLoginRole = (role) => {
  currentState.loginRole = role;
  renderLogin();
};

window.handleAuthLoginSubmit = async (role) => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const remember = document.getElementById("login-remember").checked;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = "block";
    return;
  }

  const { data: teacher } = await supabaseClient
    .from("teachers")
    .select("*")
    .eq("email", email)
    .single();

  if (role === "teacher" && !teacher) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "This account is not registered as a Teacher.";
    errorEl.style.display = "block";
  } else if (role === "admin" && teacher) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "Teacher accounts must use the Teacher portal.";
    errorEl.style.display = "block";
  } else if (role === "hod" && (!teacher || !teacher.is_hod)) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "This account does not have HOD privileges.";
    errorEl.style.display = "block";
  } else {
    if (remember) {
      localStorage.setItem(`${role}_saved_email`, email);
    } else {
      localStorage.removeItem(`${role}_saved_email`);
    }
    currentState.user = data.user;
    await checkRoleAndLoadData();
    renderMainLayout();
  }
};

window.showAuthModal = (role) => {
  window.setLoginRole(role);
};

window.showTeacherForgotPasswordModal = () => {
  showModal(
    "Teacher Forgot Password",
    `
        <div style="margin-top: 1rem;">
            <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.4;">
                Enter your registered Email Address to receive a 6-digit verification code on your registered phone number.
            </p>
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="t-forgot-email" placeholder="e.g. teacher@example.com" required>
            </div>
            <p id="t-forgot-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const email = document.getElementById("t-forgot-email").value.trim();
      const errorEl = document.getElementById("t-forgot-error");

      if (!email) {
        errorEl.textContent = "Email Address is required";
        errorEl.style.display = "block";
        return;
      }
      const { data: teacher, error } = await supabaseClient
        .from("teachers")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = "block";
        return;
      }

      if (!teacher) {
        errorEl.textContent = "Teacher record not found for this email";
        errorEl.style.display = "block";
        return;
      }

      if (!teacher.phone) {
        errorEl.textContent =
          "No registered phone number found for this account. Please contact the Admin.";
        errorEl.style.display = "block";
        return;
      }
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        const response = await fetch("/api/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: teacher.phone, otp: otp }),
        });
        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error || "Failed to send OTP");
        }
        showToast(
          resData.mocked
            ? "OTP requested (Mock Mode)"
            : "OTP sent successfully!",
          "success",
        );
      } catch (e) {
        console.warn("API send failed:", e);
        showToast(
          "Failed to send OTP via server, showing backup OTP.",
          "error",
        );
      }
      window.showTeacherOtpVerificationModal(teacher, otp);
    },
    { confirmText: "Send Verification Code" },
  );
};

window.showTeacherOtpVerificationModal = (teacher, correctOtp) => {
  const phone = teacher.phone || "";
  let maskedPhone = phone;
  if (phone && phone.length > 4) {
    maskedPhone =
      "*".repeat(phone.length - 4) + phone.substring(phone.length - 4);
  }
  showToast(`Verification OTP is: ${correctOtp}`, "info", 10000);

  showModal(
    "Verify OTP",
    `
        <div style="margin-top: 1rem;">
            <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.4;">
                We have sent a 6-digit verification code to your registered phone number: <strong>${maskedPhone}</strong>.
            </p>
            <div class="form-group">
                <label>Enter 6-Digit OTP</label>
                <input type="text" id="t-verify-otp" maxlength="6" placeholder="e.g. 123456" style="text-align: center; font-size: 1.25rem; letter-spacing: 0.5rem; font-weight: 700;" required>
            </div>
            <p id="t-verify-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const enteredOtp = document.getElementById("t-verify-otp").value.trim();
      const errorEl = document.getElementById("t-verify-error");

      if (enteredOtp !== correctOtp) {
        errorEl.textContent = "Invalid verification code. Please try again.";
        errorEl.style.display = "block";
        return;
      }
      window.showTeacherResetPasswordModal(email);
    },
    { confirmText: "Verify Code" },
  );
};

window.showTeacherResetPasswordModal = (email) => {
  showModal(
    "Reset Password",
    `
        <div style="margin-top: 1rem;">
            <div class="form-group">
                <label>New Password</label>
                <input type="password" id="t-reset-new-password" placeholder="Enter new password" required>
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Confirm Password</label>
                <input type="password" id="t-reset-confirm-password" placeholder="Confirm new password" required>
            </div>
            <p id="t-reset-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const newPassword = document
        .getElementById("t-reset-new-password")
        .value.trim();
      const confirmPassword = document
        .getElementById("t-reset-confirm-password")
        .value.trim();
      const errorEl = document.getElementById("t-reset-error");

      if (!newPassword || !confirmPassword) {
        errorEl.textContent = "Both fields are required";
        errorEl.style.display = "block";
        return;
      }

      if (newPassword !== confirmPassword) {
        errorEl.textContent = "Passwords do not match";
        errorEl.style.display = "block";
        return;
      }
      const { data, error } = await supabaseClient.rpc("reset_user_password", {
        user_email: email,
        new_password: newPassword,
      });
      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = "block";
        return;
      }
      if (!data) {
        errorEl.textContent =
          "Failed to update password. Check if email is correct.";
        errorEl.style.display = "block";
        return;
      }

      showToast("Password updated successfully!");
      closeModal();
      window.showAuthModal("teacher");
    },
    { confirmText: "Reset Password" },
  );
};

window.handleStudentLoginSubmit = async () => {
  const roll = document.getElementById("login-roll").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const errorEl = document.getElementById("login-error");

  if (!roll || !password) {
    errorEl.textContent = "Roll Number and Password are required";
    errorEl.style.display = "block";
    return;
  }
  let { data: student, error } = await supabaseClient
    .from("students")
    .select("*")
    .eq("roll_no", roll)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = "block";
    return;
  }

  if (!student) {
    errorEl.textContent = "Invalid Roll Number or Password";
    errorEl.style.display = "block";
    return;
  }

  currentState.role = "student";
  currentState.studentData = student;
  currentState.user = { email: `${roll}@student.ams.com` };

  showToast(`Welcome, ${student.name}!`);
  renderStudentLayout();
};

window.showStudentAccessModal = () => {
  window.setLoginRole("student");
};

window.showStudentForgotPasswordModal = () => {
  showModal(
    "Forgot Password",
    `
        <div style="margin-top: 1rem;">
            <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.4;">
                Enter your Roll Number to receive a 6-digit verification code on your registered phone number.
            </p>
            <div class="form-group">
                <label>Roll Number (Unique ID)</label>
                <input type="text" id="forgot-roll" placeholder="e.g. 21CSE01" required>
            </div>
            <p id="forgot-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const roll = document.getElementById("forgot-roll").value.trim();
      const errorEl = document.getElementById("forgot-error");

      if (!roll) {
        errorEl.textContent = "Roll Number is required";
        errorEl.style.display = "block";
        return;
      }
      const { data: student, error } = await supabaseClient
        .from("students")
        .select("*")
        .eq("roll_no", roll)
        .maybeSingle();

      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = "block";
        return;
      }

      if (!student) {
        errorEl.textContent = "Student record not found";
        errorEl.style.display = "block";
        return;
      }

      if (!student.phone) {
        errorEl.textContent =
          "No registered phone number found for this Roll Number. Please contact the Admin.";
        errorEl.style.display = "block";
        return;
      }
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        const response = await fetch("/api/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: student.phone, otp: otp }),
        });
        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error || "Failed to send OTP");
        }
        showToast(
          resData.mocked
            ? "OTP requested (Mock Mode)"
            : "OTP sent successfully!",
          "success",
        );
      } catch (e) {
        console.warn("API send failed:", e);
        showToast(
          "Failed to send OTP via server, showing backup OTP.",
          "error",
        );
      }
      window.showStudentOtpVerificationModal(student, otp);
    },
    { confirmText: "Send Verification Code" },
  );
};

window.showStudentOtpVerificationModal = (student, correctOtp) => {
  const phone = student.phone || "";

  let maskedPhone = phone;
  if (phone && phone.length > 4) {
    maskedPhone =
      "*".repeat(phone.length - 4) + phone.substring(phone.length - 4);
  }
  showToast(`Verification OTP is: ${correctOtp}`, "info", 10000);

  showModal(
    "Verify OTP",
    `
        <div style="margin-top: 1rem;">
            <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.4;">
                We have sent a 6-digit verification code to your registered phone number: <strong>${maskedPhone}</strong>.
            </p>
            <div class="form-group">
                <label>Enter 6-Digit OTP</label>
                <input type="text" id="verify-otp" maxlength="6" placeholder="e.g. 123456" style="text-align: center; font-size: 1.25rem; letter-spacing: 0.5rem; font-weight: 700;" required>
            </div>
            <p id="verify-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const enteredOtp = document.getElementById("verify-otp").value.trim();
      const errorEl = document.getElementById("verify-error");

      if (enteredOtp !== correctOtp) {
        errorEl.textContent = "Invalid verification code. Please try again.";
        errorEl.style.display = "block";
        return;
      }
      window.showStudentResetPasswordModal(student);
    },
    { confirmText: "Verify Code" },
  );
};

window.showStudentResetPasswordModal = (student) => {
  showModal(
    "Reset Password",
    `
        <div style="margin-top: 1rem;">
            <div class="form-group">
                <label>New Password</label>
                <input type="password" id="reset-new-password" placeholder="Enter new password" required>
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Confirm Password</label>
                <input type="password" id="reset-confirm-password" placeholder="Confirm new password" required>
            </div>
            <p id="reset-error" style="color:var(--error); font-size:0.875rem; margin-top:1rem; text-align:center; display:none;"></p>
        </div>
    `,
    async () => {
      const newPassword = document
        .getElementById("reset-new-password")
        .value.trim();
      const confirmPassword = document
        .getElementById("reset-confirm-password")
        .value.trim();
      const errorEl = document.getElementById("reset-error");

      if (!newPassword || !confirmPassword) {
        errorEl.textContent = "Both fields are required";
        errorEl.style.display = "block";
        return;
      }

      if (newPassword !== confirmPassword) {
        errorEl.textContent = "Passwords do not match";
        errorEl.style.display = "block";
        return;
      }
      const { error: rpcError } = await supabaseClient.rpc(
        "reset_user_password",
        { user_email: student.email, new_password: newPassword },
      );
      if (rpcError) {
        console.warn(
          "Auth password update failed: User might not exist in auth.users yet.",
          rpcError,
        );
      }
      const { error: dbError } = await supabaseClient
        .from("students")
        .update({ password: newPassword })
        .eq("id", student.id);

      if (dbError) {
        errorEl.textContent = dbError.message;
        errorEl.style.display = "block";
        return;
      }

      showToast("Password updated successfully!");
      closeModal();
      window.showStudentAccessModal();
    },
    { confirmText: "Reset Password" },
  );
};

window.renderStudentLayout = async () => {
  const app = document.getElementById("app");
  try {
    const student = currentState.studentData;

    app.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; gap:1.5rem; background:var(--bg-dark);">
                <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;"></div>
                <div style="color:var(--text-muted); font-size:1.1rem; font-weight:500;">Retrieving your attendance records...</div>
            </div>
        `;
    const { data: classObj, error: classErr } = await supabaseClient
      .from("classes")
      .select("*")
      .eq("branch", student.branch)
      .eq("year", student.year)
      .eq("section", student.section)
      .maybeSingle();

    if (classErr) {
      showToast(`Error fetching class: ${classErr.message}`, "error");
      renderLogin();
      return;
    }

    const classId = classObj ? classObj.id : null;

    const [recordsRes, teachersRes] = await Promise.all([
      classId
        ? supabaseClient
            .from("attendance_records")
            .select(
              `
                        id,
                        status,
                        date,
                        batch,
                        student_id,
                        class_id,
                        teacher_ids,
                        subjects (name, code),
                        teachers (id, name)
                    `,
            )
            .eq("class_id", classId)
            .order("date", { ascending: false })
        : { data: [], error: null },
      supabaseClient.from("teachers").select("*"),
    ]);

    if (recordsRes.error) {
      showToast(
        `Error fetching attendance: ${recordsRes.error.message}`,
        "error",
      );
      renderLogin();
      return;
    }

    const allClassRecords = recordsRes.data || [];
    currentState.teachers = teachersRes.data || [];
    currentState.attendanceRecords = allClassRecords.filter(
      (r) => r.student_id === student.id,
    );

    const extraAtt = student.extra_attendance || {};
    const sessionsMap = {};
    allClassRecords.forEach((r) => {
      if (r.batch && student.batch && r.batch !== student.batch) {
        return;
      }
      const key = `${r.date}-${r.subjects?.code || r.subject_id}-${r.batch || "All"}-${r.lecture_no || 1}`;
      if (!sessionsMap[key]) {
        sessionsMap[key] = {
          date: r.date,
          subject: r.subjects,
          subject_id: r.subject_id,
          batch: r.batch,
          lecture_no: r.lecture_no,
          teacher_ids: r.teacher_ids,
          records: [],
        };
      }
      sessionsMap[key].records.push(r);
    });

    const sessionsList = Object.values(sessionsMap).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );

    const subjectMetrics = {};

    const addMetric = (subId, subName, subCode, type, present, total) => {
      const key = `${subId || subName}-${type}`;
      if (!subjectMetrics[key]) {
        subjectMetrics[key] = {
          name: subName,
          code: subCode,
          type: type, // 'Lecture' or 'Lab'
          present: 0,
          absent: 0,
          total: 0,
        };
      }
      subjectMetrics[key].total += total;
      subjectMetrics[key].present += present;
      subjectMetrics[key].absent += total - present;
    };
    let totalExtraPresent = 0;
    Object.values(extraAtt).forEach((val) => {
      totalExtraPresent += val.present || 0;
    });
    sessionsList.forEach((session) => {
      const subId = session.subject_id;
      const subName = session.subject?.name || "Unknown Subject";
      const subCode = session.subject?.code || "GEN101";
      const type = session.batch ? "Lab" : "Lecture";

      const studentRecord = session.records.find(
        (rec) => rec.student_id === student.id,
      );
      const present =
        studentRecord && studentRecord.status === "Present" ? 1 : 0;
      addMetric(subId, subName, subCode, type, present, 1);
    });
    let totalConducted = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    Object.values(subjectMetrics).forEach((m) => {
      totalConducted += m.total;
      totalPresent += m.present;
      totalAbsent += m.absent;
    });
    totalPresent += totalExtraPresent;
    totalAbsent = Math.max(0, totalConducted - totalPresent);
    const attendancePct =
      totalConducted > 0
        ? Math.min(100, (totalPresent / totalConducted) * 100).toFixed(1)
        : "100.0";
    app.innerHTML = `
            <style>
                .student-tab-container {
                    display: flex;
                    background: #ffffff;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    border-radius: 2rem;
                    padding: 0.25rem;
                    width: max-content;
                    margin: 2rem auto;
                    gap: 0.25rem;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.02);
                }
                .student-tab-btn {
                    border: none !important;
                    background: transparent !important;
                    padding: 0.65rem 1.5rem !important;
                    font-size: 0.85rem !important;
                    font-weight: 600 !important;
                    border-radius: 1.5rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.5rem !important;
                    cursor: pointer !important;
                    color: #64748b !important;
                    transition: all 0.2s ease !important;
                    box-shadow: none !important;
                }
                .student-tab-btn.active {
                    background: #003366 !important;
                    color: #ffffff !important;
                }
            </style>

            <div style="width: 100%; min-height: 100vh; background: #f8fafc; color: var(--text-main); font-family: 'Outfit', sans-serif; display: flex; flex-direction: column;">
                <nav style="position: sticky; top: 0; background: #ffffff; border-bottom: 1px solid rgba(0,0,0,0.06); padding: 1rem 2rem; display: flex; justify-content: center; align-items: center; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
                    <div style="width:100%; max-width:1400px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; font-weight: 700; font-size: 1.25rem; color: #003366;">
                        <i data-lucide="graduation-cap" style="width: 28px; height: 28px; color: #003366;"></i>
                        <span>AITR Student Portal</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1.25rem;">
                        <div style="display: flex; gap: 0.5rem; background: #f1f5f9; padding: 0.5rem 1rem; border-radius: 2rem; font-size: 0.8rem; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); color: #475569;">
                            <span style="color: #003366;">${student.course || "B.Tech"}</span> | 
                            <span>${student.branch || "IT"}</span> | 
                            <span>${student.year || "3rd"} Year</span> | 
                            <span>Sec ${student.section || "2"}</span>
                        </div>
                        <button style="background: transparent; border: 1px solid #cbd5e1; color: #334155; padding: 0.5rem 1.25rem; font-size: 0.85rem; border-radius: 0.5rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s;" onclick="logoutStudent()">
                            <i data-lucide="log-out" style="width: 16px; height: 16px;"></i> Exit Portal
                        </button>
                    </div>
                    </div>
                </nav>
                <div style="width:100%; max-width:1400px; margin:0 auto; padding:2rem clamp(1rem, 4vw, 2.5rem);">
                    <div style="margin-bottom: 2.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
                        <div>
                            <h1 style="font-size: 2.25rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; margin-bottom: 0.25rem;">
                                Hello, <span style="color: #003366;">${student.name}</span>! 👋
                            </h1>
                            <p style="color: #64748b; font-size: 1rem; font-weight: 500;">Here is your real-time attendance performance report.</p>
                        </div>
                        <div>
                            <div style="background: #ffffff; border: 1px solid rgba(0,0,0,0.06); border-radius: 1rem; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.01);">
                                <div style="background: #eff6ff; color: #2563eb; width: 42px; height: 42px; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="contact" style="width: 22px; height: 22px;"></i>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Roll Number</div>
                                    <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-top: 0.1rem;">${student.roll_no}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 3rem;">
                        <div style="background: #ffffff; border: 1px solid rgba(0,0,0,0.06); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.015); min-height: 170px; position: relative;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
                                    <div style="background: #e6f4ea; color: #10b981; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="trending-up" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Overall Attendance</span>
                                </div>
                                <div style="font-size: 2.75rem; font-weight: 800; color: #0f172a; line-height: 1;">${attendancePct}%</div>
                                <div style="font-size: 0.825rem; color: #64748b; font-weight: 500; margin-top: 0.5rem;">
                                    ${attendancePct >= 75 ? "Excellent!" : attendancePct >= 60 ? "Average!" : "Low Attendance!"}
                                </div>
                            </div>
                            <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 1.25rem;">
                                <div style="width: ${attendancePct}%; height: 100%; background: #10b981; border-radius: 3px;"></div>
                            </div>
                        </div>
                        <div style="background: #ffffff; border: 1px solid rgba(0,0,0,0.06); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.015); min-height: 170px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
                                    <div style="background: #eff6ff; color: #2563eb; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="book-open" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Lectures Held</span>
                                </div>
                                <div style="font-size: 2.75rem; font-weight: 800; color: #0f172a; line-height: 1;">${totalConducted}</div>
                                <div style="font-size: 0.825rem; color: #64748b; font-weight: 500; margin-top: 0.5rem;">Total sessions registered</div>
                            </div>
                        </div>
                        <div style="background: #ffffff; border: 1px solid rgba(16, 185, 129, 0.2); border-left: 4px solid #10b981; border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.015); min-height: 170px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
                                    <div style="background: #e6f4ea; color: #10b981; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="calendar-check" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Lectures Present</span>
                                </div>
                                <div style="font-size: 2.75rem; font-weight: 800; color: #0f172a; line-height: 1;">${totalPresent}</div>
                                <div style="font-size: 0.825rem; color: #64748b; font-weight: 500; margin-top: 0.5rem;">Attended classrooms</div>
                            </div>
                        </div>
                        <div style="background: #ffffff; border: 1px solid ${attendancePct >= 75 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}; border-left: 4px solid ${attendancePct >= 75 ? "#10b981" : "#ef4444"}; border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.015); min-height: 170px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
                                    <div style="background: ${attendancePct >= 75 ? "#e6f4ea" : "#fee2e2"}; color: ${attendancePct >= 75 ? "#10b981" : "#ef4444"}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="shield-check" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Exam Eligibility</span>
                                </div>
                                <div style="font-size: 1.85rem; font-weight: 800; color: ${attendancePct >= 75 ? "#10b981" : "#ef4444"}; display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0;">
                                    ${attendancePct >= 75 ? 'Eligible <i data-lucide="check-circle" style="width: 22px; height: 22px; fill: #10b981; color: white;"></i>' : 'Ineligible <i data-lucide="alert-triangle" style="width: 22px; height: 22px; fill: #ef4444; color: white;"></i>'}
                                </div>
                                <div style="font-size: 0.825rem; color: #64748b; font-weight: 500; margin-top: 0.5rem;">
                                    ${attendancePct >= 75 ? "Meets required 75% criteria." : "Does not meet 75% criteria."}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="student-tab-container" style="flex-wrap: wrap; justify-content: center; gap: 0.5rem; border-radius: 1rem;">
                        <button id="student-tab-attendance" class="student-tab-btn active" onclick="switchStudentTab('attendance')">
                            <i data-lucide="calendar" style="width: 18px; height: 18px;"></i> View Attendance
                        </button>
                        <button id="student-tab-timetable" class="student-tab-btn" onclick="switchStudentTab('timetable')">
                            <i data-lucide="layout-grid" style="width: 18px; height: 18px;"></i> My Timetable
                        </button>
                        <button id="student-tab-mst" class="student-tab-btn" onclick="switchStudentTab('mst')">
                            <i data-lucide="award" style="width: 18px; height: 18px;"></i> MST
                        </button>
                        <button id="student-tab-updateprofile" class="student-tab-btn" onclick="switchStudentTab('updateprofile')">
                            <i data-lucide="user-cog" style="width: 18px; height: 18px;"></i> Update Profile
                        </button>
                    </div>
                    
                    <div id="student-content-attendance">
                        <div style="display:flex; justify-content:center; gap:0.5rem; margin-bottom:1.5rem; background:rgba(0,0,0,0.02); padding:0.4rem; border-radius:0.75rem; border:1px solid var(--border); width:fit-content; margin-left:auto; margin-right:auto;">
                            <button id="student-subtab-subject" class="student-tab-btn active" onclick="window.switchStudentSubTab('attendance', 'subject')" style="padding:0.45rem 1.25rem; font-size:0.85rem; border-radius:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                                <i data-lucide="book-open" style="width: 15px; height: 15px;"></i> Subject-wise
                            </button>
                            <button id="student-subtab-date" class="student-tab-btn" onclick="window.switchStudentSubTab('attendance', 'date')" style="padding:0.45rem 1.25rem; font-size:0.85rem; border-radius:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                                <i data-lucide="clock" style="width: 15px; height: 15px;"></i> Time-wise
                            </button>
                        </div>
                        <div id="student-content-subject">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
                            ${
                              Object.keys(subjectMetrics).length === 0
                                ? `
                                <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                                    <i data-lucide="info" style="width: 48px; height: 48px; margin: 0 auto 1rem auto; opacity: 0.5;"></i>
                                    <p>No attendance records found for your profile yet.</p>
                                </div>
                            `
                                : Object.entries(subjectMetrics)
                                    .map(([key, data]) => {
                                      const subPct =
                                        data.total > 0
                                          ? (
                                              (data.present / data.total) *
                                              100
                                            ).toFixed(1)
                                          : "100.0";
                                      const eligible = subPct >= 75;
                                      return `
                                    <div style="background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 15px rgba(0,0,0,0.015); position: relative; min-height: 140px;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                            <div>
                                                <h3 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">${data.name}</h3>
                                                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                                                    <span style="font-size: 0.72rem; color: #64748b; font-weight: 600; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">${data.code}</span>
                                                    <span style="font-size: 0.72rem; color: ${data.type === "Lab" ? "#2563eb" : "#0f766e"}; font-weight: 600; background: ${data.type === "Lab" ? "#eff6ff" : "#e6f4ea"}; padding: 0.25rem 0.5rem; border-radius: 0.25rem; display: inline-flex; align-items: center; gap: 0.3rem; line-height: 1;">
                                                        <i data-lucide="${data.type === "Lab" ? "flask-conical" : "book-open"}" style="width: 12px; height: 12px;"></i>
                                                        <span>${data.type === "Lab" ? "Lab" : "Lec"}</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 1.5rem; font-weight: 800; color: ${eligible ? "#10b981" : "#ef4444"};">${subPct}%</div>
                                                <div style="font-size: 0.72rem; color: #64748b; font-weight: 500; margin-top: 0.1rem;">Attendance</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div style="display: flex; justify-content: space-between; font-size: 0.825rem; color: #64748b; margin-bottom: 0.5rem;">
                                                <span>Attended: <strong style="color: #0f172a;">${data.present}/${data.total}</strong></span>
                                                <span>Absent: <strong style="color: #ef4444;">${data.absent}</strong></span>
                                            </div>
                                            <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 2.5px; overflow: hidden;">
                                                <div style="width: ${subPct}%; height: 100%; background: ${eligible ? "#10b981" : "#ef4444"}; border-radius: 2.5px;"></div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                                    })
                                    .join("")
                            }
                        </div>
                    </div>
                    <div id="student-content-date" style="display: none;">
                        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: center; flex-wrap: wrap;">
                            <div>
                                <label style="font-size:0.8rem;color:var(--text-muted);font-weight:600;display:block;margin-bottom:0.25rem;">Filter by Date</label>
                                <input type="date" id="student-date-filter" onchange="filterStudentByDate()" style="padding:0.65rem 1rem;background:var(--bg-card);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                            </div>
                            <div style="flex: 1; min-width: 200px;">
                                <label style="font-size:0.8rem;color:var(--text-muted);font-weight:600;display:block;margin-bottom:0.25rem;">Search</label>
                                <input type="text" id="student-search-input" placeholder="Search by Subject or Teacher..." oninput="filterStudentTimeline()" style="width: 100%; padding: 0.65rem 1rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main);">
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items:flex-end; padding-bottom:0; flex-wrap:wrap;">
                                <button id="status-btn-All" class="btn-status all active student-status-btn" onclick="filterStudentStatus('All')">All</button>
                                <button id="status-btn-Present" class="btn-status present student-status-btn" onclick="filterStudentStatus('Present')">Present</button>
                                <button id="status-btn-Absent" class="btn-status absent student-status-btn" onclick="filterStudentStatus('Absent')">Absent</button>
                            </div>
                        </div>

                        <div class="card">
                            <div class="table-container">
                                <table id="student-timeline-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Subject Name</th>
                                            <th>Teacher</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sessionsList
                                          .map((session) => {
                                            const studentRecord =
                                              session.records.find(
                                                (rec) =>
                                                  rec.student_id === student.id,
                                              );
                                            let status = "Absent";
                                            if (studentRecord) {
                                              status = studentRecord.status;
                                            } else if (
                                              session.batch &&
                                              session.batch !== student.batch
                                            ) {
                                              status = "Other Batch";
                                            }

                                            const tIds =
                                              session.teacher_ids &&
                                              session.teacher_ids.length > 0
                                                ? session.teacher_ids
                                                : session.records[0]
                                                    ?.teacher_ids ||
                                                  (session.records[0]?.teachers
                                                    ? [
                                                        session.records[0]
                                                          .teachers.id,
                                                      ]
                                                    : []);

                                            const teacherNames =
                                              tIds
                                                .map((tid) => {
                                                  const t =
                                                    currentState.teachers.find(
                                                      (tch) => tch.id === tid,
                                                    );
                                                  return t ? t.name : "";
                                                })
                                                .filter(Boolean)
                                                .join(", ") ||
                                              session.records[0]?.teachers
                                                ?.name ||
                                              "System";

                                            const subName =
                                              session.subject?.name ||
                                              "Unknown";
                                            const subCode =
                                              session.subject?.code || "";

                                            const searchStr =
                                              `${subName} ${subCode} ${teacherNames} ${session.batch || ""}`.toLowerCase();

                                            let statusBadgeStyle = "";
                                            if (status === "Present") {
                                              statusBadgeStyle =
                                                "background: rgba(16, 185, 129, 0.15); color: var(--accent);";
                                            } else if (status === "Absent") {
                                              statusBadgeStyle =
                                                "background: rgba(239, 68, 68, 0.15); color: var(--error);";
                                            } else if (
                                              status === "Other Batch"
                                            ) {
                                              statusBadgeStyle =
                                                "background: rgba(245, 158, 11, 0.15); color: #f59e0b;";
                                            } else {
                                              statusBadgeStyle =
                                                "background: rgba(156, 163, 175, 0.15); color: var(--text-muted);";
                                            }

                                            return `
                                                <tr data-status="${status}" data-search="${searchStr}" data-date="${session.date}">
                                                    <td style="font-weight: 600;">${session.date}</td>
                                                    <td>
                                                        <div style="font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                                            <span>${subName}</span>
                                                            ${session.batch ? `<span style="font-size: 0.7rem; color: var(--accent); background: rgba(45, 212, 191, 0.1); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-weight: 600;">${session.batch}</span>` : ""}
                                                        </div>
                                                        <span style="font-size: 0.75rem; color: var(--text-muted);">${subCode}</span>
                                                    </td>
                                                    <td style="color: var(--text-muted); font-size: 0.9rem;">${teacherNames}</td>
                                                    <td>
                                                        <span style="display: inline-block; padding: 0.35rem 0.75rem; border-radius: 2rem; font-size: 0.8rem; font-weight: 700; ${statusBadgeStyle}">  
                                                            ${status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            `;
                                          })
                                          .join("")}
                                        ${
                                          sessionsList.length === 0
                                            ? `
                                            <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 3rem;">No timeline events recorded.</td></tr>
                                        `
                                            : ""
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    </div>
                    <div id="student-content-timetable" style="display: none;">
                        <div id="student-timetable-grid" style="overflow-x:auto;">
                            <div style="text-align:center;padding:2rem;color:var(--text-muted);">Loading your timetable...</div>
                        </div>
                    </div>
                    <div id="student-content-mst" style="display: none;">
                        <div style="display:flex; justify-content:center; gap:0.5rem; margin-bottom:1.5rem; background:rgba(0,0,0,0.02); padding:0.4rem; border-radius:0.75rem; border:1px solid var(--border); width:fit-content; margin-left:auto; margin-right:auto;">
                            <button id="student-subtab-msttimetable" class="student-tab-btn active" onclick="window.switchStudentSubTab('mst', 'msttimetable')" style="padding:0.45rem 1.25rem; font-size:0.85rem; border-radius:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                                <i data-lucide="calendar-days" style="width: 15px; height: 15px;"></i> MST Timetable
                            </button>
                            <button id="student-subtab-mstmarks" class="student-tab-btn" onclick="window.switchStudentSubTab('mst', 'mstmarks')" style="padding:0.45rem 1.25rem; font-size:0.85rem; border-radius:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                                <i data-lucide="award" style="width: 15px; height: 15px;"></i> MST Marks
                            </button>
                        </div>
                        <div id="student-content-msttimetable">
                            <div id="student-mst-timetable-area"></div>
                        </div>
                        <div id="student-content-mstmarks" style="display: none;">
                            <div id="student-mst-marks-area"></div>
                        </div>
                    </div>
                    <div id="student-content-updateprofile" style="display: none;">
                        <div id="student-update-pending-alert"></div>
                        <div class="card" style="padding:1.5rem; border-radius:1rem; border:1px solid var(--border); background:#ffffff;">
                            <h3 style="margin-top:0; color:#003366; font-size:1.2rem; font-weight:700; border-bottom:1px solid var(--border); padding-bottom:0.75rem; margin-bottom:1.5rem;">Personal & Academic Details Update</h3>
                            
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1.25rem;">
                                <!-- Personal Details Group -->
                                <div style="display:flex; flex-direction:column; gap:1rem; grid-column:1 / -1;">
                                    <h4 style="margin:0; color:var(--primary); font-size:0.95rem; font-weight:600;">Personal Information</h4>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Gender</label>
                                    <select id="stu-upd-gender" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                        <option value="">-- Select Gender --</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    <div id="stu-upd-gender-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Caste</label>
                                    <input type="text" id="stu-upd-caste" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;" placeholder="e.g. General / OBC / SC / ST">
                                    <div id="stu-upd-caste-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Email Address</label>
                                    <input type="email" id="stu-upd-email" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-email-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Phone Number</label>
                                    <input type="tel" id="stu-upd-phone" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-phone-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Father's Name</label>
                                    <input type="text" id="stu-upd-father-name" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-father-name-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Mother's Name</label>
                                    <input type="text" id="stu-upd-mother-name" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-mother-name-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Father's Phone Number</label>
                                    <input type="tel" id="stu-upd-father-phone" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-father-phone-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <!-- Academic Group -->
                                <div style="display:flex; flex-direction:column; gap:1rem; grid-column:1 / -1; margin-top:1rem; border-top:1px solid var(--border); padding-top:1.5rem;">
                                    <h4 style="margin:0; color:var(--primary); font-size:0.95rem; font-weight:600;">Academic Information</h4>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">10th Board</label>
                                    <input type="text" id="stu-upd-10-board" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;" placeholder="e.g. CBSE / ICSE">
                                    <div id="stu-upd-10-board-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">10th Percentage (%)</label>
                                    <input type="number" step="0.01" id="stu-upd-10-pct" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-10-pct-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">12th Board</label>
                                    <input type="text" id="stu-upd-12-board" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;" placeholder="e.g. CBSE / State Board">
                                    <div id="stu-upd-12-board-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">12th Percentage (%)</label>
                                    <input type="number" step="0.01" id="stu-upd-12-pct" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-12-pct-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Diploma Percentage (%)</label>
                                    <input type="number" step="0.01" id="stu-upd-diploma-pct" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-diploma-pct-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.8rem; font-weight:700; color:#334155;">Current CGPA</label>
                                    <input type="number" step="0.01" id="stu-upd-cgpa" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                    <div id="stu-upd-cgpa-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                </div>

                                <!-- Semester-wise Attendance Group -->
                                <div style="display:flex; flex-direction:column; gap:1rem; grid-column:1 / -1; margin-top:1rem; border-top:1px solid var(--border); padding-top:1.5rem;">
                                    <h4 style="margin:0; color:var(--primary); font-size:0.95rem; font-weight:600;">Semester-wise Attendance (%)</h4>
                                </div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1.25rem; grid-column:1 / -1;">
                                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(num => `
                                        <div class="form-group" style="margin-bottom:0;">
                                            <label style="font-size:0.8rem; font-weight:700; color:#334155;">Semester ${num}</label>
                                            <input type="number" step="0.01" min="0" max="100" id="stu-upd-sem-${num}" style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;" placeholder="e.g. 85.50">
                                            <div id="stu-upd-sem-${num}-current" style="font-size:0.72rem; color:#d97706; margin-top:0.25rem; display:none;"></div>
                                        </div>
                                    `).join("")}
                                </div>

                                <!-- Achievements Group -->
                                <div style="display:flex; flex-direction:column; gap:1rem; grid-column:1 / -1; margin-top:1rem; border-top:1px solid var(--border); padding-top:1.5rem;">
                                    <h4 style="margin:0; color:var(--primary); font-size:0.95rem; font-weight:600;">Student Achievements</h4>
                                </div>
                                <div style="grid-column:1 / -1; display:flex; flex-direction:column; gap:1rem;">
                                    <div id="stu-upd-ach-list-container" style="display:flex; flex-direction:column; gap:0.5rem; max-height:200px; overflow-y:auto; padding:0.5rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(0,0,0,0.01);">
                                        <!-- Dynamic Achievements List loaded here -->
                                    </div>
                                    <div id="stu-upd-achievements-current" style="font-size:0.72rem; color:#d97706; margin-bottom:0.5rem; display:none;"></div>
                                    
                                    <div style="display:grid; grid-template-columns:1fr 2fr auto; gap:0.75rem; align-items:end; background:var(--bg-dark); padding:1rem; border-radius:0.5rem; border:1px solid var(--border);">
                                        <div class="form-group" style="margin-bottom:0;">
                                            <label style="font-size:0.8rem; font-weight:700; color:#334155;">Type</label>
                                            <select id="stu-upd-new-ach-type" style="padding:0.65rem 0.75rem; background:#ffffff; border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                                <option value="Internship">Internship</option>
                                                <option value="Hackathon">Hackathon</option>
                                                <option value="Sports">Sports</option>
                                                <option value="Certifications">Certifications</option>
                                                <option value="Others">Others</option>
                                            </select>
                                        </div>
                                        <div class="form-group" style="margin-bottom:0;">
                                            <label style="font-size:0.8rem; font-weight:700; color:#334155;">Achievement Details / Title</label>
                                            <input type="text" id="stu-upd-new-ach-name" placeholder="e.g. Winner at Smart India Hackathon 2026" style="padding:0.65rem 0.75rem; background:#ffffff; border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; width:100%;">
                                        </div>
                                        <button type="button" class="btn-primary" onclick="window.addStudentUpdAchievement()" style="background:#10b981; border-color:#10b981; padding:0.65rem 1.25rem; font-size:0.85rem; font-weight:700; border-radius:0.5rem; cursor:pointer;">
                                            + Add
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div id="stu-upd-action-container" style="margin-top:2rem; display:flex; justify-content:center; gap:1rem;">
                                <button class="btn-primary" id="btn-update-selected-fields" onclick="window.submitStudentProfileUpdates()" style="background:#003366; border-color:#003366; padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
                                    <i data-lucide="save" style="width:18px; height:18px;"></i> Submit Update Request
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
                    document.getElementById("student-content-msttimetable")
                        .style.display = "none";
    lucide.createIcons();
    if (currentState.ttRealtimeChannel) {
      supabaseClient.removeChannel(currentState.ttRealtimeChannel);
    }
    currentState.ttRealtimeChannel = supabaseClient
      .channel("student-timetable-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timetable" },
        () => {
          const ttContent = document.getElementById(
            "student-content-timetable",
          );
          if (ttContent && ttContent.style.display !== "none") {
            loadStudentTimetable();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => {
          const ttContent = document.getElementById(
            "student-content-timetable",
          );
          if (ttContent && ttContent.style.display !== "none") {
            loadStudentTimetable();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subjects" },
        () => {
          const ttContent = document.getElementById(
            "student-content-timetable",
          );
          if (ttContent && ttContent.style.display !== "none") {
            loadStudentTimetable();
          }
        },
      )
      .subscribe();
  } catch (error) {
    console.error("Error rendering student layout:", error);
    app.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:100vh; padding:2rem; background:var(--bg-dark); color:var(--error); font-family:'Outfit', sans-serif; text-align:center;">
                <h2 style="margin-bottom: 1.5rem; color: var(--error); font-size: 2rem; font-weight: 800;">Error Loading Student Portal</h2>
                <div style="max-width:800px; width:100%; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 2rem; border-radius: 0.75rem; font-family: monospace; white-space: pre-wrap; font-size: 0.95rem; margin-bottom: 2rem; text-align: left; word-break: break-all; box-shadow: 0 8px 32px 0 rgba(239, 68, 68, 0.05); backdrop-filter: blur(8px);">
                    <div style="font-weight:700; font-size: 1.1rem; margin-bottom: 1rem; color: #ff6b6b;">${error.message || error}</div>
                    ${error.stack ? '<div style="color:var(--text-muted); font-size: 0.85rem; border-top: 1px solid rgba(239, 68, 68, 0.1); padding-top: 1rem; margin-top: 1rem;"><strong>Stack Trace:</strong>\n' + error.stack + "</div>" : ""}
                </div>
                <button class="btn-primary" style="padding: 0.75rem 2rem; font-size: 0.9rem; font-weight:600;" onclick="renderLogin()">Go Back to Login</button>
            </div>
        `;
  }
};

window.switchStudentTab = (tab) => {
  const btnAttendance = document.getElementById("student-tab-attendance");
  const btnTimetable = document.getElementById("student-tab-timetable");
  const btnMst = document.getElementById("student-tab-mst");
  const btnUpdateProfile = document.getElementById("student-tab-updateprofile");

  const contentAttendance = document.getElementById("student-content-attendance");
  const contentTimetable = document.getElementById("student-content-timetable");
  const contentMst = document.getElementById("student-content-mst");
  const contentUpdateProfile = document.getElementById("student-content-updateprofile");

  [btnAttendance, btnTimetable, btnMst, btnUpdateProfile].forEach(
    (b) => b?.classList.remove("active"),
  );
  if (contentAttendance) contentAttendance.style.display = "none";
  if (contentTimetable) contentTimetable.style.display = "none";
  if (contentMst) contentMst.style.display = "none";
  if (contentUpdateProfile) contentUpdateProfile.style.display = "none";

  if (tab === "attendance") {
    btnAttendance?.classList.add("active");
    if (contentAttendance) contentAttendance.style.display = "block";
    window.switchStudentSubTab('attendance', 'subject');
  } else if (tab === "timetable") {
    btnTimetable?.classList.add("active");
    if (contentTimetable) {
      contentTimetable.style.display = "block";
      loadStudentTimetable();
    }
  } else if (tab === "mst") {
    btnMst?.classList.add("active");
    if (contentMst) contentMst.style.display = "block";
    window.switchStudentSubTab('mst', 'msttimetable');
  } else if (tab === "updateprofile") {
    btnUpdateProfile?.classList.add("active");
    if (contentUpdateProfile) {
      contentUpdateProfile.style.display = "block";
      window.initStudentUpdateProfileTab();
    }
  }
};

window.switchStudentSubTab = (parentTab, subTab) => {
  if (parentTab === 'attendance') {
    const btnSubject = document.getElementById("student-subtab-subject");
    const btnDate = document.getElementById("student-subtab-date");
    const contentSubject = document.getElementById("student-content-subject");
    const contentDate = document.getElementById("student-content-date");

    btnSubject?.classList.remove("active");
    btnDate?.classList.remove("active");
    if (contentSubject) contentSubject.style.display = "none";
    if (contentDate) contentDate.style.display = "none";

    if (subTab === 'subject') {
      btnSubject?.classList.add("active");
      if (contentSubject) contentSubject.style.display = "grid";
    } else {
      btnDate?.classList.add("active");
      if (contentDate) contentDate.style.display = "block";
    }
  } else if (parentTab === 'mst') {
    const btnTimetable = document.getElementById("student-subtab-msttimetable");
    const btnMarks = document.getElementById("student-subtab-mstmarks");
    const contentTimetable = document.getElementById("student-content-msttimetable");
    const contentMarks = document.getElementById("student-content-mstmarks");

    btnTimetable?.classList.remove("active");
    btnMarks?.classList.remove("active");
    if (contentTimetable) contentTimetable.style.display = "none";
    if (contentMarks) contentMarks.style.display = "none";

    if (subTab === 'msttimetable') {
      btnTimetable?.classList.add("active");
      if (contentTimetable) {
        contentTimetable.style.display = "block";
        window.loadStudentMstTimetable();
      }
    } else {
      btnMarks?.classList.add("active");
      if (contentMarks) {
        contentMarks.style.display = "block";
        window.loadStudentMstMarks();
      }
    }
  }
};

window.initStudentUpdateProfileTab = async () => {
  const student = currentState.studentData;
  if (!student) return;

  try {
    const { data: pending, error } = await supabaseClient
      .from("student_updates")
      .select("*")
      .eq("student_id", student.id)
      .eq("status", "Pending")
      .eq("field_name", "profile_update")
      .maybeSingle();

    const currentValues = {
      gender: student.gender || "",
      caste: student.caste || "",
      email: student.email || "",
      phone: student.phone || "",
      father_name: student.father_name || "",
      mother_name: student.mother_name || "",
      father_phone: student.father_phone || "",
      class_10_board: student.class_10_board || "",
      class_10_percent: student.class_10_percent || "",
      class_12_board: student.class_12_board || "",
      class_12_percent: student.class_12_percent || "",
      diploma_percent: student.diploma_percent || "",
      current_cgpa: student.current_cgpa || "",
      sem_attendance: student.sem_attendance || {},
      achievements: student.achievements || []
    };

    let valuesToUse = { ...currentValues };
    let hasPending = false;
    let pendingDateStr = "";

    if (pending) {
      hasPending = true;
      valuesToUse = { 
        ...currentValues, 
        ...(pending.new_value || {}),
        sem_attendance: { ...(currentValues.sem_attendance || {}), ...(pending.new_value?.sem_attendance || {}) },
        achievements: pending.new_value?.achievements !== undefined ? pending.new_value.achievements : currentValues.achievements
      };
      pendingDateStr = new Date(pending.requested_at).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
    }

    const alertBox = document.getElementById("student-update-pending-alert");
    if (alertBox) {
      if (hasPending) {
        alertBox.innerHTML = `
          <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:0.5rem; padding:0.75rem 1rem; color:#d97706; font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; width:100%;">
            <i data-lucide="alert-triangle" style="width:16px; height:16px;"></i>
            <span>You have a pending update request submitted on <strong>${pendingDateStr}</strong>. Modifying and saving will update your pending request.</span>
          </div>
        `;
      } else {
        alertBox.innerHTML = "";
      }
      lucide.createIcons();
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== null && val !== undefined ? val : "";
    };

    let genderVal = valuesToUse.gender;
    if (genderVal) {
      genderVal = genderVal.charAt(0).toUpperCase() + genderVal.slice(1).toLowerCase();
    }

    setVal("stu-upd-gender", genderVal);
    setVal("stu-upd-caste", valuesToUse.caste);
    setVal("stu-upd-email", valuesToUse.email);
    setVal("stu-upd-phone", valuesToUse.phone);
    setVal("stu-upd-father-name", valuesToUse.father_name);
    setVal("stu-upd-mother-name", valuesToUse.mother_name);
    setVal("stu-upd-father-phone", valuesToUse.father_phone);
    setVal("stu-upd-10-board", valuesToUse.class_10_board);
    setVal("stu-upd-10-pct", valuesToUse.class_10_percent);
    setVal("stu-upd-12-board", valuesToUse.class_12_board);
    setVal("stu-upd-12-pct", valuesToUse.class_12_percent);
    setVal("stu-upd-diploma-pct", valuesToUse.diploma_percent);
    setVal("stu-upd-cgpa", valuesToUse.current_cgpa);

    // Populate Semester Attendance
    for (let num = 1; num <= 8; num++) {
      const curVal = currentValues.sem_attendance?.[num] !== undefined ? currentValues.sem_attendance[num] : "";
      const useVal = valuesToUse.sem_attendance?.[num] !== undefined ? valuesToUse.sem_attendance[num] : "";
      setVal(`stu-upd-sem-${num}`, useVal);
      
      const currentLabel = document.getElementById(`stu-upd-sem-${num}-current`);
      const inputEl = document.getElementById(`stu-upd-sem-${num}`);
      if (currentLabel && inputEl) {
        if (hasPending && String(curVal).trim() !== String(useVal).trim()) {
          currentLabel.textContent = `Current: ${curVal !== "" ? curVal + "%" : "None"}`;
          currentLabel.style.display = "block";
          inputEl.style.borderColor = "rgba(245, 158, 11, 0.5)";
        } else {
          currentLabel.style.display = "none";
          inputEl.style.borderColor = "";
        }
      }
    }

    // Set comparison labels for standard fields
    const fieldMapping = {
      gender: "stu-upd-gender",
      caste: "stu-upd-caste",
      email: "stu-upd-email",
      phone: "stu-upd-phone",
      father_name: "stu-upd-father-name",
      mother_name: "stu-upd-mother-name",
      father_phone: "stu-upd-father-phone",
      class_10_board: "stu-upd-10-board",
      class_10_percent: "stu-upd-10-pct",
      class_12_board: "stu-upd-12-board",
      class_12_percent: "stu-upd-12-pct",
      diploma_percent: "stu-upd-diploma-pct",
      current_cgpa: "stu-upd-cgpa"
    };
    
    Object.entries(fieldMapping).forEach(([key, id]) => {
      let curVal = currentValues[key];
      let useVal = valuesToUse[key];
      
      if (key === "gender") {
        if (curVal) curVal = curVal.charAt(0).toUpperCase() + curVal.slice(1).toLowerCase();
        if (useVal) useVal = useVal.charAt(0).toUpperCase() + useVal.slice(1).toLowerCase();
      }
      
      const currentLabel = document.getElementById(`${id}-current`);
      const inputEl = document.getElementById(id);
      if (currentLabel && inputEl) {
        if (hasPending && String(curVal).trim() !== String(useVal).trim()) {
          currentLabel.textContent = `Current: ${curVal !== "" ? curVal : "None"}`;
          currentLabel.style.display = "block";
          inputEl.style.borderColor = "rgba(245, 158, 11, 0.5)";
        } else {
          currentLabel.style.display = "none";
          inputEl.style.borderColor = "";
        }
      }
    });

    // Populate achievements
    window._studentPendingAchievements = Array.isArray(valuesToUse.achievements) ? [...valuesToUse.achievements] : [];
    
    window.renderStudentUpdAchievementsList = () => {
      const container = document.getElementById("stu-upd-ach-list-container");
      if (!container) return;
      if (window._studentPendingAchievements.length === 0) {
        container.innerHTML = `<span style="color:var(--text-muted); font-style:italic; font-size:0.82rem;">No achievements added yet.</span>`;
      } else {
        container.innerHTML = window._studentPendingAchievements.map((ach, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:0.4rem 0.6rem; border-radius:0.4rem; border:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="background:rgba(16, 185, 129, 0.12); color:#10b981; padding:0.15rem 0.45rem; border-radius:0.25rem; font-size:0.68rem; font-weight:700; text-transform:uppercase;">${ach.type}</span>
              <span style="font-weight:600; font-size:0.82rem; color:var(--text-main);">${ach.name}</span>
            </div>
            ${window._studentAchievementsDisabled ? "" : `<button type="button" onclick="window.removeStudentUpdAchievement(${idx})" style="background:none; border:none; color:var(--error); font-size:1.1rem; cursor:pointer; font-weight:700;">&times;</button>`}
          </div>
        `).join("");
      }
      
      const currentLabel = document.getElementById("stu-upd-achievements-current");
      if (currentLabel) {
        const currentAchStr = JSON.stringify(student.achievements || []);
        const pendingAchStr = JSON.stringify(window._studentPendingAchievements);
        if (hasPending && currentAchStr !== pendingAchStr) {
          const oldList = (student.achievements || []).map(a => `[${a.type}] ${a.name}`).join(", ") || "None";
          currentLabel.textContent = `Current Achievements: ${oldList}`;
          currentLabel.style.display = "block";
        } else {
          currentLabel.style.display = "none";
        }
      }
    };

    window.addStudentUpdAchievement = () => {
      const typeSelect = document.getElementById("stu-upd-new-ach-type");
      const nameInput = document.getElementById("stu-upd-new-ach-name");
      if (!typeSelect || !nameInput) return;
      const type = typeSelect.value;
      const name = nameInput.value.trim();
      if (!type || !name) {
        showToast("Please enter achievement details", "error");
        return;
      }
      window._studentPendingAchievements.push({ type, name });
      window.renderStudentUpdAchievementsList();
      nameInput.value = "";
    };

    window.removeStudentUpdAchievement = (idx) => {
      window._studentPendingAchievements.splice(idx, 1);
      window.renderStudentUpdAchievementsList();
    };

    window.setStudentUpdateFieldsDisabled = (disabled) => {
      const ids = [
        "stu-upd-gender", "stu-upd-caste", "stu-upd-email", "stu-upd-phone",
        "stu-upd-father-name", "stu-upd-mother-name", "stu-upd-father-phone",
        "stu-upd-10-board", "stu-upd-10-pct", "stu-upd-12-board", "stu-upd-12-pct",
        "stu-upd-diploma-pct", "stu-upd-cgpa",
        "stu-upd-new-ach-type", "stu-upd-new-ach-name"
      ];
      for (let num = 1; num <= 8; num++) {
        ids.push(`stu-upd-sem-${num}`);
      }
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
      });

      const addBtn = document.querySelector("button[onclick='window.addStudentUpdAchievement()']");
      if (addBtn) addBtn.disabled = disabled;

      window._studentAchievementsDisabled = disabled;
      window.renderStudentUpdAchievementsList();
    };

    const actionContainer = document.getElementById("stu-upd-action-container");
    if (actionContainer) {
      if (hasPending) {
        window.setStudentUpdateFieldsDisabled(true);
        actionContainer.innerHTML = `
          <button class="btn-primary" disabled style="background:#10b981; border-color:#10b981; padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem; color:white; opacity:1; cursor:default;">
            <i data-lucide="check-circle" style="width:18px; height:18px;"></i> Submitted
          </button>
          <button class="btn-primary" id="btn-edit-pending-request" onclick="window.enableStudentProfileEditing()" style="background:#003366; border-color:#003366; padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem; color:white; cursor:pointer;">
            <i data-lucide="edit-3" style="width:18px; height:18px;"></i> Edit
          </button>
        `;
      } else {
        window.setStudentUpdateFieldsDisabled(false);
        actionContainer.innerHTML = `
          <button class="btn-primary" id="btn-update-selected-fields" onclick="window.submitStudentProfileUpdates()" style="background:#003366; border-color:#003366; padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
            <i data-lucide="save" style="width:18px; height:18px;"></i> Submit Update Request
          </button>
        `;
      }
      lucide.createIcons();
    }

    window.enableStudentProfileEditing = () => {
      window.setStudentUpdateFieldsDisabled(false);
      if (actionContainer) {
        actionContainer.innerHTML = `
          <button class="btn-primary" id="btn-update-selected-fields" onclick="window.submitStudentProfileUpdates()" style="background:#003366; border-color:#003366; padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem; color:white; cursor:pointer;">
            <i data-lucide="save" style="width:18px; height:18px;"></i> Save Changes
          </button>
          <button class="btn-primary" onclick="window.initStudentUpdateProfileTab()" style="background:transparent; border:1px solid var(--border); padding:0.8rem 2.5rem; border-radius:0.5rem; font-size:0.95rem; font-weight:700; display:flex; align-items:center; gap:0.5rem; color:var(--text-main); cursor:pointer;">
            Cancel
          </button>
        `;
        lucide.createIcons();
      }
    };

    window.renderStudentUpdAchievementsList();

  } catch (err) {
    console.error("Failed to load profile update state:", err);
    showToast("Failed to load profile update state: " + err.message, "error");
  }
};

window.submitStudentProfileUpdates = async () => {
  const student = currentState.studentData;
  if (!student) return;

  const btn = document.getElementById("btn-update-selected-fields");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Submitting Request...";
  }

  try {
    const gender = document.getElementById("stu-upd-gender").value;
    const caste = document.getElementById("stu-upd-caste").value.trim() || null;
    const email = document.getElementById("stu-upd-email").value.trim() || null;
    const phone = document.getElementById("stu-upd-phone").value.trim() || null;
    const father_name = document.getElementById("stu-upd-father-name").value.trim() || null;
    const mother_name = document.getElementById("stu-upd-mother-name").value.trim() || null;
    const father_phone = document.getElementById("stu-upd-father-phone").value.trim() || null;
    const class_10_board = document.getElementById("stu-upd-10-board").value.trim() || null;
    const class_10_percent = parseFloat(document.getElementById("stu-upd-10-pct").value) || null;
    const class_12_board = document.getElementById("stu-upd-12-board").value.trim() || null;
    const class_12_percent = parseFloat(document.getElementById("stu-upd-12-pct").value) || null;
    const diploma_percent = parseFloat(document.getElementById("stu-upd-diploma-pct").value) || null;
    const current_cgpa = parseFloat(document.getElementById("stu-upd-cgpa").value) || null;

    if (current_cgpa !== null && (current_cgpa < 0 || current_cgpa > 10)) {
      throw new Error("CGPA must be between 0 and 10");
    }

    const sem_attendance = {};
    for (let num = 1; num <= 8; num++) {
      const inputEl = document.getElementById(`stu-upd-sem-${num}`);
      const val = inputEl ? parseFloat(inputEl.value) : NaN;
      sem_attendance[num] = !isNaN(val) ? val : null;
    }

    const achievements = window._studentPendingAchievements || [];

    const newVal = {
      gender, caste, email, phone, father_name, mother_name, father_phone,
      class_10_board, class_10_percent, class_12_board, class_12_percent, diploma_percent, current_cgpa,
      sem_attendance, achievements
    };

    const oldVal = {
      gender: student.gender || "",
      caste: student.caste || "",
      email: student.email || "",
      phone: student.phone || "",
      father_name: student.father_name || "",
      mother_name: student.mother_name || "",
      father_phone: student.father_phone || "",
      class_10_board: student.class_10_board || "",
      class_10_percent: student.class_10_percent || "",
      class_12_board: student.class_12_board || "",
      class_12_percent: student.class_12_percent || "",
      diploma_percent: student.diploma_percent || "",
      current_cgpa: student.current_cgpa || "",
      sem_attendance: student.sem_attendance || {},
      achievements: student.achievements || []
    };

    const { data: pending } = await supabaseClient
      .from("student_updates")
      .select("id")
      .eq("student_id", student.id)
      .eq("status", "Pending")
      .eq("field_name", "profile_update")
      .maybeSingle();

    if (pending) {
      const { error } = await supabaseClient
        .from("student_updates")
        .update({
          new_value: newVal,
          old_value: oldVal,
          requested_at: new Date().toISOString()
        })
        .eq("id", pending.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from("student_updates")
        .insert({
          student_id: student.id,
          field_name: "profile_update",
          old_value: oldVal,
          new_value: newVal,
          status: "Pending",
          requested_at: new Date().toISOString()
        });
      if (error) throw error;
    }

    showToast("Profile update request submitted for coordinator verification!");
    await window.initStudentUpdateProfileTab();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save" style="width:18px; height:18px;"></i> Submit Update Request`;
      lucide.createIcons();
    }
  }
};

window.filterStudentTimeline = () => {
  const query = (document.getElementById("student-search-input")?.value || "")
    .toLowerCase()
    .trim();
  const dateFilter =
    document.getElementById("student-date-filter")?.value || "";
  const statusFilter = currentState.studentStatusFilter || "All";
  const rows = document.querySelectorAll("#student-timeline-table tbody tr");
  rows.forEach((row) => {
    const searchContent = row.getAttribute("data-search") || "";
    const rowDate = row.getAttribute("data-date") || "";
    const rowStatus = row.getAttribute("data-status") || "";
    const matchSearch = !query || searchContent.includes(query);
    const matchDate = !dateFilter || rowDate === dateFilter;
    const matchStatus = statusFilter === "All" || rowStatus === statusFilter;
    row.style.display = matchSearch && matchDate && matchStatus ? "" : "none";
  });
};

window.filterStudentByDate = () => {
  window.filterStudentTimeline();
};

window.filterStudentStatus = (status) => {
  currentState.studentStatusFilter = status;
  const statusButtons = document.querySelectorAll(".student-status-btn");
  statusButtons.forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(
    `status-btn-${status.replace(/\s+/g, "-")}`,
  );
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
  window.filterStudentTimeline();
};

window.logoutStudent = () => {
  currentState.role = "admin";
  currentState.studentData = null;
  currentState.user = null;
  renderLogin();
  showToast("Signed out of student portal");
};

window.loadStudentTimetable = async () => {
  const student = currentState.studentData;
  if (!student) return;
  const grid = document.getElementById("student-timetable-grid");
  if (!grid) return;
  const { data: classObj } = await supabaseClient
    .from("classes")
    .select("*")
    .eq("branch", student.branch)
    .eq("year", student.year)
    .eq("section", student.section)
    .maybeSingle();

  let myTT = [];
  if (classObj) {
    const { data: ttEntries } = await supabaseClient
      .from("timetable")
      .select("*, teachers(*), subjects(*), classes(*)")
      .eq("class_id", classObj.id);
    myTT = ttEntries || [];
  }

  const { data: teachersData } = await supabaseClient
    .from("teachers")
    .select("*");
  const teachersList = teachersData || [];

  if (myTT.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
            <p>No timetable has been scheduled for your class (${student.branch} ${student.year} - Sec ${student.section}) yet.</p>
        </div>`;
    return;
  }

  const days = ["MON", "TUE", "WED", "THUR", "FRI", "SAT"];

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const clean = timeStr.replace(/:/g, ".");
    const parts = clean.split(".");
    let hr = parseInt(parts[0], 10);
    let min = parseInt(parts[1], 10) || 0;
    if (hr < 8) {
      hr += 12;
    }
    return hr * 60 + min;
  };

  const getTeacherInitials = (entry) => {
    const teacherIds =
      entry.teacher_ids && entry.teacher_ids.length > 0
        ? entry.teacher_ids
        : entry.teacher_id
          ? [entry.teacher_id]
          : [];

    if (teacherIds.length === 0) return "—";

    return teacherIds
      .map((tid) => {
        const t = teachersList.find((tch) => tch.id === tid);
        if (!t) return "";
        const cleanName = t.name.replace(
          /^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i,
          "",
        );
        const parts = cleanName.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return parts
          .map((p) => p[0])
          .join("")
          .toUpperCase();
      })
      .filter(Boolean)
      .join("/");
  };

  const getLabRoom = (entry) => {
    if (entry.batch === "B1") return "Lab 225 (A)";
    if (entry.batch === "B2") return "Lab 225 (B)";
    return "Lab 225";
  };

  const renderSlotsForDay = (day, slotsList) => {
    let html = "";
    for (let i = 0; i < slotsList.length; i++) {
      const ts = slotsList[i];
      const entries = myTT.filter((t) => {
        if (t.day_of_week !== day) return false;
        const entryStart = timeToMinutes(t.start_time);
        const entryEnd = timeToMinutes(t.end_time);

        const [slotStartStr, slotEndStr] = ts.split("-");
        const slotStart = timeToMinutes(slotStartStr);
        const slotEnd = timeToMinutes(slotEndStr);

        return entryStart <= slotStart && entryEnd >= slotEnd;
      });

      if (entries.length > 0) {
        const representative = entries[0];
        const entryStart = timeToMinutes(representative.start_time);
        const entryEnd = timeToMinutes(representative.end_time);

        const [slotStartStr] = ts.split("-");
        const slotStart = timeToMinutes(slotStartStr);
        if (entryStart < slotStart) {
          continue;
        }

        let colspan = 1;
        for (let j = i + 1; j < slotsList.length; j++) {
          const nextTs = slotsList[j];
          const [nextStartStr, nextEndStr] = nextTs.split("-");
          const nextStart = timeToMinutes(nextStartStr);
          const nextEnd = timeToMinutes(nextEndStr);
          if (entryStart <= nextStart && entryEnd >= nextEnd) {
            colspan++;
          } else {
            break;
          }
        }
        const cellsContent = entries
          .map((entry, idx) => {
            const initials = getTeacherInitials(entry);
            let lineContent = "";
            if (entry.is_lab) {
              const room = getLabRoom(entry);
              lineContent = `${entry.subjects?.code || ""} ${entry.subjects?.name || ""} (${entry.batch || "All"}) [${room}] ${initials}`;
            } else {
              lineContent = `${entry.subjects?.code || ""} ${entry.subjects?.name || ""} (${initials})`;
            }

            return `
                        <div style="display:flex; justify-content:center; align-items:center; gap:0.3rem; padding: 0.1rem 0; width: 100%; line-height: 1.25;">
                            <span style="font-size: 0.68rem; font-weight: 600; color: var(--text-main); font-family: 'Outfit', sans-serif; text-align: center; word-break: break-word;">${lineContent}</span>
                        </div>
                    `;
          })
          .join("");

        html += `<td colspan="${colspan}" style="background: rgba(99,102,241,0.02); border: 1px solid var(--border); vertical-align: middle; text-align: center; padding: 0.25rem 0.2rem;">
                    <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width: 100%; height: 100%; padding: 0.15rem 0;">
                        ${cellsContent}
                    </div>
                </td>`;
        i += colspan - 1;
      } else {
        html += `<td>
                    <span style="color: var(--text-muted);">—</span>
                </td>`;
      }
    }
    return html;
  };

  grid.innerHTML = `
        <div style="margin-bottom:1rem;font-weight:600;color:var(--primary);">
            ${student.branch} · ${student.year} Year · Sec ${student.section}
        </div>
        <div class="card" style="padding: 0; overflow-x: auto; margin-bottom: 0;">
            <table class="timetable-table">
                <colgroup>
                    <col style="width: 70px;">
                    <col style="width: 11%;">
                    <col style="width: 11%;">
                    <col style="width: 11%;">
                    <col style="width: 45px;">
                    <col style="width: 11%;">
                    <col style="width: 11%;">
                    <col style="width: 11%;">
                    <col style="width: 11%;">
                </colgroup>
                <thead>
                    <tr style="background: var(--bg-dark);">
                        <th style="border-right: 2px solid var(--border); text-align:center;">DAY</th>
                        <th>10.30-11.20<br><small style="color:var(--text-muted);font-weight:400">I</small></th>
                        <th>11.20-12.10<br><small style="color:var(--text-muted);font-weight:400">II</small></th>
                        <th>12.10-1.00<br><small style="color:var(--text-muted);font-weight:400">III</small></th>
                        <th style="background: rgba(99,102,241,0.05); color:var(--primary); font-size:0.6rem; writing-mode:vertical-rl; padding:0.3rem 0;">LUNCH</th>
                        <th>1.50-2.40<br><small style="color:var(--text-muted);font-weight:400">IV</small></th>
                        <th>2.40-3.30<br><small style="color:var(--text-muted);font-weight:400">V</small></th>
                        <th>3.30-4.15<br><small style="color:var(--text-muted);font-weight:400">VI</small></th>
                        <th>4.15-5.00<br><small style="color:var(--text-muted);font-weight:400">VII</small></th>
                    </tr>
                </thead>
                <tbody>
                    ${days
                      .map(
                        (day) => `
                        <tr>
                            <td style="font-weight: 700; font-size: 0.75rem; border-right: 2px solid var(--border); background: var(--bg-dark); text-align:center;">${day}</td>
                            ${renderSlotsForDay(day, ["10.30-11.20", "11.20-12.10", "12.10-1.00"])}
                            <td style="background: rgba(99,102,241,0.04); border-left: 1px solid var(--border); border-right: 1px solid var(--border);"></td>
                            ${renderSlotsForDay(day, ["1.50-2.40", "2.40-3.30", "3.30-4.15", "4.15-5.00"])}
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;
  lucide.createIcons();
};

async function handleLogin(email, password, expectedRole, errorEl) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = "block";
    return;
  }
  const { data: teacher } = await supabaseClient
    .from("teachers")
    .select("*")
    .eq("email", email)
    .single();

  if (expectedRole === "teacher" && !teacher) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "This account is not registered as a Teacher.";
    errorEl.style.display = "block";
  } else if (expectedRole === "admin" && teacher) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "Teacher accounts must use the Teacher portal.";
    errorEl.style.display = "block";
  } else if (expectedRole === "hod" && (!teacher || !teacher.is_hod)) {
    await supabaseClient.auth.signOut();
    errorEl.textContent = "This account does not have HOD privileges.";
    errorEl.style.display = "block";
  } else {
    currentState.user = data.user;
    await checkRoleAndLoadData();
    renderMainLayout();
  }
}

function renderMainLayout() {
  if (currentState.role === "admin" && !currentState.selectedDept) {
    renderAdminScopeSelector();
    return;
  }
  if (
    currentState.role === "hod" &&
    !currentState.hodModeSelected &&
    currentState.teacherData
  ) {
    renderHodModeSelector();
    return;
  }
  const app = document.getElementById("app");
  const isTeacher = currentState.role === "teacher";
  if (!currentState.expandedMenus) {
    currentState.expandedMenus = {
      home: true,
      academics: true,
      coordinator: true,
      mst: true,
      hod: true,
    };
  }

  const isExpanded = (menuId) => !!currentState.expandedMenus[menuId];

  app.innerHTML = `
        <div id="sidebar-overlay" class="sidebar-overlay" onclick="window.toggleSidebar()"></div>
        <nav class="sidebar">
            <div class="sidebar-header" style="justify-content: center; align-items: center; flex-direction: column; gap: 1rem; padding: 0.5rem 0.5rem 1.25rem 0.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 1.5rem;">
               <img src="https://acropolis.in/wp-content/uploads/2023/03/unnamed-1024x203.png"
style="max-width:90%;max-height:50px;object-fit:contain;">
                ${
                  isTeacher
                    ? `
                    <div class="sidebar-profile" style="width: 100%; margin: 0; box-sizing: border-box;">
                        <div class="sidebar-profile-avatar">
                            ${(currentState.teacherData?.name || "T")[0].toUpperCase()}
                        </div>
                        <div class="sidebar-profile-info">
                            <h4>${currentState.teacherData?.name || "Teacher"}</h4>
                            <p>${currentState.teacherData?.is_coordinator ? "Coordinator" : "Faculty"} · Online</p>
                        </div>
                    </div>
                `
                    : ""
                }
            </div>

            <div class="nav-group">
                ${
                  isTeacher
                    ? `
                    <div class="nav-item ${["markAttendance", "teacherSchedule", "studentHistory"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('home')">
                        <span class="nav-item-content">
                            <i data-lucide="home"></i> Home
                        </span>
                        <i data-lucide="${isExpanded("home") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                    </div>
                    ${
                      isExpanded("home")
                        ? `
                    <div class="nav-submenu">
                        <div class="nav-sub-item ${currentState.view === "markAttendance" ? "active" : ""}" onclick="window.switchView('markAttendance')">Mark Attendance</div>
                        <div class="nav-sub-item ${currentState.view === "teacherSchedule" ? "active" : ""}" onclick="window.switchView('teacherSchedule')">My Schedule</div>
                        <div class="nav-sub-item ${currentState.view === "studentHistory" ? "active" : ""}" onclick="window.switchView('studentHistory')">Student History</div>
                    </div>`
                        : ""
                    }
                    <div class="nav-item ${["markMstMarks", "viewMstMarks", "viewMstTimetable"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('mst')">
                        <span class="nav-item-content">
                            <i data-lucide="clipboard-list"></i> Mid Sem Exams
                        </span>
                        <i data-lucide="${isExpanded("mst") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                    </div>
                    ${
                      isExpanded("mst")
                        ? `
                    <div class="nav-submenu">
                        <div class="nav-sub-item ${currentState.view === "markMstMarks" ? "active" : ""}" onclick="window.switchView('markMstMarks')">Mark MST Marks</div>
                        <div class="nav-sub-item ${currentState.view === "viewMstMarks" ? "active" : ""}" onclick="window.switchView('viewMstMarks')">Subject MST Marks</div>
                        <div class="nav-sub-item ${currentState.view === "viewMstTimetable" ? "active" : ""}" onclick="window.switchView('viewMstTimetable')">MST Timetable</div>
                    </div>`
                        : ""
                    }
                    ${
                      currentState.teacherData?.is_coordinator
                        ? `
                        <div class="nav-item ${["coordDashboard", "coordAllStudents", "coordEditStudents", "coordEditAttendance", "coordStudentRequests"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('coordinator')">
                            <span class="nav-item-content">
                                <i data-lucide="shield-alert"></i> Coordinator
                            </span>
                            <i data-lucide="${isExpanded("coordinator") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                        </div>
                        ${
                          isExpanded("coordinator")
                            ? `
                        <div class="nav-submenu">
                            <div class="nav-sub-item ${currentState.view === "coordDashboard" ? "active" : ""}" onclick="window.switchView('coordDashboard')">Dashboard</div>
                            <div class="nav-sub-item ${currentState.view === "coordAllStudents" ? "active" : ""}" onclick="window.switchView('coordAllStudents')">All Students</div>
                            <div class="nav-sub-item ${currentState.view === "coordEditStudents" ? "active" : ""}" onclick="window.switchView('coordEditStudents')">Edit Students</div>
                            <div class="nav-sub-item ${currentState.view === "coordEditAttendance" ? "active" : ""}" onclick="window.switchView('coordEditAttendance')">Edit Attendance</div>
                            <div class="nav-sub-item ${currentState.view === "coordStudentRequests" ? "active" : ""}" onclick="window.switchView('coordStudentRequests')">Student Requests</div>
                        </div>`
                            : ""
                        }
                    `
                        : ""
                    }
                    ${
                      currentState.teacherData?.is_hod
                        ? `
                        <div class="nav-item" onclick="window.switchAdminScope()" style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem; cursor: pointer;">
                            <span class="nav-item-content" style="color: var(--primary); font-weight: 700;">
                                <i data-lucide="refresh-cw" style="color: var(--primary);"></i> Switch Mode
                            </span>
                        </div>
                    `
                        : ""
                    }
                `
                    : currentState.role === "hod"
                      ? `
                    <div class="nav-item ${currentState.view === "hodDashboard" ? "active" : ""}" onclick="window.switchView('hodDashboard')">
                        <span class="nav-item-content"><i data-lucide="home"></i> HOD Dashboard</span>
                    </div>
                    <div class="nav-item" onclick="window.switchAdminScope()" style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem; cursor: pointer;">
                        <span class="nav-item-content" style="color: var(--primary); font-weight: 700;">
                            <i data-lucide="refresh-cw" style="color: var(--primary);"></i> Switch Mode/Scope
                        </span>
                    </div>
                `
                      : `
                    <div class="nav-item ${["dashboard", "teachers", "students", "manageHods"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('home')">
                        <span class="nav-item-content"><i data-lucide="home"></i> Home</span>
                        <i data-lucide="${isExpanded("home") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                    </div>
                    ${
                      isExpanded("home")
                        ? `
                    <div class="nav-submenu">
                        <div class="nav-sub-item ${currentState.view === "dashboard" ? "active" : ""}" onclick="window.switchView('dashboard')">Dashboard</div>
                        <div class="nav-sub-item ${currentState.view === "teachers" ? "active" : ""}" onclick="window.switchView('teachers')">Teachers</div>
                        <div class="nav-sub-item ${currentState.view === "students" ? "active" : ""}" onclick="window.switchView('students')">Students</div>
                        <div class="nav-sub-item ${currentState.view === "manageHods" ? "active" : ""}" onclick="window.switchView('manageHods')">HODs</div>
                    </div>`
                        : ""
                    }
                    <div class="nav-item ${["subjects", "classes", "departments", "timetable"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('academics')">
                        <span class="nav-item-content"><i data-lucide="graduation-cap"></i> Academics</span>
                        <i data-lucide="${isExpanded("academics") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                    </div>
                    ${
                      isExpanded("academics")
                        ? `
                    <div class="nav-submenu">
                        <div class="nav-sub-item ${currentState.view === "subjects" ? "active" : ""}" onclick="window.switchView('subjects')">Subjects</div>
                        <div class="nav-sub-item ${currentState.view === "classes" ? "active" : ""}" onclick="window.switchView('classes')">Classes</div>
                        <div class="nav-sub-item ${currentState.view === "departments" ? "active" : ""}" onclick="window.switchView('departments')">Departments</div>
                        <div class="nav-sub-item ${currentState.view === "timetable" ? "active" : ""}" onclick="window.switchView('timetable')">Timetable</div>
                    </div>`
                        : ""
                    }
                    <div class="nav-item ${["mstSettings", "mstTimetable"].includes(currentState.view) ? "active" : ""}" onclick="window.toggleSubmenu('mst')">
                        <span class="nav-item-content"><i data-lucide="clipboard-list"></i> Mid Sem Exams</span>
                        <i data-lucide="${isExpanded("mst") ? "chevron-up" : "chevron-down"}" style="width: 14px; height: 14px;"></i>
                    </div>
                    ${
                      isExpanded("mst")
                        ? `
                    <div class="nav-submenu">
                        <div class="nav-sub-item ${currentState.view === "mstSettings" ? "active" : ""}" onclick="window.switchView('mstSettings')">MST Settings</div>
                        <div class="nav-sub-item ${currentState.view === "mstTimetable" ? "active" : ""}" onclick="window.switchView('mstTimetable')">MST Timetable</div>
                    </div>`
                        : ""
                    }
                `
                }
            </div>

            <div style="margin-top: auto; border-top: 1px solid var(--border); padding-top: 1rem;">
                <div class="nav-item" onclick="logout()" style="color: var(--error);">
                    <span class="nav-item-content" style="color: var(--error);">
                        <i data-lucide="log-out" style="color: var(--error);"></i> Logout
                    </span>
                </div>
            </div>
        </nav>
        <main class="main-content">
            <header class="app-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid rgba(0,0,0,0.05); background: #ffffff; margin-top: -2rem; margin-left: -2.5rem; margin-right: -2.5rem; height: 70px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.01);">
                <button class="mobile-menu-toggle" onclick="window.toggleSidebar()" style="display: none; background: #fafafa; border: 1px solid rgba(0,0,0,0.06); border-radius: 0.5rem; padding: 0.5rem; color: var(--text-main); cursor: pointer; align-items: center; justify-content: center; margin-right: 1rem;">
                    <i data-lucide="menu"></i>
                </button>
                ${
                  currentState.role === "admin" && (currentState.departments || []).length > 0
                    ? `
                    <div class="header-dept-scoped" style="display: flex; align-items: center; gap: 0.5rem; margin-left: 0.5rem;">
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; display: inline-block;">Scope:</span>
                        <select onchange="window.changeScopedDept(this.value)" style="background: var(--bg-dark); color: var(--primary); padding: 0.35rem 0.65rem; border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; outline: none;">
                            ${(currentState.departments || []).map((d) => `<option value="${d.name}" ${currentState.selectedDept === d.name ? "selected" : ""}>${d.name}</option>`).join("")}
                        </select>
                    </div>
                `
                    : ""
                }
                <div class="profile-dropdown-container" onclick="window.toggleProfileDropdown(event)" style="display: flex; align-items: center; gap: 0.75rem; user-select: none; margin-left: auto;">
                    <div style="position: relative;">
                        <img id="header-profile-pic" src="${localStorage.getItem("user_profile_pic_" + currentState.user.email) || "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23333682%22><circle cx=%2212%22 cy=%228%22 r=%224%22/><path d=%22M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z%22/></svg>"}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #f0f2fa; background: #f0f2fa;">
                    </div>
                    <div style="display: flex; flex-direction: column; text-align: left; font-family: inherit;">
                        <span style="font-size: 0.875rem; font-weight: 600; color: #1f2937; line-height: 1.25;">${(currentState.role === "teacher" || currentState.role === "hod") && currentState.teacherData ? currentState.teacherData.name : currentState.role === "hod" ? "Head of Department" : "Admin Principal"}</span>
                        <span style="font-size: 0.75rem; color: #9ca3af; font-weight: 500;">${currentState.role === "teacher" ? "Teacher" : currentState.role === "hod" ? "HOD" : "Admin"}</span>
                    </div>
                    <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: #9ca3af;"></i>
                    <div id="profile-dropdown-menu" class="profile-dropdown-menu" style="padding: 1rem; text-align: center;">
                        <div style="display: flex; flex-direction: column; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(0,0,0,0.05); margin-bottom: 0.5rem; cursor: pointer;" onclick="window.viewProfilePicFull(event)" title="Click to view full image">
                            <img id="dropdown-profile-pic" src="${localStorage.getItem("user_profile_pic_" + currentState.user.email) || "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23333682%22><circle cx=%2212%22 cy=%228%22 r=%224%22/><path d=%22M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z%22/></svg>"}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #f0f2fa; background: #f0f2fa; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <span style="font-size: 0.85rem; font-weight: 700; color: #1f2937; margin-top: 0.5rem;">${(currentState.role === "teacher" || currentState.role === "hod") && currentState.teacherData ? currentState.teacherData.name : currentState.role === "hod" ? "Head of Department" : "Admin Principal"}</span>
                            <span style="font-size: 0.72rem; color: #9ca3af; word-break: break-all;">${currentState.user.email}</span>
                            <span style="font-size: 0.65rem; color: var(--primary); font-weight: 600; margin-top: 0.25rem;">🔍 Click to enlarge</span>
                        </div>
                        <div class="dropdown-item" onclick="window.triggerProfilePicChange(event)">
                            <i data-lucide="camera" style="color:var(--primary);"></i> Change Profile Pic
                        </div>
                        <div class="dropdown-item" onclick="window.openChangePasswordModal(event)">
                            <i data-lucide="key-round" style="color:var(--primary);"></i> Change Password
                        </div>
                        <div class="dropdown-item" onclick="logout()" style="color: var(--error); border-top: 1px solid rgba(0,0,0,0.05); border-radius: 0; margin-top: 0.25rem; padding-top: 0.5rem;">
                            <i data-lucide="log-out" style="color:var(--error);"></i> Logout
                        </div>
                    </div>
                </div>
            </header>
            <div id="main-content"></div>
        </main>
    `;
  lucide.createIcons();
  renderActiveView();
}

window.toggleSidebar = () => {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("show");
};

window.toggleProfileDropdown = (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById("profile-dropdown-menu");
  if (dropdown) dropdown.classList.toggle("show");
};
document.addEventListener("click", () => {
  const dropdown = document.getElementById("profile-dropdown-menu");
  if (dropdown) dropdown.classList.remove("show");
});

window.viewProfilePicFull = (e) => {
  e.stopPropagation();
  const currentPic =
    localStorage.getItem("user_profile_pic_" + currentState.user.email) ||
    "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23333682%22><circle cx=%2212%22 cy=%228%22 r=%224%22/><path d=%22M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z%22/></svg>";
  const modal = document.createElement("div");
  modal.style =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;justify-content:center;align-items:center;z-index:3000;cursor:pointer;animation:fadeIn 0.2s ease-out;";
  modal.onclick = () => modal.remove();
  const img = document.createElement("img");
  img.src = currentPic;
  img.style =
    "max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);object-fit:contain;background:#f0f2fa;padding:10px;";
  modal.appendChild(img);
  document.body.appendChild(modal);
};

window.triggerProfilePicChange = (e) => {
  e.stopPropagation();
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const dataUrl = readerEvent.target.result;
        localStorage.setItem(
          "user_profile_pic_" + currentState.user.email,
          dataUrl,
        );
        const picEl = document.getElementById("header-profile-pic");
        if (picEl) picEl.src = dataUrl;
        const dropdownPicEl = document.getElementById("dropdown-profile-pic");
        if (dropdownPicEl) dropdownPicEl.src = dataUrl;
        showToast("Profile picture updated successfully!");
      };
      reader.readAsDataURL(file);
    }
  };
  fileInput.click();
};

window.openChangePasswordModal = (e) => {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("profile-dropdown-menu");
  if (dropdown) dropdown.classList.remove("show");
  const modalDiv = document.createElement("div");
  modalDiv.id = "change-password-modal";
  modalDiv.className = "modal-overlay";
  modalDiv.style.display = "flex";

  modalDiv.innerHTML = `
        <div class="modal-card" style="max-width: 400px; padding: 2.25rem; position: relative;">
            <button onclick="document.getElementById('change-password-modal').remove()" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%;">×</button>
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--primary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="key-round" style="width: 20px; height: 20px; color: var(--primary);"></i> Change Password
            </h3>
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label>New Password</label>
                <input type="password" id="new-password-input" placeholder="Enter new password" style="background: rgba(255,255,255,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.85rem; font-size: 0.9rem;">
            </div>
            <div class="form-group" style="margin-bottom: 1.75rem;">
                <label>Confirm Password</label>
                <input type="password" id="confirm-password-input" placeholder="Confirm new password" style="background: rgba(255,255,255,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.85rem; font-size: 0.9rem;">
            </div>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button class="btn-secondary" onclick="document.getElementById('change-password-modal').remove()" style="padding: 0.5rem 1rem; font-size: 0.85rem; border-radius: 8px; box-shadow:none;">Cancel</button>
                <button class="btn-primary" onclick="window.saveNewPassword()" style="padding: 0.5rem 1.25rem; font-size: 0.85rem; border-radius: 8px; box-shadow:none;">Save Password</button>
            </div>
        </div>
    `;

  document.body.appendChild(modalDiv);
  lucide.createIcons();
};

window.saveNewPassword = async () => {
  const newPassword = document.getElementById("new-password-input").value;
  const confirmPassword = document.getElementById(
    "confirm-password-input",
  ).value;

  if (!newPassword) {
    showToast("Password cannot be empty", "error");
    return;
  }
  if (newPassword.length < 6) {
    showToast("Password must be at least 6 characters", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast("Passwords do not match", "error");
    return;
  }

  const saveBtn = document.querySelector("#change-password-modal .btn-primary");
  saveBtn.disabled = true;
  saveBtn.textContent = "Updating...";

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    showToast(error.message, "error");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Password";
  } else {
    showToast("Password updated successfully!");
    document.getElementById("change-password-modal").remove();
  }
};

window.handleGlobalSearch = (val) => {
  const query = val.toLowerCase().trim();
  const rows = document.querySelectorAll("table tbody tr");
  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
};

window.toggleSubmenu = (menuId) => {
  if (!currentState.expandedMenus) {
    currentState.expandedMenus = {
      home: true,
      academics: true,
      coordinator: true,
      hod: true,
    };
  }
  currentState.expandedMenus[menuId] = !currentState.expandedMenus[menuId];
  renderMainLayout();
};

window.switchView = (view) => {
  currentState.view = view;
  if (view === "studentHistory") {
    currentState.studentHistoryRecords = null;
  }
  renderMainLayout();
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
  }
  if (overlay && overlay.classList.contains("show")) {
    overlay.classList.remove("show");
  }
};

function animateCountUps() {
  const elements = document.querySelectorAll(".stat-value, .stat-card-value");
  elements.forEach((el) => {
    if (el.dataset.animated) return;
    const text = el.textContent.trim();
    const match = text.match(/^([\d.]+)(.*)$/);
    if (match) {
      const targetVal = parseFloat(match[1]);
      const suffix = match[2] || "";
      if (!isNaN(targetVal)) {
        el.dataset.animated = "true";
        let start = 0;
        const duration = 1000; // 1s duration
        const startTime = performance.now();

        const updateNumber = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          const currentVal = start + (targetVal - start) * ease;

          if (Number.isInteger(targetVal)) {
            el.textContent = Math.floor(currentVal) + suffix;
          } else {
            el.textContent = currentVal.toFixed(1) + suffix;
          }

          if (progress < 1) {
            requestAnimationFrame(updateNumber);
          } else {
            el.textContent = text;
          }
        };
        requestAnimationFrame(updateNumber);
      }
    }
  });
}

function renderActiveView() {
  const container = document.getElementById("main-content");
  if (currentState.role === "teacher" || currentState.role === "hod") {
    switch (currentState.view) {
      case "hodDashboard":
        renderHodDashboard(container);
        break;
      case "markAttendance":
        renderMarkAttendance(container);
        break;
      case "teacherSchedule":
        renderTeacherSchedule(container);
        break;
      case "studentHistory":
        renderStudentHistory(container);
        break;
      case "coordDashboard":
        renderCoordDashboard(container);
        break;
      case "coordAllStudents":
        renderCoordAllStudents(container);
        break;
      case "coordEditStudents":
        renderCoordEditStudents(container);
        break;
      case "coordEditAttendance":
        renderCoordEditAttendance(container);
        break;
      case "coordStudentRequests":
        renderCoordStudentRequests(container);
        break;
      case "markMstMarks":
        renderMstMarksEntry(container);
        break;
      case "viewMstMarks":
        renderMstSubjectMarks(container);
        break;
      case "viewMstTimetable":
        renderMstTimetableTeacher(container);
        break;
    }
  } else {
    switch (currentState.view) {
      case "dashboard":
        renderDashboard(container);
        break;
      case "hodDashboard":
        renderHodDashboard(container);
        break;
      case "teachers":
        renderTeachers(container);
        break;
      case "students":
        renderStudents(container);
        break;
      case "manageHods":
        renderManageHods(container);
        break;
      case "subjects":
        renderSubjects(container);
        break;
      case "classes":
        renderClasses(container);
        break;
      case "departments":
        renderDepartments(container);
        break;
      case "timetable":
        renderTimetable(container);
        break;
      case "mstSettings":
        renderMstSettings(container);
        break;
      case "mstTimetable":
        renderMstTimetable(container);
        break;
    }
  }
  lucide.createIcons();
  setTimeout(animateCountUps, 50);
  setTimeout(window.init3DTilt, 100);
  setTimeout(window.initScrollReveal, 150);
}

window.toggleMarkAttendanceType = (val) => {
  const isLab = val === "Lab";
  const subContainer = document.getElementById("sel-subject-container");
  const batchContainer = document.getElementById("sel-batch-container");
  const labConfigs = document.getElementById("sel-lab-configs");
  const andSpan = document.getElementById("sel-lecture-no-and");
  const endLecSelect = document.getElementById("sel-lecture-no-end");

  if (subContainer) subContainer.style.display = isLab ? "none" : "block";
  if (batchContainer) batchContainer.style.display = "block";
  if (labConfigs) labConfigs.style.display = isLab ? "block" : "none";
  if (andSpan) andSpan.style.display = isLab ? "inline" : "none";
  if (endLecSelect) endLecSelect.style.display = isLab ? "block" : "none";
  window.checkTeacherSelectionValid();
};
window.checkTeacherSelectionValid = () => {
  const isLab = document.getElementById("sel-class-type")?.value === "Lab";
  const hasB1 = document.getElementById("sel-batch-b1")?.checked;
  const hasB2 = document.getElementById("sel-batch-b2")?.checked;
  const isBatchwise = isLab && ((hasB1 && !hasB2) || (!hasB1 && hasB2));

  const checked = document.querySelectorAll(
    'input[name="sel-teacher-checkbox"]:checked',
  ).length;
  const required = isLab && !isBatchwise ? 2 : 1;
  const btn = document.getElementById("load-students-btn");
  const hint = document.getElementById("teacher-select-hint");
  const valid = checked >= required;

  if (btn) {
    btn.disabled = !valid;
    btn.style.opacity = valid ? "1" : "0.45";
    btn.style.cursor = valid ? "pointer" : "not-allowed";
  }
  if (hint) {
    if (valid) {
      hint.textContent = `${checked} teacher${checked > 1 ? "s" : ""} selected ✔`;
      hint.style.color = "var(--accent)";
    } else {
      hint.textContent =
        required === 2
          ? `Lab requires at least 2 teachers — ${checked} selected.`
          : `Please select at least 1 teacher.`;
      hint.style.color = "var(--error)";
    }
  }
};

window.updateTeachersForActiveSchedule = () => {
  const tEntry = currentState.activeTimetableEntry;
  if (!tEntry) {
    window.filterConductingTeachers([]);
    return;
  }

  const isLab = document.getElementById("sel-class-type")?.value === "Lab";
  if (!isLab) {
    let teacherIds = [];
    if (tEntry.teacher_ids && tEntry.teacher_ids.length > 0) {
      teacherIds = tEntry.teacher_ids;
    } else if (tEntry.teacher_id) {
      teacherIds = [tEntry.teacher_id];
    }

    const checkboxes = document.querySelectorAll(
      'input[name="sel-teacher-checkbox"]',
    );
    checkboxes.forEach((cb) => {
      cb.checked = teacherIds.includes(cb.value);
    });
    window.filterConductingTeachers(teacherIds);
    return;
  }
  const parallelEntries = currentState.timetable.filter(
    (t) =>
      t.class_id === tEntry.class_id &&
      t.day_of_week === tEntry.day_of_week &&
      t.start_time === tEntry.start_time &&
      t.is_lab === true,
  );

  const hasB1 = document.getElementById("sel-batch-b1")?.checked;
  const hasB2 = document.getElementById("sel-batch-b2")?.checked;

  const activeEntries = parallelEntries.filter((t) => {
    const isForB1 =
      !t.batch || t.batch === "B1" || t.batch === "All" || t.batch === "Both";
    const isForB2 =
      !t.batch || t.batch === "B2" || t.batch === "All" || t.batch === "Both";
    if (hasB1 && isForB1) return true;
    if (hasB2 && isForB2) return true;
    return false;
  });

  let activeTeacherIds = [];
  activeEntries.forEach((t) => {
    if (t.teacher_ids && t.teacher_ids.length > 0) {
      t.teacher_ids.forEach((tid) => {
        if (!activeTeacherIds.includes(tid)) activeTeacherIds.push(tid);
      });
    } else if (t.teacher_id) {
      if (!activeTeacherIds.includes(t.teacher_id))
        activeTeacherIds.push(t.teacher_id);
    }
  });
  if (activeTeacherIds.length === 0) {
    const currentTeacherId = currentState.teacherData?.id;
    if (currentTeacherId) activeTeacherIds.push(currentTeacherId);
  }
  const checkboxes = document.querySelectorAll(
    'input[name="sel-teacher-checkbox"]',
  );
  checkboxes.forEach((cb) => {
    cb.checked = activeTeacherIds.includes(cb.value);
  });
  window.filterConductingTeachers(activeTeacherIds);
};

window.onManualFormChange = () => {
  currentState.activeTimetableEntry = null;
  window.checkTeacherSelectionValid();
  window.filterConductingTeachers([]);

  const year = document.getElementById("sel-year")?.value || "";
  const branch = document.getElementById("sel-branch")?.value || "";
  const section = document.getElementById("sel-section")?.value || "";
  const teacher = currentState.teacherData;

  if (teacher) {
    // 1. Find all subjects this teacher teaches overall across the entire timetable
    const teacherSlots = currentState.timetable.filter(
      (t) => t.teacher_id === teacher.id || (t.teacher_ids && t.teacher_ids.includes(teacher.id))
    );
    const teacherSubjectIds = [...new Set(teacherSlots.map((t) => t.subject_id))];
    
    // Default to only the subjects this teacher teaches (or fall back to all subjects if they teach none)
    let filteredSubjects = teacherSubjectIds.length > 0
      ? currentState.subjects.filter((s) => teacherSubjectIds.includes(s.id))
      : currentState.subjects;

    // 2. If a specific class is selected, further filter to subjects this teacher teaches IN THAT CLASS
    if (year && branch && section) {
      const targetClass = currentState.classes.find(
        (c) => c.year === year && c.branch === branch && c.section === section
      );
      if (targetClass) {
        const classSlots = teacherSlots.filter((t) => t.class_id === targetClass.id);
        const classSubjectIds = [...new Set(classSlots.map((t) => t.subject_id))];
        filteredSubjects = currentState.subjects.filter((s) => classSubjectIds.includes(s.id));
      }
    }

    const populateSelect = (selectId) => {
      const selectEl = document.getElementById(selectId);
      if (selectEl) {
        const currentVal = selectEl.value;
        selectEl.innerHTML = `<option value="" disabled>Select Subject</option>` + 
          filteredSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("");
        if (filteredSubjects.some(s => s.id === currentVal)) {
          selectEl.value = currentVal;
        } else {
          selectEl.value = "";
        }
      }
    };
    
    populateSelect("sel-subject");
    populateSelect("sel-subject-b1");
    populateSelect("sel-subject-b2");
  }
  
  if (window.updateLoadStudentsButton) window.updateLoadStudentsButton();
};

window.updateLoadStudentsButton = () => {
  const container = document.getElementById("load-students-btn-container");
  if (!container) return;

  const lectureNoVal = parseInt(document.getElementById("sel-lecture-no")?.value || "1", 10);
  const lectureNoValEndEl = document.getElementById("sel-lecture-no-end");
  const isLab = document.getElementById("sel-class-type")?.value === "Lab";
  const lectureNoValEnd = (isLab && lectureNoValEndEl && lectureNoValEndEl.style.display !== "none") ? parseInt(lectureNoValEndEl.value, 10) : NaN;

  const isLec1Marked = window._currentMarkedLectureNos && window._currentMarkedLectureNos.includes(lectureNoVal);
  const isLec2Marked = !isNaN(lectureNoValEnd) && window._currentMarkedLectureNos && window._currentMarkedLectureNos.includes(lectureNoValEnd);

  const isMarked = isLab ? (isLec1Marked || isLec2Marked) : isLec1Marked;

  if (isMarked) {
    container.innerHTML = `
      <div style="display:flex; gap:1rem; width:100%;">
        <span style="background:rgba(16,185,129,0.12); color:var(--accent); padding:0.75rem 1.5rem; border-radius:0.5rem; font-size:0.9rem; font-weight:700; border:1px solid rgba(16,185,129,0.35); flex:1; text-align:center; display:flex; align-items:center; justify-content:center; gap:0.4rem;">
          <i data-lucide="check-circle" style="width:16px; height:16px;"></i> Submitted
        </span>
        <button type="button" class="btn-primary" onclick="window.loadStudentList()" style="flex:1; padding:0.75rem 1.5rem; display:flex; align-items:center; justify-content:center; gap:0.4rem;">
          <i data-lucide="edit" style="width:16px; height:16px;"></i> Edit
        </button>
      </div>
    `;
    lucide.createIcons();
  } else {
    container.innerHTML = `
      <button id="load-students-btn" class="btn-primary" style="width:100%;" onclick="window.loadStudentList()">Load Students</button>
    `;
  }
};

window.filterConductingTeachers = (conductingTeacherIds) => {
  const labels = document.querySelectorAll(".teacher-checkbox-label");
  const myDept = currentState.teacherData?.department;
  labels.forEach((label) => {
    const teacherId = label.getAttribute("data-teacher-id");
    const tObj = currentState.teachers.find((t) => t.id === teacherId);
    const isMyDept = tObj && tObj.department === myDept;

    if (conductingTeacherIds && conductingTeacherIds.length > 0) {
      if (conductingTeacherIds.includes(teacherId)) {
        label.style.display = "flex";
      } else {
        label.style.display = "none";
      }
    } else {
      if (isMyDept) {
        label.style.display = "flex";
      } else {
        label.style.display = "none";
      }
    }
  });
};

window.toggleMarkAttendanceBatchSection = (batch, checked) => {
  const id = batch === "B1" ? "sel-b1-config" : "sel-b2-config";
  const section = document.getElementById(id);
  if (section) section.style.display = checked ? "block" : "none";
  const hasB1 = document.getElementById("sel-batch-b1")?.checked;
  const hasB2 = document.getElementById("sel-batch-b2")?.checked;
  const bothCheckbox = document.getElementById("sel-batch-both");
  if (bothCheckbox) {
    bothCheckbox.checked = hasB1 && hasB2;
  }
  window.updateTeachersForActiveSchedule();
  window.checkTeacherSelectionValid();
};

window.toggleMarkAttendanceBatchBoth = (checked) => {
  const b1 = document.getElementById("sel-batch-b1");
  const b2 = document.getElementById("sel-batch-b2");
  if (b1) {
    b1.checked = checked;
    window.toggleMarkAttendanceBatchSection("B1", checked);
  }
  if (b2) {
    b2.checked = checked;
    window.toggleMarkAttendanceBatchSection("B2", checked);
  }
};

window.populateMarkAttendanceForm = (
  year,
  branch,
  section,
  subjectId,
  isLab,
  batch,
  teacherIdsStr,
  lectureNo = 1,
) => {
  document.getElementById("sel-year").value = year;
  document.getElementById("sel-branch").value = branch;
  document.getElementById("sel-section").value = section;
  if (document.getElementById("header-year"))
    document.getElementById("header-year").value = year;
  if (document.getElementById("header-branch"))
    document.getElementById("header-branch").value = branch;
  if (document.getElementById("header-section"))
    document.getElementById("header-section").value = section;
  currentState.selectedHeaderClass = { year, branch, section };

  document.getElementById("sel-class-type").value = isLab ? "Lab" : "Lecture";
  window.toggleMarkAttendanceType(isLab ? "Lab" : "Lecture");

  if (document.getElementById("sel-lecture-no")) {
    document.getElementById("sel-lecture-no").value = String(lectureNo);
  }

  if (isLab) {
    const checkB1 = document.getElementById("sel-batch-b1");
    const checkB2 = document.getElementById("sel-batch-b2");
    const checkBoth = document.getElementById("sel-batch-both");

    if (batch === "B1") {
      if (checkB1) {
        checkB1.checked = true;
        window.toggleMarkAttendanceBatchSection("B1", true);
      }
      if (checkB2) {
        checkB2.checked = false;
        window.toggleMarkAttendanceBatchSection("B2", false);
      }
      if (checkBoth) checkBoth.checked = false;
      const subB1 = document.getElementById("sel-subject-b1");
      if (subB1) subB1.value = subjectId;
    } else if (batch === "B2") {
      if (checkB1) {
        checkB1.checked = false;
        window.toggleMarkAttendanceBatchSection("B1", false);
      }
      if (checkB2) {
        checkB2.checked = true;
        window.toggleMarkAttendanceBatchSection("B2", true);
      }
      if (checkBoth) checkBoth.checked = false;
      const subB2 = document.getElementById("sel-subject-b2");
      if (subB2) subB2.value = subjectId;
    } else {
      if (checkB1) {
        checkB1.checked = true;
        window.toggleMarkAttendanceBatchSection("B1", true);
      }
      if (checkB2) {
        checkB2.checked = true;
        window.toggleMarkAttendanceBatchSection("B2", true);
      }
      if (checkBoth) checkBoth.checked = true;
      const subB1 = document.getElementById("sel-subject-b1");
      const subB2 = document.getElementById("sel-subject-b2");
      if (subB1) subB1.value = subjectId;
      if (subB2) subB2.value = subjectId;
    }
  } else {
    const selSub = document.getElementById("sel-subject");
    if (selSub) selSub.value = subjectId;
  }
  window.updateTeachersForActiveSchedule();

  showToast("Loaded details from schedule!");
  window.checkTeacherSelectionValid();
  window.loadStudentList();
};

window.changeMarkAttendanceDate = (value) => {
  currentState.selectedMarkAttendanceDate = value;
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const parts = value.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month, day);
  currentState.selectedMarkAttendanceDay = daysOfWeek[dateObj.getDay()];
  const selDateEl = document.getElementById("sel-date");
  if (selDateEl) {
    selDateEl.value = value;
  }

  renderActiveView();
};
async function getTodayLecturesWithStatus(teacher) {
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const todayDate =
    currentState.selectedMarkAttendanceDate ||
    new Date().toLocaleDateString("en-CA");
  const parts = todayDate.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month, day);
  const todayDay = daysOfWeek[dateObj.getDay()];

  const formatDbTime = (dbTime) => {
    if (!dbTime) return "";
    const parts = dbTime.split(":");
    const hr = parseInt(parts[0], 10);
    const min = parts[1];
    if (hr >= 10) return `${hr}.${min}`;
    return `${hr > 12 ? hr - 12 : hr}.${min}`;
  };

  const todayClasses = currentState.timetable
    .filter(
      (t) =>
        t.day_of_week === todayDay &&
        (t.teacher_id === teacher.id ||
          (t.teacher_ids && t.teacher_ids.includes(teacher.id))),
    )
    .map((t) => ({
      ...t,
      slot: `${formatDbTime(t.start_time)}-${formatDbTime(t.end_time)}`,
    }))
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  for (const lec of todayClasses) {
    const classId = lec.class_id;
    const subjectId = lec.subject_id;
    const { data: existing } = await supabaseClient
      .from("attendance_records")
      .select("id")
      .eq("date", todayDate)
      .eq("class_id", classId)
      .eq("subject_id", subjectId)
      .limit(1);
    lec.isSubmitted = existing && existing.length > 0;
    lec.todayDate = todayDate;
  }
  return todayClasses;
}

async function renderMarkAttendance(container) {
  const teacher = currentState.teacherData;
  const todayClasses = await getTodayLecturesWithStatus(teacher);

  let branchOptions = [...new Set(currentState.classes.map((c) => c.branch))];
  if (teacher && teacher.department === "IT") {
    branchOptions = ["IT", "DS"];
  }
  const teacherTimetableSlots = currentState.timetable.filter(
    (t) =>
      t.teacher_id === teacher?.id ||
      (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
  );
  const teacherSubjectIds = [
    ...new Set(teacherTimetableSlots.map((t) => t.subject_id)),
  ];
  const visibleSubjects =
    teacherSubjectIds.length > 0
      ? currentState.subjects.filter((s) => teacherSubjectIds.includes(s.id))
      : currentState.subjects;

  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const todayDate =
    currentState.selectedMarkAttendanceDate ||
    new Date().toLocaleDateString("en-CA");
  const parts = todayDate.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month, day);
  const todayDay = daysOfWeek[dateObj.getDay()];

  const selManual = currentState.selectedHeaderClass || {
    year: "",
    branch: "",
    section: "",
    type: "Lecture",
    lectureNo: "1",
    lectureNoEnd: "",
    subjectId: ""
  };

  const selectedClass = currentState.classes.find(
    (c) => c.year === selManual.year && c.branch === selManual.branch && c.section === selManual.section
  );
  const selectedClassId = selectedClass ? selectedClass.id : null;

  let markedLectureNos = [];
  let markedLecturesDetails = [];
  if (selectedClassId) {
    try {
      const { data: markedRecs } = await supabaseClient
        .from("attendance_records")
        .select("lecture_no, subject_id, teacher_id, teacher_ids, subjects(code, name), teachers(name)")
        .eq("date", todayDate)
        .eq("class_id", selectedClassId);
      if (markedRecs) {
        markedLectureNos = [...new Set(markedRecs.map(r => parseInt(r.lecture_no, 10)).filter(Boolean))];
        markedLecturesDetails = markedRecs;
      }
    } catch (e) {
      console.error("Error fetching marked lecture numbers:", e);
    }
  }
  
  window._currentMarkedLectureNos = markedLectureNos;

  let filteredClasses = [];
  if (selManual.year && selManual.branch && selManual.section && selectedClassId) {
    filteredClasses = currentState.timetable
      .filter(
        (t) =>
          t.day_of_week === todayDay &&
          String(t.class_id) === String(selectedClassId)
      )
      .map((t) => ({
        ...t,
        slot: `${formatDbTime(t.start_time)}-${formatDbTime(t.end_time)}`,
      }))
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  } else {
    filteredClasses = todayClasses;
    if (selManual.year) {
      filteredClasses = filteredClasses.filter(
        (t) => t.classes?.year === selManual.year,
      );
    }
    if (selManual.branch) {
      filteredClasses = filteredClasses.filter(
        (t) => t.classes?.branch === selManual.branch,
      );
    }
    if (selManual.section) {
      filteredClasses = filteredClasses.filter(
        (t) => String(t.classes?.section) === String(selManual.section),
      );
    }
  }

  window.onHeaderClassChange = () => {
    const yr = document.getElementById("header-year")?.value || "";
    const br = document.getElementById("header-branch")?.value || "";
    const sec = document.getElementById("header-section")?.value || "";
    const type = document.getElementById("header-type")?.value || "Lecture";
    const lecNo = document.getElementById("header-lecture-no")?.value || "1";
    const lecNoEnd = document.getElementById("header-lecture-no-end")?.value || "";
    const subId = document.getElementById("header-subject")?.value || "";

    currentState.selectedHeaderClass = { year: yr, branch: br, section: sec, type, lectureNo: lecNo, lectureNoEnd: lecNoEnd, subjectId: subId };
    renderMarkAttendance(container);
  };

  setTimeout(() => {
    const selManual = currentState.selectedHeaderClass;
    if (
      selManual &&
      (selManual.year || selManual.branch || selManual.section)
    ) {
      const form = document.getElementById("lecture-mark-form");
      if (form) {
        form.style.display = "block";
        if (selManual.year)
          document.getElementById("sel-year").value = selManual.year;
        if (selManual.branch)
          document.getElementById("sel-branch").value = selManual.branch;
        if (selManual.section)
          document.getElementById("sel-section").value = selManual.section;
        if (selManual.type) {
          document.getElementById("sel-class-type").value = selManual.type;
          window.toggleMarkAttendanceType(selManual.type);
        }
        if (selManual.lectureNo)
          document.getElementById("sel-lecture-no").value = selManual.lectureNo;
        if (selManual.type === "Lab" && selManual.lectureNoEnd) {
          const endSel = document.getElementById("sel-lecture-no-end");
          if (endSel) endSel.value = selManual.lectureNoEnd;
        }
        if (selManual.subjectId)
          document.getElementById("sel-subject").value = selManual.subjectId;
        
        window.onManualFormChange();
        if (window.updateLoadStudentsButton) window.updateLoadStudentsButton();
      }
    }
  }, 50);

  container.innerHTML = `
        <h1 style="margin-bottom: 1.5rem;">Mark Attendance</h1>

        <div style="margin-bottom: 2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem;">
                <div style="font-size:0.75rem;text-transform:uppercase;font-weight:700;color:var(--primary);letter-spacing:0.08em;margin:0;">📅 Scheduled Lectures</div>
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Select Date:</span>
                        <input type="date" id="mark-attendance-date-select" onchange="window.changeMarkAttendanceDate(this.value)" value="${todayDate}" style="width: auto; max-width: 140px; background:var(--bg-dark); color:var(--primary); padding:0.35rem 0.65rem; border:1px solid var(--border); border-radius:0.5rem; font-size:0.8rem; font-family:inherit; font-weight:600; cursor:pointer; outline:none;">
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Year:</span>
                        <select id="header-year" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                            <option value="" ${!selManual.year ? "selected" : ""}>-- Year --</option>
                            <option value="1st" ${selManual.year === "1st" ? "selected" : ""}>1st</option>
                            <option value="2nd" ${selManual.year === "2nd" ? "selected" : ""}>2nd</option>
                            <option value="3rd" ${selManual.year === "3rd" ? "selected" : ""}>3rd</option>
                            <option value="4th" ${selManual.year === "4th" ? "selected" : ""}>4th</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Branch:</span>
                        <select id="header-branch" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                            <option value="" ${!selManual.branch ? "selected" : ""}>-- Branch --</option>
                            ${branchOptions.map((b) => `<option value="${b}" ${selManual.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Section:</span>
                        <select id="header-section" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                            <option value="" ${!selManual.section ? "selected" : ""}>-- Sec --</option>
                            ${window.getBranchSectionsList(selManual.branch).map((s) => `<option value="${s}" ${selManual.section === s ? "selected" : ""}>${s}</option>`).join("")}
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Type:</span>
                        <select id="header-type" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                            <option value="Lecture" ${selManual.type === "Lecture" ? "selected" : ""}>Lecture</option>
                            <option value="Lab" ${selManual.type === "Lab" ? "selected" : ""}>Lab</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Lecture:</span>
                        <select id="header-lecture-no" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                            <option value="1" ${selManual.lectureNo === "1" ? "selected" : ""}>Lecture 1${markedLectureNos.includes(1) ? " (Marked)" : ""}</option>
                            <option value="2" ${selManual.lectureNo === "2" ? "selected" : ""}>Lecture 2${markedLectureNos.includes(2) ? " (Marked)" : ""}</option>
                            <option value="3" ${selManual.lectureNo === "3" ? "selected" : ""}>Lecture 3${markedLectureNos.includes(3) ? " (Marked)" : ""}</option>
                            <option value="4" ${selManual.lectureNo === "4" ? "selected" : ""}>Lecture 4${markedLectureNos.includes(4) ? " (Marked)" : ""}</option>
                            <option value="5" ${selManual.lectureNo === "5" ? "selected" : ""}>Lecture 5${markedLectureNos.includes(5) ? " (Marked)" : ""}</option>
                            <option value="6" ${selManual.lectureNo === "6" ? "selected" : ""}>Lecture 6${markedLectureNos.includes(6) ? " (Marked)" : ""}</option>
                        </select>
                        ${selManual.type === "Lab" ? `
                            <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">&</span>
                            <select id="header-lecture-no-end" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow);">
                                <option value="" ${!selManual.lectureNoEnd ? "selected" : ""}>-- Select --</option>
                                <option value="2" ${selManual.lectureNoEnd === "2" ? "selected" : ""}>Lecture 2${markedLectureNos.includes(2) ? " (Marked)" : ""}</option>
                                <option value="3" ${selManual.lectureNoEnd === "3" ? "selected" : ""}>Lecture 3${markedLectureNos.includes(3) ? " (Marked)" : ""}</option>
                                <option value="4" ${selManual.lectureNoEnd === "4" ? "selected" : ""}>Lecture 4${markedLectureNos.includes(4) ? " (Marked)" : ""}</option>
                                <option value="5" ${selManual.lectureNoEnd === "5" ? "selected" : ""}>Lecture 5${markedLectureNos.includes(5) ? " (Marked)" : ""}</option>
                                <option value="6" ${selManual.lectureNoEnd === "6" ? "selected" : ""}>Lecture 6${markedLectureNos.includes(6) ? " (Marked)" : ""}</option>
                            </select>
                        ` : ""}
                    </div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Subject:</span>
                        <select id="header-subject" onchange="window.onHeaderClassChange()" style="background:#ffffff; color:var(--primary); padding:0.35rem 0.75rem; border:1px solid var(--border); border-radius:0.6rem; font-size:0.85rem; font-family:inherit; font-weight:700; cursor:pointer; outline:none; box-shadow:var(--shadow); max-width:200px;">
                            <option value="" ${!selManual.subjectId ? "selected" : ""}>-- Subject --</option>
                            ${visibleSubjects.map((s) => `<option value="${s.id}" ${selManual.subjectId === s.id ? "selected" : ""}>${s.code} - ${s.name}</option>`).join("")}
                        </select>
                    </div>
                </div>
            </div>
            ${
              filteredClasses.length > 0
                ? `
            <div class="lecture-cards-container" style="display:flex;gap:1rem;flex-wrap:wrap;">
                ${filteredClasses
                  .map((t, idx) => {
                    const lectureNo = idx + 1;
                    const markedRecord = markedLecturesDetails.find(r => parseInt(r.lecture_no, 10) === lectureNo);
                    const submitted = !!markedRecord;

                    let displaySubject = "";
                    let displayTeachers = "";
                    if (submitted) {
                      displaySubject = `${markedRecord.subjects?.code} — ${markedRecord.subjects?.name}`;
                      const actualTids = (markedRecord.teacher_ids || [markedRecord.teacher_id]).filter(Boolean);
                      displayTeachers = actualTids.length > 0
                        ? actualTids
                            .map((tid) => currentState.teachers.find((tc) => tc.id === tid)?.name || "")
                            .filter(Boolean)
                            .join(", ")
                        : markedRecord.teachers?.name || "System";
                    } else {
                      displaySubject = `${t.subjects?.code} — ${t.subjects?.name}`;
                      displayTeachers = t.teacher_ids && t.teacher_ids.length > 0
                        ? t.teacher_ids
                            .map((tid) => {
                              const tc = currentState.teachers.find(
                                (tch) => tch.id === tid,
                              );
                              return tc ? tc.name : "";
                            })
                            .filter(Boolean)
                            .join(", ")
                        : t.teachers?.name || teacher?.name || "";
                    }

                    const typeLabel = t.is_lab
                      ? `Lab (${t.batch || "All"})`
                      : "Lecture";
                    return `
                        <div class="card lecture-card ${submitted ? "submitted" : ""}" style="flex: 1; min-width: 250px; padding: 1rem 1.25rem; margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">${t.slot} · Lecture ${lectureNo}</div>
                                <div style="font-weight:700;font-size:0.9rem;margin-bottom:0.15rem;">${displaySubject}</div>
                                <div style="font-size:0.75rem;color:var(--primary);">${t.classes?.branch} ${t.classes?.year} · Sec ${t.classes?.section}</div>
                                <div style="font-size:0.7rem;color:var(--text-muted);margin:0.2rem 0;">${typeLabel}</div>
                                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.75rem;">${submitted ? "Submitted by: " : ""}${displayTeachers}</div>
                            </div>
                            ${
                              submitted
                                ? `<div style="display:flex;gap:0.5rem;align-items:center;margin-top:auto;">
                                    <span style="background:rgba(16,185,129,0.12);color:var(--accent);padding:0.3rem 0.75rem;border-radius:1rem;font-size:0.75rem;font-weight:700;border:1px solid rgba(16,185,129,0.35);">✓ Lecture ${lectureNo} Submitted</span>
                                    <button onclick="window.openLectureMark('${t.id}','${t.teacher_ids && t.teacher_ids.length > 0 ? t.teacher_ids.join(",") : t.teacher_id || ""}')" class="btn-secondary" style="padding:0.3rem 0.75rem;font-size:0.75rem;border-radius:0.5rem;">Edit</button>
                                   </div>`
                                : `<button onclick="window.openLectureMark('${t.id}','${t.teacher_ids && t.teacher_ids.length > 0 ? t.teacher_ids.join(",") : t.teacher_id || ""}')" class="btn-primary" style="width:100%;padding:0.5rem;font-size:0.8rem;margin-top:auto;">Mark Attendance</button>`
                            }
                        </div>
                    `;
                  })
                  .join("")}
            </div>`
                : `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 2rem; color:var(--text-muted); font-size:0.9rem; text-align:center;">
                📅 No classes scheduled for this selection. You can adjust the filters or select another date.
            </div>`
            }
        </div>

        <div id="lecture-mark-form" style="display:none;">
            <div class="card mark-form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end;">
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="sel-date" value="${todayDate}">
                </div>
                <div class="form-group">
                    <label>Year</label>
                    <select id="sel-year" required onchange="window.onManualFormChange()">
                        <option value="" disabled selected>Select Year</option>
                        <option value="1st">1st</option>
                        <option value="2nd">2nd</option>
                        <option value="3rd">3rd</option>
                        <option value="4th">4th</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Branch</label>
                    <select id="sel-branch" required onchange="window.updateManualSectionOptions(); window.onManualFormChange()">
                        <option value="" disabled selected>Select Branch</option>
                        ${branchOptions.map((b) => `<option value="${b}">${b}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>Section</label>
                    <select id="sel-section" required onchange="window.onManualFormChange()">
                        <option value="" disabled selected>Select Section</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Class Type</label>
                    <select id="sel-class-type" onchange="window.toggleMarkAttendanceType(this.value); window.onManualFormChange()">
                        <option value="Lecture" selected>Lecture</option>
                        <option value="Lab">Lab</option>
                    </select>
                </div>
                <div class="form-group" id="sel-subject-container">
                    <label>Subject</label>
                    <select id="sel-subject" style="width:100%;" onchange="window.onManualFormChange()">
                        <option value="" disabled selected>Select Subject</option>
                        ${visibleSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group" id="sel-lecture-no-container">
                    <label>Lecture No</label>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <select id="sel-lecture-no" style="width:100%;" onchange="window.updateLoadStudentsButton()">
                            <option value="1" selected>Lecture 1${markedLectureNos.includes(1) ? " (Marked)" : ""}</option>
                            <option value="2">Lecture 2${markedLectureNos.includes(2) ? " (Marked)" : ""}</option>
                            <option value="3">Lecture 3${markedLectureNos.includes(3) ? " (Marked)" : ""}</option>
                            <option value="4">Lecture 4${markedLectureNos.includes(4) ? " (Marked)" : ""}</option>
                            <option value="5">Lecture 5${markedLectureNos.includes(5) ? " (Marked)" : ""}</option>
                            <option value="6">Lecture 6${markedLectureNos.includes(6) ? " (Marked)" : ""}</option>
                        </select>
                        <span id="sel-lecture-no-and" style="display:none; font-weight:700;">&</span>
                        <select id="sel-lecture-no-end" style="width:100%; display:none;" onchange="window.updateLoadStudentsButton()">
                            <option value="" disabled selected>-- Select --</option>
                            <option value="2">Lecture 2${markedLectureNos.includes(2) ? " (Marked)" : ""}</option>
                            <option value="3">Lecture 3${markedLectureNos.includes(3) ? " (Marked)" : ""}</option>
                            <option value="4">Lecture 4${markedLectureNos.includes(4) ? " (Marked)" : ""}</option>
                            <option value="5">Lecture 5${markedLectureNos.includes(5) ? " (Marked)" : ""}</option>
                            <option value="6">Lecture 6${markedLectureNos.includes(6) ? " (Marked)" : ""}</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" id="sel-batch-container">
                    <label style="margin-bottom: 0.5rem; display:block;">Filter by Batch</label>
                    <div style="display:flex; gap:1.5rem; align-items:center; height: 42px; flex-wrap: wrap;">
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main); margin:0;">
                            <input type="checkbox" id="sel-batch-both" style="width:auto;" onchange="window.toggleMarkAttendanceBatchBoth(this.checked)">
                            <span>Both</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main); margin:0;">
                            <input type="checkbox" id="sel-batch-b1" style="width:auto;" onchange="window.toggleMarkAttendanceBatchSection('B1', this.checked)">
                            <span>Batch B1</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main); margin:0;">
                            <input type="checkbox" id="sel-batch-b2" style="width:auto;" onchange="window.toggleMarkAttendanceBatchSection('B2', this.checked)">
                            <span>Batch B2</span>
                        </label>
                    </div>
                </div>
                <div id="sel-lab-configs" style="grid-column: 1 / -1; display: none; margin-top: 0.5rem;">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                        <div id="sel-b1-config" style="display: none; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; background: rgba(255,255,255,0.01);">
                            <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">Batch B1 Subject</h4>
                            <select id="sel-subject-b1" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);" onchange="window.onManualFormChange()">
                                <option value="" disabled selected>Select Subject for B1</option>
                                ${visibleSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                            </select>
                        </div>
                        <div id="sel-b2-config" style="display: none; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; background: rgba(255,255,255,0.01);">
                            <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">Batch B2 Subject</h4>
                            <select id="sel-subject-b2" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);" onchange="window.onManualFormChange()">
                                <option value="" disabled selected>Select Subject for B2</option>
                                ${visibleSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group" style="grid-column: 1 / -1; margin-top: 0.5rem;">
                    <label id="sel-teachers-label">Conducting Teachers</label>
                    <div id="sel-teachers-list" style="max-height:100px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:0.5rem;">
                        ${currentState.teachers
                          .map(
                            (t) => `
                            <label class="teacher-checkbox-label" data-teacher-id="${t.id}" style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main); font-size:0.85rem;">
                                <input type="checkbox" name="sel-teacher-checkbox" value="${t.id}" ${t.id === teacher?.id ? "checked" : ""} style="width:auto;" onchange="window.checkTeacherSelectionValid()">
                                <span>${t.name}</span>
                            </label>
                        `,
                          )
                          .join("")}
                    </div>
                    <p id="teacher-select-hint" style="font-size:0.78rem; color:var(--text-muted); margin-top:0.4rem;">Select at least 1 teacher for Lecture, or 2 teachers for Lab.</p>
                </div>
                <div class="form-group" style="grid-column: 1 / -1;" id="load-students-btn-container">
                    <button id="load-students-btn" class="btn-primary" style="width:100%;" onclick="window.loadStudentList()">Load Students</button>
                </div>
            </div>
        </div>
        <div id="student-list-container"></div>
        <style>.schedule-card-item:hover { transform: translateY(-2px); border-color: var(--primary) !important; }</style>
    `;
  setTimeout(window.init3DTilt, 100);
  setTimeout(() => {
    window.filterConductingTeachers([]);
  }, 50);
}

window.openLectureMark = (timetableId, teacherIdsStr) => {
  const tEntry = currentState.timetable.find((t) => t.id === timetableId);
  if (!tEntry) {
    currentState.activeTimetableEntry = null;
    const form = document.getElementById("lecture-mark-form");
    if (form) form.style.display = "block";
    return;
  }
  currentState.activeTimetableEntry = tEntry;
  const form = document.getElementById("lecture-mark-form");
  if (form) form.style.display = "block";
  form.scrollIntoView({ behavior: "smooth" });
  setTimeout(async () => {
    // Determine the lecture number based on existing attendance submissions for today
    let lectureNo = 1;
    try {
      const todayDate = currentState.selectedMarkAttendanceDate || new Date().toLocaleDateString("en-CA");
      const { data } = await supabaseClient
        .from("attendance_records")
        .select("lecture_no")
        .eq("date", todayDate)
        .eq("class_id", tEntry.class_id)
        .eq("subject_id", tEntry.subject_id);
      if (data && data.length > 0) {
        const markedLectures = data.map(r => r.lecture_no || 1);
        const maxLecture = Math.max(...markedLectures);
        // Default to the next lecture slot
        lectureNo = maxLecture + 1;
      }
    } catch (e) {
      console.error("Error auto-calculating next lecture no:", e);
    }
    
    window.populateMarkAttendanceForm(
      tEntry.classes?.year,
      tEntry.classes?.branch,
      tEntry.classes?.section,
      tEntry.subjects?.id,
      tEntry.is_lab,
      tEntry.batch || "",
      teacherIdsStr,
      lectureNo
    );
  }, 50);
};

window.loadStudentList = async () => {
  console.log("[DEBUG] loadStudentList called");
  try {
    const classTypeEl = document.getElementById("sel-class-type");
    console.log(
      "[DEBUG] sel-class-type element:",
      classTypeEl,
      "value:",
      classTypeEl?.value,
    );
    const isLab = classTypeEl?.value === "Lab";

    const isB1Checked = document.getElementById("sel-batch-b1")?.checked;
    const isB2Checked = document.getElementById("sel-batch-b2")?.checked;
    const isBatchwise =
      isLab && ((isB1Checked && !isB2Checked) || (!isB1Checked && isB2Checked));
    const requiredTeachers = isLab && !isBatchwise ? 2 : 1;

    const checkedTeachers = document.querySelectorAll(
      'input[name="sel-teacher-checkbox"]:checked',
    ).length;
    console.log(
      "[DEBUG] isLab:",
      isLab,
      "isBatchwise:",
      isBatchwise,
      "checkedTeachers:",
      checkedTeachers,
    );
    if (checkedTeachers < requiredTeachers) {
      if (requiredTeachers === 2) {
        showToast("Lab requires at least 2 teachers to be selected.", "error");
      } else {
        showToast("Please select at least 1 teacher.", "error");
      }
      return;
    }

    const year = document.getElementById("sel-year")?.value;
    const branch = document.getElementById("sel-branch")?.value;
    const section = document.getElementById("sel-section")?.value;
    console.log("[DEBUG] year:", year, "branch:", branch, "section:", section);
    console.log(
      "[DEBUG] currentState.students count:",
      currentState.students?.length,
    );
    console.log(
      "[DEBUG] currentState.classes count:",
      currentState.classes?.length,
    );
    const class_id = currentState.classes.find(
      (c) => c.year === year && c.branch === branch && c.section === section,
    )?.id;
    console.log("[DEBUG] class_id:", class_id);

    let filteredStudents = currentState.students.filter(
      (s) => s.year === year && s.branch === branch && s.section === section,
    );
    console.log("[DEBUG] filteredStudents count:", filteredStudents.length);
    const b1El = document.getElementById("sel-batch-b1");
    const b2El = document.getElementById("sel-batch-b2");
    console.log(
      "[DEBUG] sel-batch-b1 element:",
      b1El,
      "checked:",
      b1El?.checked,
    );
    console.log(
      "[DEBUG] sel-batch-b2 element:",
      b2El,
      "checked:",
      b2El?.checked,
    );
    const hasB1 = b1El?.checked || false;
    const hasB2 = b2El?.checked || false;
    if (hasB1 || hasB2) {
      filteredStudents = filteredStudents.filter((s) => {
        const studentBatch = s.batch || "B1";
        if (hasB1 && studentBatch === "B1") return true;
        if (hasB2 && studentBatch === "B2") return true;
        return false;
      });
    }
    filteredStudents.sort((a, b) =>
      compareRollNumbers(a.roll_no || "", b.roll_no || ""),
    );
    console.log(
      "[DEBUG] After sort, filteredStudents count:",
      filteredStudents.length,
    );
    const dateEl = document.getElementById("sel-date");
    console.log("[DEBUG] sel-date element:", dateEl, "value:", dateEl?.value);
    const dateVal = dateEl?.value;
    const subjectVal = !isLab
      ? document.getElementById("sel-subject")?.value
      : null;
    const b1SubjectVal = isLab
      ? document.getElementById("sel-subject-b1")?.value
      : null;
    const b2SubjectVal = isLab
      ? document.getElementById("sel-subject-b2")?.value
      : null;
    console.log("[DEBUG] dateVal:", dateVal, "subjectVal:", subjectVal);

    let existingRecords = [];
    if (class_id) {
      try {
        const lectureNoVal = parseInt(document.getElementById("sel-lecture-no")?.value || "1", 10);
        let query = supabaseClient
          .from("attendance_records")
          .select("id, student_id, status")
          .eq("date", dateVal)
          .eq("class_id", class_id)
          .eq("lecture_no", lectureNoVal);

        if (isLab) {
          const subjectsList = [b1SubjectVal, b2SubjectVal].filter(Boolean);
          if (subjectsList.length > 0) {
            query = query.in("subject_id", subjectsList);
          }
        } else if (subjectVal) {
          query = query.eq("subject_id", subjectVal);
        }

        const { data, error } = await query;
        if (error) throw error;
        existingRecords = data || [];
      } catch (e) {
        console.error("Error loading existing records:", e);
      }
    }

    const container = document.getElementById("student-list-container");
    container.innerHTML = `
            <div class="card" style="margin-top: 2rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem; align-items: center;">
                    <div>
                        <h3 style="margin:0;">Student List (${filteredStudents.length} Students)</h3>
                        <div class="bulk-switch-container" style="margin-top:0.65rem;">
                            <div class="attendance-switch bulk-switch absent-active" id="bulk-attendance-switch" onclick="window.toggleBulkMarkSwitch(this)">
                                <button class="switch-btn absent"><span class="full-text">Absent All</span><span class="short-text">All A</span></button>
                                <button class="switch-btn present"><span class="full-text">Present All</span><span class="short-text">All P</span></button>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <select id="filter-student-batch" onchange="window.filterStudents()" style="padding: 0.6rem 0.75rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem; font-family: inherit; outline: none; cursor: pointer;">
                            <option value="All">All Batches</option>
                            <option value="B1">Batch B1</option>
                            <option value="B2">Batch B2</option>
                        </select>
                        <input type="text" placeholder="Search by name or roll no..." id="search-student" onkeyup="window.filterStudents()" style="max-width: 200px; margin: 0;">
                    </div>
                </div>
                <div class="table-container">
                    <table id="attendance-table">
                        <thead>
                            <tr>
                                <th>Roll No</th>
                                <th>Name</th>
                                <th>Batch</th>
                                <th style="text-align:center;">Attendance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredStudents
                              .map((s) => {
                                const existing = existingRecords.find(
                                  (r) => r.student_id === s.id,
                                );
                                const status = existing
                                  ? existing.status
                                  : "Absent";
                                const activeClass =
                                  status === "Present"
                                    ? "present-active"
                                    : "absent-active";
                                return `
                                    <tr class="student-row" data-id="${s.id}" data-record-id="${existing ? existing.id : ""}" data-name="${s.name.toLowerCase()}" data-roll="${s.roll_no.toLowerCase()}" data-batch="${s.batch || "B1"}">
                                        <td>${s.roll_no}</td>
                                        <td>${s.name}</td>
                                        <td><span style="background:rgba(45,212,191,0.1);color:var(--accent);padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${s.batch || "B1"}</span></td>
                                        <td>
                                            <div style="display:flex; justify-content:center;">
                                                <div class="attendance-switch ${activeClass} student-row-switch" data-student-id="${s.id}" data-status="${status}" onclick="window.toggleStudentRowSwitch(this, '${s.id}')">
                                                    <button class="switch-btn absent"><span class="full-text">Absent</span><span class="short-text">A</span></button>
                                                    <button class="switch-btn present"><span class="full-text">Present</span><span class="short-text">P</span></button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                              })
                              .join("")}
                        </tbody>
                    </table>
                </div>
                <button class="btn-primary" style="margin-top: 2rem; width: 100%;" onclick="window.submitAttendance()">Submit Attendance</button>
            </div>
            <div id="submission-result" style="margin-top: 1rem;"></div>
        `;
  } catch (err) {
    console.error("Caught error in loadStudentList:", err);
    alert(
      "Runtime error in loadStudentList:\n" +
        err.message +
        "\nStack:\n" +
        err.stack,
    );
  }
};

window.setStatus = (btn, status) => {
  const parent = btn.parentElement;
  parent
    .querySelectorAll(".btn-status")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  parent.dataset.status = status;
};
window.toggleStudentRowSwitch = (element, studentId) => {
  const isPresent = element.classList.contains("absent-active"); // toggle it
  if (isPresent) {
    element.classList.remove("absent-active");
    element.classList.add("present-active");
    element.dataset.status = "Present";
  } else {
    element.classList.remove("present-active");
    element.classList.add("absent-active");
    element.dataset.status = "Absent";
  }
};
window.toggleBulkMarkSwitch = (element) => {
  const isPresentAll = element.classList.contains("absent-active"); // toggle it
  if (isPresentAll) {
    element.classList.remove("absent-active");
    element.classList.add("present-active");
  } else {
    element.classList.remove("present-active");
    element.classList.add("absent-active");
  }

  const targetStatus = isPresentAll ? "Present" : "Absent";
  const activeClass = isPresentAll ? "present-active" : "absent-active";
  const inactiveClass = isPresentAll ? "absent-active" : "present-active";

  const rowSwitches = document.querySelectorAll(".student-row-switch");
  let markedCount = 0;
  rowSwitches.forEach((sw) => {
    const row = sw.closest(".student-row");
    if (row && row.style.display !== "none") {
      sw.classList.remove(inactiveClass);
      sw.classList.add(activeClass);
      sw.dataset.status = targetStatus;
      markedCount++;
    }
  });

  showToast(`Marked ${markedCount} visible student(s) as ${targetStatus}`);
};

window.markAllMarkingAttendance = (status) => {
  const bulkSwitch = document.getElementById("bulk-attendance-switch");
  if (!bulkSwitch) return;
  const isPresent = status === "Present";

  bulkSwitch.classList.remove("present-active", "absent-active");
  bulkSwitch.classList.add(isPresent ? "present-active" : "absent-active");

  const activeClass = isPresent ? "present-active" : "absent-active";
  const inactiveClass = isPresent ? "absent-active" : "present-active";

  const rowSwitches = document.querySelectorAll(".student-row-switch");
  rowSwitches.forEach((sw) => {
    const row = sw.closest(".student-row");
    if (row && row.style.display !== "none") {
      sw.classList.remove(inactiveClass);
      sw.classList.add(activeClass);
      sw.dataset.status = status;
    }
  });
};

window.filterStudents = () => {
  const query =
    document.getElementById("search-student")?.value.toLowerCase() || "";
  const batchFilter =
    document.getElementById("filter-student-batch")?.value || "All";
  document.querySelectorAll(".student-row").forEach((row) => {
    const matchesQuery =
      row.dataset.name.includes(query) || row.dataset.roll.includes(query);
    const matchesBatch =
      batchFilter === "All" || row.dataset.batch === batchFilter;
    row.style.display = matchesQuery && matchesBatch ? "table-row" : "none";
  });
};

window.submitAttendance = async () => {
  const year = document.getElementById("sel-year").value;
  const branch = document.getElementById("sel-branch").value;
  const section = document.getElementById("sel-section").value;
  const class_id = currentState.classes.find(
    (c) => c.year === year && c.branch === branch && c.section === section,
  )?.id;

  const selectedCheckboxes = document.querySelectorAll(
    'input[name="sel-teacher-checkbox"]:checked',
  );
  const teacherIds = Array.from(selectedCheckboxes).map((cb) => cb.value);
  if (teacherIds.length === 0) {
    showToast("Please select at least one conducting teacher", "error");
    return;
  }

  const classType = document.getElementById("sel-class-type").value;
  const isLab = classType === "Lab";

  if (isLab) {
    const hasB1 = document.getElementById("sel-batch-b1").checked;
    const hasB2 = document.getElementById("sel-batch-b2").checked;
    if (!hasB1 && !hasB2) {
      showToast("Please select at least one batch", "error");
      return;
    }
    if (hasB1 && !document.getElementById("sel-subject-b1").value) {
      showToast("Please select subject for Batch B1", "error");
      return;
    }
    if (hasB2 && !document.getElementById("sel-subject-b2").value) {
      showToast("Please select subject for Batch B2", "error");
      return;
    }
  } else {
    if (!document.getElementById("sel-subject").value) {
      showToast("Please select a subject", "error");
      return;
    }
  }

  const lectureSubjectId = !isLab
    ? document.getElementById("sel-subject").value
    : null;
  const b1SubjectId = isLab
    ? document.getElementById("sel-subject-b1").value
    : null;
  const b2SubjectId = isLab
    ? document.getElementById("sel-subject-b2").value
    : null;

  const rows = document.querySelectorAll(".student-row");
  const records = [];
  let presentCount = 0;

  rows.forEach((row) => {
    const studentId = row.dataset.id;
    const recordId = row.dataset.recordId;
    const student = currentState.students.find((s) => s.id === studentId);
    if (!student) return;

    const statusContainer = row.querySelector("div[data-status]");
    const status = statusContainer ? statusContainer.dataset.status : null;
    if (status) {
      let recordSubjectId = null;
      let recordBatch = null;

      if (isLab) {
        recordBatch = student.batch || "B1";
        if (recordBatch === "B1") {
          recordSubjectId = b1SubjectId;
        } else if (recordBatch === "B2") {
          recordSubjectId = b2SubjectId;
        }
      } else {
        recordSubjectId = lectureSubjectId;
        recordBatch = null;
      }

      if (!recordSubjectId) return;

      const lectureNoVal = parseInt(document.getElementById("sel-lecture-no")?.value || "1", 10);
      const lectureNoValEndEl = document.getElementById("sel-lecture-no-end");
      const lectureNoValEnd = (isLab && lectureNoValEndEl && lectureNoValEndEl.style.display !== "none") ? parseInt(lectureNoValEndEl.value, 10) : NaN;

      const rec = {
        student_id: studentId,
        teacher_id: teacherIds[0],
        teacher_ids: teacherIds,
        class_id: class_id,
        subject_id: recordSubjectId,
        date: document.getElementById("sel-date").value,
        status: status,
        batch: recordBatch,
        lecture_no: lectureNoVal,
      };
      if (recordId) {
        rec.id = recordId;
      }
      records.push(rec);

      if (!isNaN(lectureNoValEnd)) {
        const rec2 = { ...rec, lecture_no: lectureNoValEnd };
        delete rec2.id;
        records.push(rec2);
      }
      if (status === "Present") presentCount++;
    }
  });

  if (records.length === 0) {
    showToast("Please mark attendance for at least one student", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("attendance_records")
    .upsert(records, { onConflict: "student_id,class_id,subject_id,date,lecture_no" });
  if (error) {
    showToast(error.message, "error");
  } else {
    const percentage = ((presentCount / records.length) * 100).toFixed(1);
    document.getElementById("student-list-container").innerHTML = `
            <div class="card" style="background: rgba(45, 212, 191, 0.05); border-color: var(--accent); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 2.5rem 2rem; gap: 1rem; margin-top: 2rem;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(45, 212, 191, 0.1); display: flex; align-items: center; justify-content: center; border: 1px solid var(--accent);">
                    <i data-lucide="check-circle" style="width: 32px; height: 32px; color: var(--accent);"></i>
                </div>
                <h2 style="color: var(--accent); margin: 0; font-weight: 800; font-size: 1.5rem;">Attendance Submitted!</h2>
                <p style="color: var(--text-muted); font-size: 0.95rem; margin: 0;">Present: <strong>${presentCount}</strong> | Total: <strong>${records.length}</strong></p>
                <div style="font-size: 3rem; font-weight: 800; color: var(--text-main); margin: 0.5rem 0; background: linear-gradient(135deg, var(--text-main) 0%, var(--accent) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    ${percentage}%
                </div>
                <button class="btn-primary" style="margin-top: 1rem; padding: 0.75rem 2rem; width: auto; display: flex; align-items: center; gap: 0.5rem;" onclick="window.loadStudentList()">
                    <i data-lucide="edit" style="width:16px; height:16px;"></i> Edit Attendance
                </button>
            </div>
        `;
    lucide.createIcons();
    showToast("Attendance recorded successfully!");
  }
};

async function renderStudentHistory(container) {
  const teacher = currentState.teacherData;
  const activeBranches =
    teacher && teacher.department === "IT"
      ? ["IT", "DS"]
      : ["CS", "IT", "CSIT", "DS", "AIML"];

  if (!currentState.historyFilters) {
    currentState.historyFilters = {
      date: "",
      year: "All",
      branch: "All",
      section: "All",
    };
  }

  if (!currentState.studentHistoryRecords) {
    const { data: history } = await supabaseClient
      .from("attendance_records")
      .select("*, students(*), subjects(*), classes(*)")
      .or(
        `teacher_id.eq.${currentState.teacherData.id},teacher_ids.cs.{"${currentState.teacherData.id}"}`,
      )
      .order("date", { ascending: false });
    currentState.studentHistoryRecords = history || [];
  }
  const filteredHistory = currentState.studentHistoryRecords.filter((h) => {
    const f = currentState.historyFilters;
    const matchDate = !f.date || h.date === f.date;
    const matchYear = f.year === "All" || h.students?.year === f.year;
    const matchBranch = f.branch === "All" || h.students?.branch === f.branch;
    const matchSection =
      f.section === "All" || h.students?.section === f.section;
    return matchDate && matchYear && matchBranch && matchSection;
  });
  const sessions = [];
  const sessionMap = new Map();

  filteredHistory.forEach((record) => {
    const key = `${record.date}-${record.class_id}-${record.subject_id}-${record.batch || "All"}-${record.lecture_no || 1}`;
    if (!sessionMap.has(key)) {
      const session = {
        id: key,
        date: record.date,
        batch: record.batch || null,
        lecture_no: record.lecture_no || 1,
        teacher_ids: record.teacher_ids || [record.teacher_id],
        class: record.classes || {
          branch: record.students?.branch,
          year: record.students?.year,
          section: record.students?.section,
        },
        subject: record.subjects,
        records: [],
        presentCount: 0,
      };
      sessionMap.set(key, session);
      sessions.push(session);
    }
    const session = sessionMap.get(key);
    session.records.push(record);
    if (record.status === "Present") session.presentCount++;
  });

  container.innerHTML = `
        <h1 style="margin-bottom: 2rem;">Student Attendance History</h1>
        <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end; margin-bottom: 2rem;">
            <div class="form-group">
                <label>Date</label>
                <input type="date" value="${currentState.historyFilters.date}" onchange="updateHistoryFilter('date', this.value)">
            </div>
            <div class="form-group">
                <label>Year</label>
                <select onchange="updateHistoryFilter('year', this.value)">
                    <option value="All">All</option>
                    <option value="1st" ${currentState.historyFilters.year === "1st" ? "selected" : ""}>1st</option>
                    <option value="2nd" ${currentState.historyFilters.year === "2nd" ? "selected" : ""}>2nd</option>
                    <option value="3rd" ${currentState.historyFilters.year === "3rd" ? "selected" : ""}>3rd</option>
                    <option value="4th" ${currentState.historyFilters.year === "4th" ? "selected" : ""}>4th</option>
                </select>
            </div>
            <div class="form-group">
                <label>Branch</label>
                <select onchange="updateHistoryFilter('branch', this.value)">
                    <option value="All">All</option>
                    ${activeBranches.map((b) => `<option value="${b}" ${currentState.historyFilters.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select onchange="updateHistoryFilter('section', this.value)">
                    <option value="All">All</option>
                    ${window.getBranchSectionsList(currentState.historyFilters.branch === "All" ? "" : currentState.historyFilters.branch).map((s) => `<option value="${s}" ${currentState.historyFilters.section === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <button class="btn-secondary" style="width: 100%;" onclick="resetHistoryFilters()">Clear Filters</button>
            </div>
        </div>

        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Class</th>
                            <th>Subject</th>
                            <th>Attendance Rate</th>
                            <th style="text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions
                          .map(
                            (s) => `
                            <tr>
                                <td>${s.date}</td>
                                <td><span class="badge" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">${s.class?.branch} ${s.class?.year}-${s.class?.section}${s.batch ? ` (${s.batch})` : ""} · Lec ${s.lecture_no}</span></td>
                                <td style="font-weight: 500;">${s.subject?.name || "Unknown"}</td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <div style="flex: 1; min-width: 120px; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
                                            <div style="width: ${(s.presentCount / s.records.length) * 100}%; height: 100%; background: var(--accent); box-shadow: 0 0 10px var(--accent);"></div>
                                        </div>
                                        <span style="font-weight: 600; min-width: 60px;">${s.presentCount}/${s.records.length}</span>
                                    </div>
                                </td>
                                <td style="text-align: right;">
                                    <button class="btn-secondary" style="padding: 0.5rem 1rem;" onclick="viewSessionDetails('${s.id}')">
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                        ${
                          sessions.length === 0
                            ? `
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 5rem 2rem; color: var(--text-muted);">
                                    No attendance records found for the selected parameters.
                                </td>
                            </tr>
                        `
                            : ""
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

  currentState.historySessions = sessions;
  lucide.createIcons();
  setTimeout(window.init3DTilt, 100);
}

window.updateHistoryFilter = (key, value) => {
  currentState.historyFilters[key] = value;
  renderActiveView();
};

window.resetHistoryFilters = () => {
  currentState.historyFilters = {
    date: "",
    year: "All",
    branch: "All",
    section: "All",
  };
  renderActiveView();
};

window.viewSessionDetails = (sessionId) => {
  const session = currentState.historySessions.find((s) => s.id === sessionId);
  if (!session) return;

  const sessionTeachers =
    session.teacher_ids && session.teacher_ids.length > 0
      ? session.teacher_ids
          .map((tid) => {
            const t = currentState.teachers.find((tch) => tch.id === tid);
            return t ? t.name : "";
          })
          .filter(Boolean)
          .join(", ")
      : "Unknown";

  showModal(
    `Attendance Details`,
    `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; background: rgba(99, 102, 241, 0.05); padding: 1.5rem; border-radius: 1rem; border: 1px solid var(--primary);">
            <div>
                <label style="color: var(--primary); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Subject</label>
                <div style="font-size: 1.25rem; font-weight: 600;">${session.subject?.name}</div>
            </div>
            <div>
                <label style="color: var(--primary); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Class / Batch / Lecture</label>
                <div style="font-size: 1.25rem; font-weight: 600;">${session.class?.branch} ${session.class?.year}-${session.class?.section} ${session.batch ? `(${session.batch})` : ""} · Lecture ${session.lecture_no}</div>
            </div>
            <div>
                <label style="color: var(--primary); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Date</label>
                <div style="font-size: 1rem;">${session.date}</div>
            </div>
            <div>
                <label style="color: var(--primary); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Conducting Teachers</label>
                <div style="font-size: 1rem;">${sessionTeachers}</div>
            </div>
            <div style="grid-column: span 2;">
                <label style="color: var(--primary); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Stats</label>
                <div style="font-size: 1rem;" id="session-stats-${session.id}">Present: ${session.presentCount} | Total: ${session.records.length}</div>
            </div>
        </div>
        <div class="table-container" style="max-height: 400px; border: 1px solid var(--border); border-radius: 0.5rem;">
            <table>
                <thead style="position: sticky; top: 0; background: var(--bg-dark); z-index: 10;">
                    <tr>
                        <th>Roll No</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th style="text-align: right;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${session.records
                      .map(
                        (r) => `
                        <tr>
                            <td>${r.students?.roll_no}</td>
                            <td>${r.students?.name}</td>
                            <td>
                                <span class="badge" id="session-badge-${r.id}" style="background: ${r.status === "Present" ? "rgba(45, 212, 191, 0.1)" : "rgba(239, 68, 68, 0.1)"}; color: ${r.status === "Present" ? "var(--accent)" : "var(--error)"}; padding: 0.25rem 0.5rem; border-radius: 0.5rem; font-size: 0.75rem;">
                                    ${r.status}
                                </span>
                            </td>
                            <td style="text-align: right;">
                                <button class="btn-secondary" id="session-btn-${r.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="editAttendance('${r.id}', '${r.status}', '${session.id}')">
                                    Toggle Status
                                </button>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `,
    () => {
      closeModal();
    },
    { isWide: true, hideConfirm: true, cancelText: "Cancel" },
  );
};

window.editAttendance = async (id, currentStatus, sessionId) => {
  let session = null;
  let record = null;

  if (currentState.historySessions) {
    if (sessionId) {
      session = currentState.historySessions.find((s) => s.id === sessionId);
      if (session) {
        record = session.records.find((r) => r.id === id);
      }
    } else {
      for (const s of currentState.historySessions) {
        const r = s.records.find((rec) => rec.id === id);
        if (r) {
          session = s;
          record = r;
          break;
        }
      }
    }
  }

  if (!session || !record) {
    showToast(
      "Unauthorized: You can only edit attendance for your own lectures.",
      "error",
    );
    return;
  }
  const conductingTeacherId = currentState.teacherData?.id;
  const isTeacherOfSession =
    session.teacher_ids?.includes(conductingTeacherId) ||
    record.teacher_id === conductingTeacherId ||
    record.teacher_ids?.includes(conductingTeacherId);

  if (!isTeacherOfSession) {
    showToast(
      "Unauthorized: You can only edit attendance for your own lectures.",
      "error",
    );
    return;
  }

  const newStatus = currentStatus === "Present" ? "Absent" : "Present";
  if (confirm(`Change status to ${newStatus}?`)) {
    const btn = document.getElementById(`session-btn-${id}`);
    if (btn) {
      btn.textContent = "...";
      btn.disabled = true;
    }

    const { error } = await supabaseClient
      .from("attendance_records")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      showToast(error.message, "error");
      if (btn) {
        btn.textContent = "Toggle Status";
        btn.disabled = false;
      }
    } else {
      showToast("Attendance updated");
      record.status = newStatus;

      if (currentState.studentHistoryRecords) {
        const dbRecord = currentState.studentHistoryRecords.find(
          (r) => r.id === id,
        );
        if (dbRecord) dbRecord.status = newStatus;
      }

      if (newStatus === "Present") {
        session.presentCount = (session.presentCount || 0) + 1;
      } else {
        session.presentCount = Math.max(0, (session.presentCount || 0) - 1);
      }
      const badge = document.getElementById(`session-badge-${id}`);
      if (badge) {
        badge.textContent = newStatus;
        badge.style.background =
          newStatus === "Present"
            ? "rgba(45, 212, 191, 0.1)"
            : "rgba(239, 68, 68, 0.1)";
        badge.style.color =
          newStatus === "Present" ? "var(--accent)" : "var(--error)";
      }

      if (btn) {
        btn.textContent = "Toggle Status";
        btn.setAttribute(
          "onclick",
          `editAttendance('${id}', '${newStatus}', '${session.id}')`,
        );
        btn.disabled = false;
      }

      const statsEl = document.getElementById(`session-stats-${session.id}`);
      if (statsEl) {
        statsEl.textContent = `Present: ${session.presentCount} | Total: ${session.records.length}`;
      }
      const container = document.getElementById("main-content");
      if (container) {
        renderStudentHistory(container);
      }
    }
  }
};

function renderAdminScopeSelector() {
  const app = document.getElementById("app");

  app.innerHTML = `
        <div class="auth-container" style="flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; background: var(--bg-dark);">
            <div class="auth-card" style="width: 100%; max-width: 650px; background: var(--card-bg); border-radius: 1rem; border: 1px solid var(--border); box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37); padding: 3rem;">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <img src="./acropolis_logo.png" style="max-height: 60px; object-fit: contain; margin-bottom: 1rem;">
                    <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin: 0;">SELECT PORTAL MODE</h2>
                    <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.5rem;">Select your dashboard personality and department scope to enter.</p>
                </div>

                <form id="scope-selection-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="form-group">
                        <label style="font-weight: 700; color: var(--text-main);">Choose Department Scope</label>
                        <select id="scope-dept" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); cursor:pointer; font-weight: 600;">
                            <option value="" disabled selected>Select Department</option>
                            ${currentState.departments.map((d) => `<option value="${d.name}">${d.name}</option>`).join("")}
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                        <div id="mode-admin-card" onclick="window.selectPortalMode('admin')"
                             style="border: 2px solid var(--primary); background: rgba(59, 130, 246, 0.04); border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; gap: 0.75rem; align-items: center; text-align: center;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="shield" style="width: 24px; height: 24px;"></i>
                            </div>
                            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Administrator Mode</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">Access full controls, manage student databases, create teachers, and edit timetable streams.</span>
                        </div>
                        <div id="mode-hod-card" onclick="window.selectPortalMode('hod')"
                             style="border: 2px solid var(--border); background: transparent; border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; gap: 0.75rem; align-items: center; text-align: center;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-card); color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="users" style="width: 24px; height: 24px;"></i>
                            </div>
                            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">HOD Mode</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">View section attendance rates, student achievements list, exam metrics, and timetable charts.</span>
                        </div>
                    </div>

                    <input type="hidden" id="selected-mode" value="admin">
                    <button type="submit" class="btn-primary" style="width: 100%; height: 46px; margin-top: 0.5rem; font-weight: 700; font-size: 1rem; border-radius: 0.5rem;">Enter Dashboard</button>
                </form>
            </div>
        </div>
    `;
  lucide.createIcons();

  window.selectPortalMode = (mode) => {
    document.getElementById("selected-mode").value = mode;
    const adminCard = document.getElementById("mode-admin-card");
    const hodCard = document.getElementById("mode-hod-card");
    if (mode === "admin") {
      adminCard.style.borderColor = "var(--primary)";
      adminCard.style.background = "rgba(59, 130, 246, 0.04)";
      hodCard.style.borderColor = "var(--border)";
      hodCard.style.background = "transparent";
    } else {
      hodCard.style.borderColor = "var(--primary)";
      hodCard.style.background = "rgba(59, 130, 246, 0.04)";
      adminCard.style.borderColor = "var(--border)";
      adminCard.style.background = "transparent";
    }
  };

  document
    .getElementById("scope-selection-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const dept = document.getElementById("scope-dept").value.trim();
      const mode = document.getElementById("selected-mode").value;
      if (dept) {
        currentState.selectedDept = dept;
        currentState.deptBranches = window.getDeptBranches(dept);
        localStorage.setItem("admin_selected_dept", dept);

        if (mode === "hod") {
          currentState.role = "hod";
          currentState.hodDept = dept;
          currentState.view = "hodDashboard";
        } else {
          currentState.role = "admin";
          currentState.view = "dashboard";
        }

        showToast(
          `Scoped to: ${dept} (${mode === "hod" ? "HOD" : "Admin"} Mode)`,
        );
        renderMainLayout();
      }
    });
}

function renderHodModeSelector() {
  const app = document.getElementById("app");
  const teacher = currentState.teacherData;
  const dept = teacher.hod_dept || teacher.department || "IT";

  app.innerHTML = `
        <div class="auth-container" style="flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; background: var(--bg-dark);">
            <div class="auth-card" style="width: 100%; max-width: 650px; background: var(--card-bg); border-radius: 1rem; border: 1px solid var(--border); box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37); padding: 3rem;">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <img src="./acropolis_logo.png" style="max-height: 60px; object-fit: contain; margin-bottom: 1rem;">
                    <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin: 0;">WELCOME, HOD</h2>
                    <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.5rem;">Select your workspace mode for the <strong>${dept}</strong> department.</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                        <div id="mode-hod-card" onclick="window.selectHodMode('hodDashboard')"
                             style="border: 2px solid var(--primary); background: rgba(59, 130, 246, 0.04); border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; gap: 0.75rem; align-items: center; text-align: center;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="shield" style="width: 24px; height: 24px;"></i>
                            </div>
                            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">HOD Dashboard</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">View department analytics, achievements, attendance insights, and metrics.</span>
                        </div>
                        <div id="mode-teacher-card" onclick="window.selectHodMode('markAttendance')"
                             style="border: 2px solid var(--border); background: transparent; border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; gap: 0.75rem; align-items: center; text-align: center;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-card); color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="user" style="width: 24px; height: 24px;"></i>
                            </div>
                            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Teacher Portal</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">Mark attendance, manage your subjects, and view your schedule.</span>
                        </div>
                    </div>

                    <input type="hidden" id="selected-hod-mode" value="hodDashboard">
                    <button class="btn-primary" onclick="window.enterHodPortal()" style="width:100%; margin-top: 1rem; padding:1rem; border-radius:0.5rem; font-weight:700;">Enter Workspace</button>
                </div>
            </div>
        </div>
    `;
  lucide.createIcons();
}

window.selectHodMode = (view) => {
  document.getElementById("selected-hod-mode").value = view;
  const hodCard = document.getElementById("mode-hod-card");
  const teacherCard = document.getElementById("mode-teacher-card");
  if (view === "hodDashboard") {
    hodCard.style.borderColor = "var(--primary)";
    hodCard.style.background = "rgba(59, 130, 246, 0.04)";
    teacherCard.style.borderColor = "var(--border)";
    teacherCard.style.background = "transparent";
  } else {
    teacherCard.style.borderColor = "var(--primary)";
    teacherCard.style.background = "rgba(59, 130, 246, 0.04)";
    hodCard.style.borderColor = "var(--border)";
    hodCard.style.background = "transparent";
  }
};

window.enterHodPortal = () => {
  const view = document.getElementById("selected-hod-mode").value;
  currentState.hodModeSelected = true;
  const teacher = currentState.teacherData;
  const dept = teacher.hod_dept || teacher.department || "IT";

  currentState.selectedDept = dept; // Set selected dept for data queries
  currentState.hodDept = dept;
  currentState.view = view;
  if (view === "markAttendance") {
    currentState.role = "teacher";
  } else {
    currentState.role = "hod";
  }

  showToast(`Entered as ${view === "hodDashboard" ? "HOD" : "Teacher"}`);
  renderMainLayout();
};

window.switchAdminScope = () => {
  if (currentState.teacherData && currentState.teacherData.is_hod) {
    currentState.hodModeSelected = false;
    currentState.role = "hod";
    renderMainLayout();
    return;
  }

  currentState.selectedDept = "";
  currentState.role = "admin";
  currentState.timetableFilters = null;
  currentState.subjectsFilters = null;
  currentState.studentsFilters = null;
  currentState.classesFilters = null;
  localStorage.removeItem("admin_selected_dept");
  renderMainLayout();
};

window.changeScopedDept = (deptName) => {
  currentState.selectedDept = deptName;
  currentState.deptBranches = window.getDeptBranches(deptName);
  localStorage.setItem("admin_selected_dept", deptName);

  // Reset active page filters to avoid state collision
  currentState.timetableFilters = null;
  currentState.subjectsFilters = null;
  currentState.studentsFilters = null;
  currentState.classesFilters = null;

  showToast(`Switched active scope to: ${deptName}`, "info");
  renderMainLayout();
};

function startLiveClock() {
  if (window.liveClockInterval) {
    clearInterval(window.liveClockInterval);
  }
  window.liveClockInterval = setInterval(() => {
    const clockEl = document.getElementById("cyber-live-clock");
    if (!clockEl) return;
    const now = new Date();
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const pad = (n) => (n < 10 ? "0" + n : n);
    const year = now.getFullYear();
    const day = now.getDate();
    const dateStr = `${dayName} ${monthName} ${pad(day)}, ${year}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    clockEl.textContent = `${dateStr} ${timeStr}`;
  }, 1000);
}

async function renderDashboard(c) {
  const formatDbTime = (dbTime) => {
    if (!dbTime) return "";
    const parts = dbTime.split(":");
    const hr = parseInt(parts[0], 10);
    const min = parts[1];
    return `${hr}.${min}`;
  };

  const filteredTeachers = currentState.teachers;
  const filteredStudents = currentState.students;
  const filteredClasses = currentState.classes;
  const activeClassIds = filteredClasses.map((cl) => cl.id);
  const filteredSubmissions = currentState.submissions.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  const deptStudentIds = filteredStudents.map((s) => s.id);
  let overallPct = "82.4";
  let totalLogsTracked = 0;
  let todayRecords = [];
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const promises = [
      supabaseClient
        .from("attendance_records")
        .select("status, class_id")
        .eq("date", todayStr),
      supabaseClient
        .from("attendance_records")
        .select("id", { count: "exact", head: true }),
    ];
    if (deptStudentIds.length > 0) {
      promises.push(
        supabaseClient
          .from("attendance_records")
          .select("status")
          .in("student_id", deptStudentIds),
      );
    }

    const results = await Promise.all(promises);

    todayRecords = results[0].data || [];
    totalLogsTracked = results[1].count || 0;

    if (deptStudentIds.length > 0 && results[2]) {
      const deptRecords = results[2].data || [];
      const totalConducted = deptRecords.length;
      const totalPresent = deptRecords.filter(
        (r) => r.status === "Present",
      ).length;
      overallPct =
        totalConducted > 0
          ? ((totalPresent / totalConducted) * 100).toFixed(1)
          : "82.4";
    }
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
  }

  const totalToday = todayRecords.length;
  const presentToday = todayRecords.filter(
    (r) => r.status === "Present",
  ).length;
  const todayPct =
    totalToday > 0 ? ((presentToday / totalToday) * 100).toFixed(1) : "92.4";
  const branchStats = {};
  const allBranchesForStats = ["CS", "IT", "CSIT", "AIML", "ECE", "ME"];
  allBranchesForStats.forEach((b) => {
    branchStats[b] = { present: 0, total: 0 };
  });

  if (todayRecords && todayRecords.length > 0) {
    todayRecords.forEach((r) => {
      const cls = currentState.classes.find((c) => c.id === r.class_id);
      if (cls && cls.branch) {
        const b = cls.branch;
        if (!branchStats[b]) {
          branchStats[b] = { present: 0, total: 0 };
        }
        branchStats[b].total++;
        if (r.status === "Present") {
          branchStats[b].present++;
        }
      }
    });
  }

  const hasData = todayRecords && todayRecords.length > 0;
  const branchInfoList = [
    {
      code: "CS",
      badge: "CSE",
      name: "Computer Science & Engineering",
      bg: "rgba(59, 130, 246, 0.08)",
      color: "#1d4ed8",
    },
    {
      code: "IT",
      badge: "IT",
      name: "Information Technology",
      bg: "rgba(16, 185, 129, 0.08)",
      color: "#047857",
    },
    {
      code: "CSIT",
      badge: "CSIT",
      name: "Computer Science & IT",
      bg: "rgba(249, 115, 22, 0.08)",
      color: "#c2410c",
    },
    {
      code: "AIML",
      badge: "AIML",
      name: "AI & Machine Learning",
      bg: "rgba(139, 92, 246, 0.08)",
      color: "#6d28d9",
    },
    {
      code: "ECE",
      badge: "ECE",
      name: "Electronics & Communication",
      bg: "rgba(236, 72, 153, 0.08)",
      color: "#be185d",
    },
    {
      code: "ME",
      badge: "ME",
      name: "Mechanical Engineering",
      bg: "rgba(100, 116, 139, 0.08)",
      color: "#475569",
    },
  ];

  let totalStudentsSum = 0;
  let totalFacultySum = 0;
  let weightedAttendanceSum = 0;
  let totalAttendanceWeight = 0;

  const branchRowsHtml = branchInfoList
    .map((b) => {
      const studentsCount = currentState.students.filter(
        (s) => s.branch === b.code,
      ).length;
      totalStudentsSum += studentsCount;

      const facultyCount = currentState.teachers.filter(
        (t) => t.department === b.code,
      ).length;
      totalFacultySum += facultyCount;

      let attendanceRate = 0;
      const stats = branchStats[b.code];
      if (stats && stats.total > 0) {
        attendanceRate = (stats.present / stats.total) * 100;
      } else {
        attendanceRate = 0;
      }

      weightedAttendanceSum += attendanceRate * studentsCount;
      totalAttendanceWeight += studentsCount;

      return `
            <tr style="border-bottom: 1px solid #e2e8f0; vertical-align: middle; height: 60px;">
                <td style="padding: 0.85rem 1rem; display: flex; align-items: center; gap: 0.85rem;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: ${b.bg}; color: ${b.color}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.72rem; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.03);">
                        ${b.badge}
                    </div>
                    <span style="font-weight: 600; color: #1e293b; font-size: 0.88rem;">${b.name}</span>
                </td>
                <td style="padding: 0.85rem 1rem; text-align: center; font-weight: 500; color: #475569; font-size: 0.88rem;">${studentsCount.toLocaleString() || "0"}</td>
                <td style="padding: 0.85rem 1rem; text-align: center; font-weight: 500; color: #475569; font-size: 0.88rem;">${facultyCount || "0"}</td>
                <td style="padding: 0.85rem 1rem; text-align: center; font-weight: 700; color: #10b981; font-size: 0.88rem;">${attendanceRate.toFixed(1)}%</td>
            </tr>
        `;
    })
    .join("");

  const overallAvgAtt =
    totalAttendanceWeight > 0
      ? (weightedAttendanceSum / totalAttendanceWeight).toFixed(1)
      : "92.4";

  const totalRowHtml = `
        <tr style="vertical-align: middle; height: 52px; background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
            <td style="padding: 0.85rem 1rem; color: #1e293b; font-size: 0.88rem; border-radius: 0 0 0 8px;">Total</td>
            <td style="padding: 0.85rem 1rem; text-align: center; color: #1e293b; font-size: 0.88rem;">${totalStudentsSum.toLocaleString()}</td>
            <td style="padding: 0.85rem 1rem; text-align: center; color: #1e293b; font-size: 0.88rem;">${totalFacultySum}</td>
            <td style="padding: 0.85rem 1rem; text-align: center; color: #10b981; font-size: 0.88rem; border-radius: 0 0 8px 0;">${overallAvgAtt}%</td>
        </tr>
    `;
  const todayStr = new Date().toISOString().split("T")[0];
  const todaySubmissions = filteredSubmissions.filter(
    (sub) => sub.date === todayStr,
  ).length;
  const activeCoordinators = filteredTeachers.filter(
    (t) => t.is_coordinator && t.status === "active",
  ).length;
  const feedItems = filteredSubmissions.slice(0, 4);
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const todayDay = daysOfWeek[new Date().getDay()];
  const todaySlots = currentState.timetable
    .filter(
      (t) =>
        t.day_of_week === todayDay &&
        filteredClasses.map((cl) => cl.id).includes(t.class_id),
    )
    .map((t) => {
      const isMarked = filteredSubmissions.some(
        (sub) =>
          sub.date === todayStr &&
          sub.class_id === t.class_id &&
          sub.subject_id === t.subject_id,
      );
      const teacherName =
        currentState.teachers.find((tch) => tch.id === t.teacher_id)?.name ||
        "Teacher";
      const subjectCode =
        currentState.subjects.find((sub) => sub.id === t.subject_id)?.code ||
        "SUB";
      const classInfo = currentState.classes.find((cl) => cl.id === t.class_id);
      const className = classInfo
        ? `${classInfo.branch} ${classInfo.year}-${classInfo.section}`
        : "";
      return {
        ...t,
        isMarked,
        teacherName,
        subjectCode,
        className,
        slot: `${formatDbTime(t.start_time)}-${formatDbTime(t.end_time)}`,
      };
    })
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
    .slice(0, 4);

  c.innerHTML = `
        <div class="academic-header-bar" style="border: none; background: transparent; padding: 1.5rem 0 0.5rem 0; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: none;">
            <div class="academic-header-welcome" style="display: flex; flex-direction: column; gap: 0.25rem;">
                <h2 style="font-size: 1.85rem; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    Welcome back, System Administrator 👋
                </h2>
                <p style="font-size: 0.9rem; color: #64748b; margin: 0; font-weight: 500;">
                    Here is today's overview and academic metrics for all branches.
                </p>
            </div>
            <div class="academic-header-actions" style="margin-top: 0.5rem;">
                <div id="cyber-live-clock" style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); width: auto;">
                    Loading...
                </div>
            </div>
        </div>
        <div class="dashboard-grid-row">
            <div class="academic-stat-card">
                <div class="card-top">
                    <div class="card-icon-wrapper students">
                        <i data-lucide="users" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Students</div>
                        <div class="card-value">${filteredStudents.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>12.5% <span style="font-weight: 500; color: #94a3b8;">vs last month</span></span>
                </div>
                <div class="sparkline-container">
                    <svg viewBox="0 0 100 30" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="grad-students" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#6366f1" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <path d="M0 25 Q15 15 30 22 T60 12 T80 18 T100 5 L100 30 L0 30 Z" fill="url(#grad-students)"/>
                        <path d="M0 25 Q15 15 30 22 T60 12 T80 18 T100 5" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
            <div class="academic-stat-card">
                <div class="card-top">
                    <div class="card-icon-wrapper teachers">
                        <i data-lucide="presentation" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Teachers</div>
                        <div class="card-value">${filteredTeachers.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>4.3% <span style="font-weight: 500; color: #94a3b8;">vs last month</span></span>
                </div>
                <div class="sparkline-container">
                    <svg viewBox="0 0 100 30" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="grad-teachers" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <path d="M0 28 Q20 18 40 25 T80 15 T100 8 L100 30 L0 30 Z" fill="url(#grad-teachers)"/>
                        <path d="M0 28 Q20 18 40 25 T80 15 T100 8" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
            <div class="academic-stat-card">
                <div class="card-top">
                    <div class="card-icon-wrapper classes">
                        <i data-lucide="book-open" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Classes</div>
                        <div class="card-value">${filteredClasses.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>8.2% <span style="font-weight: 500; color: #94a3b8;">vs last month</span></span>
                </div>
                <div class="sparkline-container">
                    <svg viewBox="0 0 100 30" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="grad-classes" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#f97316" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="#f97316" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <path d="M0 24 Q15 20 30 15 T60 25 T80 12 T100 20 L100 30 L0 30 Z" fill="url(#grad-classes)"/>
                        <path d="M0 24 Q15 20 30 15 T60 25 T80 12 T100 20" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
            <div class="academic-stat-card">
                <div class="card-top">
                    <div class="card-icon-wrapper attendance">
                        <i data-lucide="pie-chart" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Today's Attendance</div>
                        <div class="card-value">${todayPct}%</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>3.6% <span style="font-weight: 500; color: #94a3b8;">vs yesterday</span></span>
                </div>
                <div class="sparkline-container">
                    <svg viewBox="0 0 100 30" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="grad-attendance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <path d="M0 22 Q10 15 20 25 T40 18 T60 20 T80 10 T100 15 L100 30 L0 30 Z" fill="url(#grad-attendance)"/>
                        <path d="M0 22 Q10 15 20 25 T40 18 T60 20 T80 10 T100 15" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
        </div>
        <div class="admin-main-grid" style="margin-top: 1.5rem; display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; align-items: stretch;">
            <div class="card" style="margin-bottom: 0; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Today's Branch-wise Attendance</h3>
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">All Branches Overview</span>
                </div>
                <div style="flex: 1; min-height: 220px; position: relative; width: 100%;">
                    <canvas id="db-live-ops-chart"></canvas>
                </div>
                <div style="display: flex; gap: 2rem; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 0.25rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Overall Attendance Rate</div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">${overallPct}%</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Total Logs Tracked</div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: var(--accent);">${totalLogsTracked}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Submissions Today</div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: var(--warning);">${todaySubmissions} classes</div>
                    </div>
                </div>
            </div>
            <div class="card" style="margin-bottom: 0; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; height: 100%;">
                <h3 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 0.25rem;">Quick Actions</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; flex: 1;">
                    <div onclick="window.switchView('students'); setTimeout(() => window.showAddStudentModal(), 150);" 
                         style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.02);"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.04)'; this.style.borderColor='#3b82f6';"
                         onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'; this.style.borderColor='#f1f5f9';">
                        <div style="width: 40px; height: 40px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #3b82f6;">
                            <i data-lucide="user-plus" style="width: 20px; height: 20px;"></i>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #334155; text-align: center;">Add Student</span>
                    </div>
                    <div onclick="window.switchView('teachers'); setTimeout(() => window.showAddTeacherModal(), 150);" 
                         style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.02);"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.04)'; this.style.borderColor='#10b981';"
                         onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'; this.style.borderColor='#f1f5f9';">
                        <div style="width: 40px; height: 40px; border-radius: 12px; background: #ecfdf5; display: flex; align-items: center; justify-content: center; color: #10b981;">
                            <i data-lucide="user-check" style="width: 20px; height: 20px;"></i>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #334155; text-align: center;">Add Teacher</span>
                    </div>
                    <div onclick="window.switchView('classes'); setTimeout(() => window.showAddClassModal(), 150);" 
                         style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.02);"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.04)'; this.style.borderColor='#f97316';"
                         onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'; this.style.borderColor='#f1f5f9';">
                        <div style="width: 40px; height: 40px; border-radius: 12px; background: #fff7ed; display: flex; align-items: center; justify-content: center; color: #f97316;">
                            <i data-lucide="book-open" style="width: 20px; height: 20px;"></i>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #334155; text-align: center;">Create Class</span>
                    </div>
                    <div onclick="window.switchView('timetable');" 
                         style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.02);"
                         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.04)'; this.style.borderColor='#8b5cf6';"
                         onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'; this.style.borderColor='#f1f5f9';">
                        <div style="width: 40px; height: 40px; border-radius: 12px; background: #f5f3ff; display: flex; align-items: center; justify-content: center; color: #8b5cf6;">
                            <i data-lucide="calendar" style="width: 20px; height: 20px;"></i>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #334155; text-align: center;">Update Timetable</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="card" style="margin-top: 1.5rem; margin-bottom: 0; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-radius: var(--radius-lg); border: 1px solid var(--border); background: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    <i data-lucide="layout-grid" style="width: 16px; height: 16px; color: var(--primary);"></i>
                    Branch Summary
                </h3>
                <a href="#" onclick="switchView('classes'); return false;" style="font-size: 0.78rem; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 0.25rem; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='var(--accent)';" onmouseout="this.style.color='var(--primary)';">
                    View all <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
                </a>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: var(--bg-card); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                            <th style="padding: 0.75rem 1rem; border-radius: var(--radius-sm) 0 0 var(--radius-sm);">Branch</th>
                            <th style="padding: 0.75rem 1rem; text-align: center;">Students</th>
                            <th style="padding: 0.75rem 1rem; text-align: center;">Faculty</th>
                            <th style="padding: 0.75rem 1rem; text-align: center; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">Attendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${branchRowsHtml}
                        ${totalRowHtml}
                    </tbody>
                </table>
            </div>
        </div>

    `;

  lucide.createIcons();
  startLiveClock();
  setTimeout(() => {
    const opsCtx = document.getElementById("db-live-ops-chart");
    if (opsCtx) {
      const branchStats = {};
      const allBranches = ["CS", "IT", "CSIT", "AIML", "ECE", "ME"];
      allBranches.forEach((b) => {
        branchStats[b] = { present: 0, total: 0 };
      });

      if (todayRecords && todayRecords.length > 0) {
        todayRecords.forEach((r) => {
          const cls = currentState.classes.find((c) => c.id === r.class_id);
          if (cls && cls.branch) {
            const b = cls.branch;
            if (!branchStats[b]) {
              branchStats[b] = { present: 0, total: 0 };
            }
            branchStats[b].total++;
            if (r.status === "Present") {
              branchStats[b].present++;
            }
          }
        });
      }

      const deptDisplayNames = {
        CS: "CSE",
        IT: "IT",
        CSIT: "CSIT",
        AIML: "AIML",
        ECE: "ECE",
        ME: "ME",
        CE: "CE",
        DS: "DS",
      };
      const branchLabels = allBranches.map((b) => deptDisplayNames[b] || b);
      const hasData = todayRecords && todayRecords.length > 0;
      const branchData = allBranches.map((b, idx) => {
        const stats = branchStats[b];
        return stats.total > 0
          ? Math.round((stats.present / stats.total) * 100)
          : 0;
      });

      new Chart(opsCtx.getContext("2d"), {
        type: "bar",
        data: {
          labels: branchLabels,
          datasets: [
            {
              label: "Attendance Rate (%)",
              data: branchData,
              backgroundColor: "rgba(59, 130, 246, 0.65)",
              borderColor: "#3b82f6",
              borderWidth: 1.5,
              borderRadius: 6,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Attendance: ${context.raw}%`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#64748b", font: { size: 10, weight: "600" } },
            },
            y: {
              min: 0,
              max: 100,
              ticks: {
                color: "#64748b",
                font: { size: 10 },
                stepSize: 20,
                callback: (value) => value + "%",
              },
            },
          },
        },
      });
    }
    const doughnutCtx = document.getElementById("console-doughnut-chart");
    if (doughnutCtx) {
      new Chart(doughnutCtx.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: ["Classes", "Teachers", "Subjects", "Timetable"],
          datasets: [
            {
              data: [
                filteredClasses.length || 8,
                filteredTeachers.length || 10,
                currentState.subjects.length || 12,
                activeCoordinators || 4,
              ],
              backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"],
              borderColor: "#1e293b",
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "70%",
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
          },
        },
      });
    }
  }, 120);
}

function renderTeachers(container) {
  const filtered = currentState.teachers
    .filter((t) => t.department === currentState.selectedDept)
    .sort((a, b) => {
      const idA = String(a.employee_id || "");
      const idB = String(b.employee_id || "");
      return idA.localeCompare(idB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Teacher Management (${currentState.selectedDept})</h1>
            <button class="btn-primary" onclick="showAddTeacherModal()">+ Add Teacher</button>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Emp ID</th>
                            <th>Name</th>
                            <th>Dept</th>
                            <th>Email (Account)</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered
                          .map(
                            (t) => `
                            <tr>
                                <td>${t.employee_id}</td>
                                <td>${t.name}</td>
                                <td>${t.department}</td>
                                <td style="color: var(--primary);">${t.email}</td>
                                <td>${t.is_coordinator ? "Coordinator" : "Teacher"}</td>
                                <td>
                                    <span style="color: ${t.status === "active" ? "var(--accent)" : "var(--error)"}">
                                        ${t.status.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn-secondary" style="padding: 0.5rem;" onclick="editTeacher('${t.id}')">Edit</button>
                                        <button class="btn-primary" style="padding: 0.5rem; background: rgba(239, 68, 68, 0.1); color: var(--error);" onclick="deleteTeacher('${t.id}')">
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.deleteTeacher = async (id) => {
  if (
    confirm(
      "Are you sure you want to delete this teacher? This cannot be undone.",
    )
  ) {
    let error;
    try {
      const res = await supabaseClient.from("teachers").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_teacher_entry",
        { teacher_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    showToast("Teacher deleted successfully!");
    await loadAllData();
    renderActiveView();
  }
};

function renderStudents(container) {
  if (!currentState.studentsFilters) {
    const deptBranches = currentState.deptBranches || [
      currentState.selectedDept,
    ];
    currentState.studentsFilters = {
      branch: deptBranches[0] || "",
      year: "",
      section: "",
    };
  }
  const f = currentState.studentsFilters;
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  const filtered = currentState.students.filter(
    (s) =>
      deptBranches.includes(s.branch) &&
      (!f.branch || s.branch === f.branch) &&
      (!f.year || s.year === f.year) &&
      (!f.section || s.section === f.section),
  );
  container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Student Management</h1>
            <button class="btn-primary" onclick="window.showAddStudentModal()">+ Add Student</button>
        </div>
        <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap:1rem; align-items:end; margin-bottom:2rem;">
            <div class="form-group">
                <label>Branch</label>
                <select onchange="window.updateStudentsFilter('branch', this.value)">
                    <option value="">All Branches</option>
                    ${deptBranches.map((b) => `<option value="${b}" ${f.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Year</label>
                <select onchange="window.updateStudentsFilter('year', this.value)">
                    <option value="">All Years</option>
                    ${["1st", "2nd", "3rd", "4th"].map((y) => `<option value="${y}" ${f.year === y ? "selected" : ""}>${y}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select onchange="window.updateStudentsFilter('section', this.value)">
                    <option value="">All Sections</option>
                    ${["1", "2", "3", "4", "5"].map((s) => `<option value="${s}" ${f.section === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead><tr><th>Roll No</th><th>Name</th><th>Branch</th><th>Year</th><th>Section</th><th>Batch</th><th>Email</th><th>Phone</th><th>Father's Name</th><th>Father's Phone</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="11" style="text-align:center; padding:3rem; color:var(--text-muted);">No students found for the selected filters.</td></tr>` : ""}
                        ${filtered
                          .map(
                            (s) => `
                            <tr>
                                <td>${s.roll_no}</td>
                                <td>${s.name}</td>
                                <td><span style="background:rgba(99,102,241,0.1);color:var(--primary);padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${s.branch}</span></td>
                                <td>${s.year}</td>
                                <td>Sec ${s.section}</td>
                                <td><span style="background:rgba(45,212,191,0.1);color:var(--accent);padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${s.batch || "B1"}</span></td>
                                <td style="font-size:0.8rem;color:var(--text-muted);">${s.email || '<span style="opacity:0.4;">—</span>'}</td>
                                <td style="font-size:0.8rem;color:var(--text-muted);">${s.phone || '<span style="opacity:0.4;">—</span>'}</td>
                                <td style="font-size:0.8rem;">${s.father_name || '<span style="opacity:0.4;">—</span>'}</td>
                                <td style="font-size:0.8rem;color:var(--text-muted);">${s.father_phone || '<span style="opacity:0.4;">—</span>'}</td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn-secondary" style="padding: 0.5rem;" onclick="window.editStudent('${s.id}')">Edit</button>
                                        <button class="btn-primary" style="padding: 0.5rem; background: rgba(239, 68, 68, 0.1); color: var(--error);" onclick="window.deleteStudent('${s.id}')">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.updateStudentsFilter = (key, value) => {
  currentState.studentsFilters[key] = value;
  renderActiveView();
};

function renderSubjects(container) {
  if (!currentState.subjectsFilters) {
    currentState.subjectsFilters = { branch: "" };
  }
  const filters = currentState.subjectsFilters;
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  const filtered = currentState.subjects.filter(
    (s) =>
      s.department === currentState.selectedDept &&
      (!filters.branch || s.branch === filters.branch),
  );
  filtered.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Subject Management (${currentState.selectedDept})</h1>
            <button class="btn-primary" onclick="showAddSubjectModal()">+ Add Subject</button>
        </div>
        <div class="card" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:1rem; align-items:end; margin-bottom:2rem;">
            <div class="form-group">
                <label>Branch</label>
                <select onchange="updateSubjectFilter('branch', this.value)">
                    <option value="" ${!filters.branch ? "selected" : ""}>All Branches</option>
                    ${deptBranches.map((b) => `<option value="${b}" ${filters.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead><tr><th>Code</th><th>Name</th><th>Dept</th><th>Branch</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted);">No subjects found. Add subjects using the button above.</td></tr>` : ""}
                        ${filtered
                          .map(
                            (s) => `
                            <tr>
                                <td><span style="background:rgba(99,102,241,0.1);color:var(--primary);padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${s.code}</span></td>
                                <td>${s.name}</td>
                                <td>${s.department}</td>
                                <td>${s.branch || "—"}</td>
                                <td>
                                    <div style="display:flex;gap:0.5rem;">
                                        <button class="btn-secondary" style="padding:0.4rem 0.8rem;" onclick="editSubject('${s.id}')">Edit</button>
                                        <button class="btn-primary" style="padding:0.4rem 0.8rem;background:rgba(239,68,68,0.1);color:var(--error);" onclick="deleteSubject('${s.id}')">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.editSubject = (id) => {
  const subject = currentState.subjects.find((s) => s.id === id);
  if (!subject) return;
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  showModal(
    "Edit Subject",
    `
        <div style="display:grid;gap:1rem;margin-top:1rem;">
            <div class="form-group"><label>Subject Code</label>
                <input id="edit-sub-code" value="${subject.code}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
            </div>
            <div class="form-group"><label>Subject Name</label>
                <input id="edit-sub-name" value="${subject.name}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
            </div>
            <div class="form-group"><label>Branch</label>
                <select id="edit-sub-branch" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                    <option value="">—</option>
                    ${deptBranches.map((b) => `<option value="${b}" ${subject.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
        </div>
    `,
    async () => {
      const code = document.getElementById("edit-sub-code").value.trim();
      const name = document.getElementById("edit-sub-name").value.trim();
      const branch = document.getElementById("edit-sub-branch").value;
      if (!code || !name) {
        showToast("Code and name are required", "error");
        return;
      }
      const { error } = await supabaseClient
        .from("subjects")
        .update({ code, name, branch: branch || null })
        .eq("id", id);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Subject updated!");
        await loadAllData();
        renderActiveView();
      }
    },
    { confirmText: "Save Changes" },
  );
};

function renderClasses(container) {
  if (!currentState.classesFilters) {
    const deptBranches = currentState.deptBranches || [
      currentState.selectedDept,
    ];
    currentState.classesFilters = {
      branch: deptBranches[0] || "",
      year: "",
      section: "",
    };
  }
  const f = currentState.classesFilters;
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  const filtered = currentState.classes.filter(
    (c) =>
      deptBranches.includes(c.branch) &&
      (!f.branch || c.branch === f.branch) &&
      (!f.year || c.year === f.year) &&
      (!f.section || c.section === f.section),
  );
  filtered.sort((a, b) => {
    const yearOrder = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
    const yA = yearOrder[a.year] || 99;
    const yB = yearOrder[b.year] || 99;
    if (yA !== yB) return yA - yB;
    if (a.branch !== b.branch)
      return (a.branch || "").localeCompare(b.branch || "");
    return String(a.section || "").localeCompare(
      String(b.section || ""),
      undefined,
      { numeric: true },
    );
  });
  container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Class Management</h1>
            <button class="btn-primary" onclick="showAddClassModal()">+ Add Class</button>
        </div>
        <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap:1rem; align-items:end; margin-bottom:2rem;">
            <div class="form-group">
                <label>Branch</label>
                <select onchange="updateClassesFilter('branch', this.value)">
                    <option value="">All Branches</option>
                    ${deptBranches.map((b) => `<option value="${b}" ${f.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Year</label>
                <select onchange="updateClassesFilter('year', this.value)">
                    <option value="">All Years</option>
                    ${["1st", "2nd", "3rd", "4th"].map((y) => `<option value="${y}" ${f.year === y ? "selected" : ""}>${y}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select onchange="updateClassesFilter('section', this.value)">
                    <option value="">All Sections</option>
                    ${["1", "2", "3", "4", "5"].map((s) => `<option value="${s}" ${f.section === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead><tr><th>Dept</th><th>Branch</th><th>Year</th><th>Section</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted);">No classes found. Add classes using the button above.</td></tr>` : ""}
                        ${filtered
                          .map(
                            (c) => `
                            <tr>
                                <td><span style="font-size:0.75rem;color:var(--text-muted);">${c.department || currentState.selectedDept}</span></td>
                                <td><span style="background:rgba(99,102,241,0.1);color:var(--primary);padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${c.branch}</span></td>
                                <td>${c.year}</td>
                                <td>Sec ${c.section}</td>
                                <td><button class="btn-primary" style="padding:0.4rem 0.8rem;background:rgba(239,68,68,0.1);color:var(--error);" onclick="deleteClass('${c.id}')">Delete</button></td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.updateClassesFilter = (key, value) => {
  currentState.classesFilters[key] = value;
  renderActiveView();
};

function renderTimetable(container) {
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  if (!currentState.timetableFilters) {
    currentState.timetableFilters = {
      year: "",
      branch: deptBranches[0] || "",
      section: "",
    };
  }

  const filters = currentState.timetableFilters;
  const branches = deptBranches;

  const coordinator = currentState.teachers.find(
    (t) => t.department === currentState.selectedDept && t.is_coordinator,
  );
  const coordinatorName = coordinator ? coordinator.name : "Not Assigned";

  const filtered = currentState.timetable.filter((t) => {
    return (
      (!filters.year || t.classes?.year === filters.year) &&
      (!filters.branch || t.classes?.branch === filters.branch) &&
      (!filters.section || t.classes?.section === filters.section)
    );
  });

  const days = ["MON", "TUE", "WED", "THUR", "FRI", "SAT"];

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const clean = timeStr.replace(/:/g, ".");
    const parts = clean.split(".");
    let hr = parseInt(parts[0], 10);
    let min = parseInt(parts[1], 10) || 0;
    if (hr < 8) {
      hr += 12;
    }
    return hr * 60 + min;
  };

  const getTeacherInitials = (entry) => {
    const teacherIds =
      entry.teacher_ids && entry.teacher_ids.length > 0
        ? entry.teacher_ids
        : entry.teacher_id
          ? [entry.teacher_id]
          : [];

    if (teacherIds.length === 0) return "—";

    return teacherIds
      .map((tid) => {
        const t = currentState.teachers.find((tch) => tch.id === tid);
        if (!t) return "";
        const cleanName = t.name.replace(
          /^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i,
          "",
        );
        const parts = cleanName.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return parts
          .map((p) => p[0])
          .join("")
          .toUpperCase();
      })
      .filter(Boolean)
      .join("/");
  };

  const getLabRoom = (entry) => {
    if (entry.batch === "B1") return "Lab 225 (A)";
    if (entry.batch === "B2") return "Lab 225 (B)";
    return "Lab 225";
  };

  const renderSlotsForDay = (day, slotsList) => {
    let html = "";
    for (let i = 0; i < slotsList.length; i++) {
      const ts = slotsList[i];
      const entries = filtered.filter((t) => {
        if (t.day_of_week !== day) return false;
        const entryStart = timeToMinutes(t.start_time);
        const entryEnd = timeToMinutes(t.end_time);

        const [slotStartStr, slotEndStr] = ts.split("-");
        const slotStart = timeToMinutes(slotStartStr);
        const slotEnd = timeToMinutes(slotEndStr);

        return entryStart <= slotStart && entryEnd >= slotEnd;
      });

      if (entries.length > 0) {
        const representative = entries[0];
        const entryStart = timeToMinutes(representative.start_time);
        const entryEnd = timeToMinutes(representative.end_time);

        const [slotStartStr] = ts.split("-");
        const slotStart = timeToMinutes(slotStartStr);
        if (entryStart < slotStart) {
          continue;
        }

        let colspan = 1;
        for (let j = i + 1; j < slotsList.length; j++) {
          const nextTs = slotsList[j];
          const [nextStartStr, nextEndStr] = nextTs.split("-");
          const nextStart = timeToMinutes(nextStartStr);
          const nextEnd = timeToMinutes(nextEndStr);
          if (entryStart <= nextStart && entryEnd >= nextEnd) {
            colspan++;
          } else {
            break;
          }
        }
        const cellsContent = (() => {
          const content = entries
            .map((entry, idx) => {
              const initials = getTeacherInitials(entry);
              let lineContent = "";
              if (entry.is_lab) {
                const room = getLabRoom(entry);
                lineContent = `${entry.subjects?.code || ""} ${entry.subjects?.name || ""} (${entry.batch || "All"}) [${room}] ${initials}`;
              } else {
                lineContent = `${entry.subjects?.code || ""} ${entry.subjects?.name || ""} (${initials})`;
              }

              return `
                            <div style="display:flex; justify-content:center; align-items:center; gap:0.3rem; padding: 0.1rem 0; width: 100%; line-height: 1.25;">
                                <span style="font-size: 0.68rem; font-weight: 600; color: var(--text-main); font-family: 'Outfit', sans-serif; text-align: center; word-break: break-word;">${lineContent}</span>
                                ${
                                  !isLocked
                                    ? `
                                    <button onclick="deleteTimetable('${entry.id}')" style="background: none; border: none; color: var(--error); cursor: pointer; padding: 0.05rem; display: inline-flex; align-items: center; justify-content: center; opacity: 0.5; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5" title="Delete entry">
                                        <i data-lucide="trash-2" style="width:10px;height:10px;"></i>
                                    </button>
                                `
                                    : ""
                                }
                            </div>
                        `;
            })
            .join("");

          return `
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width: 100%; height: 100%; padding: 0.15rem 0;">
                            ${content}
                        </div>
                    `;
        })();

        html += `<td colspan="${colspan}" style="background: rgba(99,102,241,0.02); border: 1px solid var(--border); vertical-align: middle; text-align: center; padding: 0.25rem 0.2rem;">
                    ${cellsContent}
                </td>`;
        i += colspan - 1;
      } else {
        html += `<td>
                    ${!isLocked ? `<button onclick="showAddTimetableModal('${day}', '${ts}')" style="background: transparent; border: 1px dashed var(--border); border-radius: 0.25rem; color: var(--text-muted); padding: 0.5rem; cursor: pointer; width: 100%; transition: all 0.2s;">+</button>` : '<span style="color: var(--text-muted);">—</span>'}
                </td>`;
      }
    }
    return html;
  };

  const lockKey = `tt_locked_${filters.branch}_${filters.year}_${filters.section}`;
  const isLocked =
    filters.branch &&
    filters.year &&
    filters.section &&
    localStorage.getItem(lockKey) === "true";

  container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1>Timetable Schedule</h1>
            <div style="display:flex;gap:0.75rem;">
                ${filters.branch && filters.year && filters.section && !isLocked ? `<button class="btn-secondary" onclick="showAddTimetableModal()">+ Schedule Lecture</button>` : ""}
                ${filters.branch && filters.year && filters.section && !isLocked && filtered.length > 0 ? `<button class="btn-primary" onclick="lockTimetable()" style="background:var(--accent);color:white;border:1px solid var(--accent);font-weight:600;">✓ Submit & Lock</button>` : ""}
                ${isLocked ? `<span style="background:rgba(16,185,129,0.1);color:var(--accent);padding:0.5rem 1rem;border-radius:0.5rem;border:1px solid var(--accent);font-weight:600;font-size:0.85rem;">🔒 Timetable Locked</span><button class="btn-primary" onclick="unlockTimetable()" style="background:var(--error);color:white;border:1px solid var(--error);font-size:0.8rem;font-weight:600;">Unlock & Edit</button>` : ""}
            </div>
        </div>

        <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end; margin-bottom: 2rem;">
            <div class="form-group">
                <label>Branch</label>
                <select onchange="updateTimetableFilter('branch', this.value)">
                    <option value="" disabled>Select Branch</option>
                    ${branches.map((b) => `<option value="${b}" ${filters.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Year</label>
                <select onchange="updateTimetableFilter('year', this.value)">
                    <option value="">Select Year</option>
                    <option value="1st" ${filters.year === "1st" ? "selected" : ""}>1st</option>
                    <option value="2nd" ${filters.year === "2nd" ? "selected" : ""}>2nd</option>
                    <option value="3rd" ${filters.year === "3rd" ? "selected" : ""}>3rd</option>
                    <option value="4th" ${filters.year === "4th" ? "selected" : ""}>4th</option>
                </select>
            </div>
            <div class="form-group">
                <label>Section</label>
                <select onchange="updateTimetableFilter('section', this.value)">
                    <option value="">Select Section</option>
                    ${window.getBranchSectionsList(filters.branch).map((s) => `<option value="${s}" ${filters.section === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>
        </div>

        ${
          !filters.year || !filters.branch || !filters.section
            ? `
            <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="calendar" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.5;"></i>
                <h2>Select Class</h2>
                <p>Please select Branch, Year, and Section to view the timetable grid.</p>
            </div>
        `
            : `
            <div class="card" style="margin-bottom: 2rem; background: var(--bg-dark); border: 1px solid ${isLocked ? "var(--accent)" : "var(--border)"};">
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; align-items:center;">
                    <div style="font-weight: 700; color: var(--primary); font-size: 1.25rem;">Class: ${filters.branch} ${filters.year} &mdash; Sec ${filters.section}</div>
                    <div style="font-weight: 600; color: var(--accent); font-size: 1.1rem;">Coordinator: ${coordinatorName}</div>
                    ${isLocked ? `<span style="font-size:0.8rem;color:var(--accent);background:rgba(16,185,129,0.1);padding:0.3rem 0.75rem;border-radius:1rem;border:1px solid var(--accent);">🔒 Schedule Locked</span>` : `<span style="font-size:0.8rem;color:var(--text-muted);background:var(--glass);padding:0.3rem 0.75rem;border-radius:1rem;">✏️ Editable</span>`}
                </div>
            </div>

            <div class="card" style="padding: 0; overflow-x: auto; margin-bottom: 0;">
                <table class="timetable-table">
                    <colgroup>
                        <col style="width: 70px;">
                        <col style="width: 11%;">
                        <col style="width: 11%;">
                        <col style="width: 11%;">
                        <col style="width: 45px;">
                        <col style="width: 11%;">
                        <col style="width: 11%;">
                        <col style="width: 11%;">
                        <col style="width: 11%;">
                    </colgroup>
                    <thead>
                        <tr style="background: var(--bg-dark);">
                            <th style="border-right: 2px solid var(--border); text-align:center;">DAY</th>
                            <th>10.30-11.20<br><small style="color:var(--text-muted);font-weight:400">I</small></th>
                            <th>11.20-12.10<br><small style="color:var(--text-muted);font-weight:400">II</small></th>
                            <th>12.10-1.00<br><small style="color:var(--text-muted);font-weight:400">III</small></th>
                            <th style="background: rgba(99,102,241,0.05); color:var(--primary); font-size:0.6rem; writing-mode:vertical-rl; padding:0.3rem 0;">LUNCH</th>
                            <th>1.50-2.40<br><small style="color:var(--text-muted);font-weight:400">IV</small></th>
                            <th>2.40-3.30<br><small style="color:var(--text-muted);font-weight:400">V</small></th>
                            <th>3.30-4.15<br><small style="color:var(--text-muted);font-weight:400">VI</small></th>
                            <th>4.15-5.00<br><small style="color:var(--text-muted);font-weight:400">VII</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${days
                          .map(
                            (day) => `
                            <tr>
                                <td style="font-weight: 700; font-size: 0.75rem; border-right: 2px solid var(--border); background: var(--bg-dark); text-align:center;">${day}</td>
                                ${renderSlotsForDay(day, ["10.30-11.20", "11.20-12.10", "12.10-1.00"])}
                                <td style="background: rgba(99,102,241,0.04); border-left: 1px solid var(--border); border-right: 1px solid var(--border);"></td>
                                ${renderSlotsForDay(day, ["1.50-2.40", "2.40-3.30", "3.30-4.15", "4.15-5.00"])}
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `
        }
    `;
  lucide.createIcons();
}

window.updateTimetableFilter = (key, value) => {
  currentState.timetableFilters[key] = value;
  renderActiveView();
};

window.lockTimetable = () => {
  const f = currentState.timetableFilters;
  if (!f.branch || !f.year || !f.section) return;
  const lockKey = `tt_locked_${f.branch}_${f.year}_${f.section}`;
  localStorage.setItem(lockKey, "true");
  showToast(
    `Timetable for ${f.branch} ${f.year} - Sec ${f.section} is now locked!`,
  );
  renderActiveView();
};

window.unlockTimetable = () => {
  const f = currentState.timetableFilters;
  if (!f.branch || !f.year || !f.section) return;
  const lockKey = `tt_locked_${f.branch}_${f.year}_${f.section}`;
  localStorage.removeItem(lockKey);
  showToast("Timetable unlocked for editing.", "success");
  renderActiveView();
};

function renderMonitoring(container) {
  const today = new Date().toISOString().split("T")[0];
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  const filteredSubmissions = currentState.submissions.filter((s) =>
    deptBranches.includes(s.classes?.branch),
  );
  const totalSubmissions = filteredSubmissions.filter(
    (s) => s.date === today,
  ).length;
  const scopedCoordinators = currentState.teachers.filter(
    (t) => t.is_coordinator && t.department === currentState.selectedDept,
  ).length;

  container.innerHTML = `
        <h1>Monitoring &amp; Submissions (${currentState.selectedDept})</h1>
        <div class="stats-grid" style="margin-bottom: 2rem;">
            <div class="stat-card"><div class="stat-value">${totalSubmissions}</div><div class="stat-label">Submissions Today</div></div>
            <div class="stat-card"><div class="stat-value">${scopedCoordinators}</div><div class="stat-label">Coordinators (${currentState.selectedDept})</div></div>
        </div>
        <div class="card">
            <h3>Recent Submissions</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Date</th><th>Teacher</th><th>Class</th><th>Status</th></tr></thead>
                    <tbody>
                        ${filteredSubmissions
                          .map(
                            (s) => `
                            <tr>
                                <td>${s.date}</td>
                                <td>${s.teachers?.name}</td>
                                <td>${s.classes?.branch} ${s.classes?.year}-${s.classes?.section}</td>
                                <td><span style="color: var(--accent)">Submitted</span></td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.editTeacher = (id) => {
  const t = currentState.teachers.find((teacher) => teacher.id === id);
  if (!t) return;

  const branches = window.getDeptBranches(t.department);
  const deptClasses = currentState.classes.filter((c) =>
    branches.includes(c.branch),
  );

  const currentClass = t.coordinator_class
    ? currentState.classes.find((c) => c.id === t.coordinator_class)
    : null;
  const currentYear = currentClass ? currentClass.year : "";
  const currentBranch = currentClass ? currentClass.branch : "";
  const currentSection = currentClass ? currentClass.section : "";

  const yearOptions = ["1st", "2nd", "3rd", "4th"];
  const branchOptions = [...new Set(deptClasses.map((c) => c.branch))].sort();
  const sectionOptions = [
    ...new Set(currentState.classes.map((c) => String(c.section))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  showModal(
    "Edit Teacher Profile",
    `
        <form id="edit-teacher-form">
            <div class="form-group">
                <label>Employee ID</label>
                <input type="text" id="e-eid" value="${t.employee_id}" required>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="e-name" value="${t.name}" required>
            </div>
            <div class="form-group">
                <label>Department</label>
                <input type="text" id="e-dept" value="${t.department}" required>
            </div>
            <div class="form-group">
                <label>Email (Account ID)</label>
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Changing this will link the profile to a different login email.</p>
                <input type="email" id="e-email" value="${t.email}" required>
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="text" id="e-phone" value="${t.phone || ""}">
            </div>
            <div class="form-group">
                <label>Account Status</label>
                <select id="e-status" style="width: 100%; padding: 0.75rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main);">
                    <option value="active" ${t.status === "active" ? "selected" : ""}>Active</option>
                    <option value="inactive" ${t.status === "inactive" ? "selected" : ""}>Inactive</option>
                </select>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="checkbox" id="e-coord" style="width: auto;" ${t.is_coordinator ? "checked" : ""} onchange="document.getElementById('e-coord-class-group').style.display = this.checked ? 'flex' : 'none'">
                <label style="margin-bottom: 0;">Is Class Coordinator?</label>
            </div>
            <div id="e-coord-class-group" style="display: ${t.is_coordinator ? "flex" : "none"}; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
                <label style="font-weight: 600; font-size: 0.9rem;">Coordinated Class Details</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Year</label>
                        <select id="e-coord-year" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="">-- Year --</option>
                            ${yearOptions.map((y) => `<option value="${y}" ${currentYear === y ? "selected" : ""}>${y}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Branch</label>
                        <select id="e-coord-branch" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="">-- Branch --</option>
                            ${branchOptions.map((b) => `<option value="${b}" ${currentBranch === b ? "selected" : ""}>${b}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Section</label>
                        <select id="e-coord-section" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="">-- Sec --</option>
                            ${sectionOptions.map((s) => `<option value="${s}" ${String(currentSection) === String(s) ? "selected" : ""}>Sec ${s}</option>`).join("")}
                        </select>
                    </div>
                </div>
            </div>
        </form>
    `,
    async () => {
      const is_coordinator = document.getElementById("e-coord").checked;
      let coord_class = null;
      if (is_coordinator) {
        const yr = document.getElementById("e-coord-year").value;
        const br = document.getElementById("e-coord-branch").value;
        const sec = document.getElementById("e-coord-section").value;
        if (!yr || !br || !sec) {
          showToast(
            "Please select Year, Branch, and Section for the coordinated class",
            "error",
          );
          return;
        }
        const matched = currentState.classes.find(
          (c) =>
            c.year === yr &&
            c.branch === br &&
            String(c.section) === String(sec),
        );
        if (!matched) {
          showToast(
            `No class section found matching ${yr} Year - ${br} - Sec ${sec}`,
            "error",
          );
          return;
        }
        const existing = currentState.teachers.find(
          (teacher) =>
            teacher.coordinator_class === matched.id && teacher.id !== id,
        );
        if (existing) {
          showToast(
            `This class already has a coordinator (${existing.name})`,
            "error",
          );
          return;
        }
        coord_class = matched.id;
      }
      const formData = {
        employee_id: document.getElementById("e-eid").value,
        name: document.getElementById("e-name").value,
        department: document.getElementById("e-dept").value,
        email: document.getElementById("e-email").value,
        phone: document.getElementById("e-phone").value,
        is_coordinator: is_coordinator,
        coordinator_class: coord_class,
        status: document.getElementById("e-status").value,
      };
      const { error } = await supabaseClient
        .from("teachers")
        .update(formData)
        .eq("id", id);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Teacher profile updated!");
      }
    },
  );
};

window.toggleTeacherStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  const { error } = await supabaseClient
    .from("teachers")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) showToast(error.message, "error");
  else {
    await loadAllData();
    renderActiveView();
    showToast(
      `Teacher account ${newStatus === "active" ? "activated" : "deactivated"}`,
    );
  }
};

window.logout = async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast(error.message, "error");
  else {
    currentState.user = null;
    currentState.role = "admin";
    currentState.teacherData = null;
    renderLogin();
    showToast("Logged out successfully");
  }
};
function showModal(title, content, onConfirm, options = {}) {
  let modal = document.getElementById("modal-overlay");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-overlay";
    modal.className = "modal-overlay";
    document.body.appendChild(modal);
  }

  const isWide = options.isWide || false;
  const hideConfirm = options.hideConfirm || false;
  const confirmText = options.confirmText || "Confirm";
  const cancelText = options.cancelText || "Cancel";

  modal.innerHTML = `
        <div class="modal-card ${isWide ? "modal-wide" : ""}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="margin: 0;">${title}</h2>
                <button style="padding: 0.5rem; background: transparent; border: none; cursor: pointer; color: var(--text-main); display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseover="this.style.color='var(--error)'" onmouseout="this.style.color='var(--text-main)'" onclick="closeModal()">
                    <i data-lucide="x" style="width: 20px; height: 20px;"></i>
                </button>
            </div>
            <div id="modal-content-body">${content}</div>
            <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                <button class="btn-secondary" style="${hideConfirm ? "width: 100%;" : "flex: 1;"}" onclick="closeModal()">${cancelText}</button>
                ${hideConfirm ? "" : `<button class="btn-primary" style="flex: 2;" id="modal-confirm-btn">${confirmText}</button>`}
            </div>
        </div>
    `;

  modal.style.display = "flex";
  lucide.createIcons();

  if (!hideConfirm) {
    document
      .getElementById("modal-confirm-btn")
      .addEventListener("click", async () => {
        const btn = document.getElementById("modal-confirm-btn");
        btn.disabled = true;
        btn.textContent = "Processing...";
        await onConfirm();
        btn.disabled = false;
        btn.textContent = confirmText;
      });
  }
}

window.closeModal = () => {
  const modal = document.getElementById("modal-overlay");
  if (modal) modal.style.display = "none";
};

window.showAddTeacherModal = () => {
  const branches = window.getDeptBranches(dept);
  const deptClasses = currentState.classes.filter((c) =>
    branches.includes(c.branch),
  );

  const yearOptions = ["1st", "2nd", "3rd", "4th"];
  const branchOptions = [...new Set(deptClasses.map((c) => c.branch))].sort();
  const sectionOptions = [
    ...new Set(currentState.classes.map((c) => String(c.section))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  showModal(
    "Add New Teacher",
    `
        <form id="add-teacher-form">
            <div class="form-group"><label>Employee ID</label><input type="text" id="t-eid" required></div>
            <div class="form-group"><label>Name</label><input type="text" id="t-name" required></div>
            <div class="form-group"><label>Department (read-only)</label><input type="text" id="t-dept" value="${currentState.selectedDept || ""}" readonly required style="background:var(--bg-dark);color:var(--text-muted);cursor:not-allowed;opacity:0.8;"></div>
            <div class="form-group"><label>Email</label><input type="email" id="t-email" required></div>
            <div class="form-group"><label>Phone</label><input type="text" id="t-phone"></div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
                <input type="checkbox" id="t-coord" style="width: auto;" onchange="document.getElementById('t-coord-class-group').style.display = this.checked ? 'flex' : 'none'">
                <label style="margin: 0;">Class Coordinator</label>
            </div>
            <div id="t-coord-class-group" style="display: none; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
                <label style="font-weight: 600; font-size: 0.9rem;">Coordinated Class Details</label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Year</label>
                        <select id="t-coord-year" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="" selected>-- Year --</option>
                            ${yearOptions.map((y) => `<option value="${y}">${y}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Branch</label>
                        <select id="t-coord-branch" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="" selected>-- Branch --</option>
                            ${branchOptions.map((b) => `<option value="${b}">${b}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Section</label>
                        <select id="t-coord-section" style="width: 100%; padding: 0.5rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-main); font-size: 0.85rem;">
                            <option value="" selected>-- Sec --</option>
                            ${sectionOptions.map((s) => `<option value="${s}">Sec ${s}</option>`).join("")}
                        </select>
                    </div>
                </div>
            </div>
        </form>
    `,
    async () => {
      const is_coordinator = document.getElementById("t-coord").checked;
      let coord_class = null;
      if (is_coordinator) {
        const yr = document.getElementById("t-coord-year").value;
        const br = document.getElementById("t-coord-branch").value;
        const sec = document.getElementById("t-coord-section").value;
        if (!yr || !br || !sec) {
          showToast(
            "Please select Year, Branch, and Section for the coordinated class",
            "error",
          );
          return;
        }
        const matched = currentState.classes.find(
          (c) =>
            c.year === yr &&
            c.branch === br &&
            String(c.section) === String(sec),
        );
        if (!matched) {
          showToast(
            `No class section found matching ${yr} Year - ${br} - Sec ${sec}`,
            "error",
          );
          return;
        }
        const existing = currentState.teachers.find(
          (t) => t.coordinator_class === matched.id,
        );
        if (existing) {
          showToast(
            `This class already has a coordinator (${existing.name})`,
            "error",
          );
          return;
        }
        coord_class = matched.id;
      }
      const data = {
        employee_id: document.getElementById("t-eid").value,
        name: document.getElementById("t-name").value,
        department: document.getElementById("t-dept").value,
        email: document.getElementById("t-email").value,
        phone: document.getElementById("t-phone").value,
        is_coordinator: is_coordinator,
        coordinator_class: coord_class,
        status: "active",
      };
      const { error } = await supabaseClient.from("teachers").insert([data]);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Teacher added!");
      }
    },
  );
};

window.showAddStudentModal = () => {
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  showModal(
    "Add New Student",
    `
        <form id="add-student-form">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Roll No</label><input type="text" id="s-roll" required placeholder="e.g. 2023CS001"></div>
                <div class="form-group"><label>Full Name</label><input type="text" id="s-name" required placeholder="Student full name"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                <div class="form-group">
                    <label>Branch</label>
                    <select id="s-branch" required>
                        <option value="" disabled selected>Select Branch</option>
                        ${deptBranches.map((b) => `<option value="${b}">${b}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Year</label><select id="s-year" required><option value="" disabled selected>Select Year</option><option value="1st">1st</option><option value="2nd">2nd</option><option value="3rd">3rd</option><option value="4th">4th</option></select></div>
                <div class="form-group"><label>Section</label><select id="s-section" required><option value="" disabled selected>Select Section</option></select></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Lab Batch</label><select id="s-batch" required><option value="B1" selected>B1</option><option value="B2">B2</option></select></div>
                <div class="form-group"><label>Student Email</label><input type="email" id="s-email" placeholder="student@example.com"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Student Phone</label><input type="tel" id="s-phone" placeholder="+91 9876543210"></div>
                <div class="form-group"><label>Father's Name</label><input type="text" id="s-father-name" placeholder="Father's full name"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Father's Phone</label><input type="tel" id="s-father-phone" placeholder="+91 9876543210"></div>
                <div class="form-group"><label>Password</label><input type="password" id="s-password" placeholder="Defaults to neha2203 if empty"></div>
            </div>
        </form>
    `,
    async () => {
      const rollVal = document.getElementById("s-roll").value.trim();
      const data = {
        roll_no: rollVal,
        name: document.getElementById("s-name").value.trim(),
        branch: document.getElementById("s-branch").value,
        year: document.getElementById("s-year").value,
        section: document.getElementById("s-section").value,
        batch: document.getElementById("s-batch").value,
        email: document.getElementById("s-email").value.trim() || null,
        phone: document.getElementById("s-phone").value.trim() || null,
        father_name:
          document.getElementById("s-father-name").value.trim() || null,
        father_phone:
          document.getElementById("s-father-phone").value.trim() || null,
        password:
          document.getElementById("s-password").value.trim() || "neha2203",
      };
      if (
        !data.roll_no ||
        !data.name ||
        !data.branch ||
        !data.year ||
        !data.section
      ) {
        showToast(
          "Roll No, Name, Branch, Year and Section are required",
          "error",
        );
        return;
      }
      const { error } = await supabaseClient.from("students").insert([data]);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Student added!");
      }
    },
    { isWide: true },
  );

  const branchEl = document.getElementById("s-branch");
  const sectionEl = document.getElementById("s-section");
  if (branchEl && sectionEl) {
    branchEl.addEventListener("change", () => {
      const branch = branchEl.value;
      const secs = window.getBranchSectionsList(branch);
      let html = `<option value="" disabled selected>Select Section</option>`;
      secs.forEach((s) => {
        html += `<option value="${s}">${s}</option>`;
      });
      sectionEl.innerHTML = html;
    });
  }
};

window.editStudent = (id) => {
  const s = currentState.students.find((st) => st.id === id);
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  showModal(
    "Edit Student",
    `
        <div style="display:grid;gap:1rem;margin-top:0.5rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Full Name</label><input id="e-s-name" value="${s.name || ""}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                <div class="form-group"><label>Roll No</label><input id="e-s-roll" value="${s.roll_no || ""}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Branch</label>
                    <select id="e-s-branch" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        ${deptBranches.map((b) => `<option value="${b}" ${s.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Year</label>
                    <select id="e-s-year" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        ${["1st", "2nd", "3rd", "4th"].map((y) => `<option value="${y}" ${s.year === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Section</label>
                    <select id="e-s-section" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        ${window.getBranchSectionsList(s.branch).map((sec) => `<option value="${sec}" ${s.section === sec ? "selected" : ""}>${sec}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Batch</label>
                    <select id="e-s-batch" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        <option value="B1" ${s.batch === "B1" ? "selected" : ""}>B1</option>
                        <option value="B2" ${s.batch === "B2" ? "selected" : ""}>B2</option>
                    </select>
                </div>
                <div class="form-group"><label>Student Email</label><input type="email" id="e-s-email" value="${s.email || ""}" placeholder="student@example.com" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Student Phone</label><input type="tel" id="e-s-phone" value="${s.phone || ""}" placeholder="+91 9876543210" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                <div class="form-group"><label>Father's Name</label><input type="text" id="e-s-father-name" value="${s.father_name || ""}" placeholder="Father's full name" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Father's Phone</label><input type="tel" id="e-s-father-phone" value="${s.father_phone || ""}" placeholder="+91 9876543210" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                <div class="form-group"><label>Password</label><input type="password" id="e-s-password" value="${s.password || ""}" placeholder="Enter student password" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:1rem;grid-column:1 / -1;margin-top:0.5rem;">
                <h4 style="margin:0 0 1rem 0;color:var(--primary);">Academic Records & Profile Details</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Class 10 Board</label><input type="text" id="e-s-10-board" value="${s.class_10_board || ""}" placeholder="e.g. CBSE / State Board" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Class 10 %</label><input type="number" step="0.01" id="e-s-10-pct" value="${s.class_10_percent || ""}" placeholder="e.g. 92.4" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Class 12 Board</label><input type="text" id="e-s-12-board" value="${s.class_12_board || ""}" placeholder="e.g. CBSE / State Board" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Class 12 %</label><input type="number" step="0.01" id="e-s-12-pct" value="${s.class_12_percent || ""}" placeholder="e.g. 88.5" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Diploma %</label><input type="number" step="0.01" id="e-s-diploma-pct" value="${s.diploma_percent || ""}" placeholder="e.g. 78.2" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Current CGPA</label><input type="number" step="0.01" id="e-s-cgpa" value="${s.current_cgpa || ""}" placeholder="e.g. 8.45" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Active Backlogs</label><input type="number" id="e-s-active-backlogs" value="${s.active_backlogs || 0}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div class="form-group"><label>History Backlogs</label><input type="number" id="e-s-history-backlogs" value="${s.history_backlogs || 0}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Mother's Name</label><input type="text" id="e-s-mother-name" value="${s.mother_name || ""}" placeholder="Mother's full name" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
            </div>
        </div>
    `,
    async () => {
      const updates = {
        name: document.getElementById("e-s-name").value.trim(),
        roll_no: document.getElementById("e-s-roll").value.trim(),
        branch: document.getElementById("e-s-branch").value,
        year: document.getElementById("e-s-year").value,
        section: document.getElementById("e-s-section").value,
        batch: document.getElementById("e-s-batch").value,
        email: document.getElementById("e-s-email").value.trim() || null,
        phone: document.getElementById("e-s-phone").value.trim() || null,
        father_name:
          document.getElementById("e-s-father-name").value.trim() || null,
        father_phone:
          document.getElementById("e-s-father-phone").value.trim() || null,
        password:
          document.getElementById("e-s-password").value.trim() || "neha2203",
        class_10_board:
          document.getElementById("e-s-10-board").value.trim() || null,
        class_10_percent:
          parseFloat(document.getElementById("e-s-10-pct").value) || null,
        class_12_board:
          document.getElementById("e-s-12-board").value.trim() || null,
        class_12_percent:
          parseFloat(document.getElementById("e-s-12-pct").value) || null,
        diploma_percent:
          parseFloat(document.getElementById("e-s-diploma-pct").value) || null,
        current_cgpa:
          parseFloat(document.getElementById("e-s-cgpa").value) || null,
        active_backlogs:
          parseInt(document.getElementById("e-s-active-backlogs").value, 10) ||
          0,
        history_backlogs:
          parseInt(document.getElementById("e-s-history-backlogs").value, 10) ||
          0,
        mother_name:
          document.getElementById("e-s-mother-name").value.trim() || null,
      };
      const { error } = await supabaseClient
        .from("students")
        .update(updates)
        .eq("id", id);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Student updated successfully!");
        await loadAllData();
        renderActiveView();
      }
    },
    { confirmText: "Save Changes", isWide: true },
  );

  const branchEl = document.getElementById("e-s-branch");
  const sectionEl = document.getElementById("e-s-section");
  if (branchEl && sectionEl) {
    branchEl.addEventListener("change", () => {
      const branch = branchEl.value;
      const secs = window.getBranchSectionsList(branch);
      let html = "";
      secs.forEach((s) => {
        html += `<option value="${s}">${s}</option>`;
      });
      sectionEl.innerHTML = html;
    });
  }
};

window.deleteStudent = async (id) => {
  if (confirm("Delete this student?")) {
    let error;
    try {
      const res = await supabaseClient.from("students").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_student_entry",
        { student_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Student deleted");
  }
};

window.showAddSubjectModal = () => {
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  showModal(
    "Add New Subject",
    `
        <form id="add-subject-form">
            <div class="form-group"><label>Code</label><input type="text" id="sb-code" placeholder="CS101" required></div>
            <div class="form-group"><label>Name</label><input type="text" id="sb-name" placeholder="Operating Systems" required></div>
            <div class="form-group"><label>Department (read-only)</label><input type="text" id="sb-dept" value="${currentState.selectedDept || ""}" readonly required style="background:var(--bg-dark);color:var(--text-muted);cursor:not-allowed;opacity:0.8;"></div>
            <div class="form-group">
                <label>Branch</label>
                <select id="sb-branch" required>
                    <option value="" disabled selected>Select Branch</option>
                    ${deptBranches.map((b) => `<option value="${b}">${b}</option>`).join("")}
                </select>
            </div>
        </form>
    `,
    async () => {
      const data = {
        code: document.getElementById("sb-code").value,
        name: document.getElementById("sb-name").value,
        department: document.getElementById("sb-dept").value,
        branch: document.getElementById("sb-branch").value,
      };
      if (!data.code || !data.name || !data.branch) {
        showToast("All fields required", "error");
        return;
      }
      const { error } = await supabaseClient.from("subjects").insert([data]);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Subject added!");
      }
    },
  );
};

window.showAddClassModal = () => {
  const deptBranches = currentState.deptBranches || [currentState.selectedDept];
  showModal(
    "Add New Class",
    `
        <form id="add-class-form">
            <div class="form-group">
                <label>Department (read-only)</label>
                <input type="text" id="c-dept" value="${currentState.selectedDept || ""}" readonly required style="background:var(--bg-dark);color:var(--text-muted);cursor:not-allowed;opacity:0.8;width:100%;padding:0.75rem;border:1px solid var(--border);border-radius:0.5rem;">
            </div>
            <div class="form-group" style="margin-top:1rem;">
                <label>Branch</label>
                <select id="c-branch" required style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                    <option value="" disabled selected>Select Branch</option>
                    ${deptBranches.map((b) => `<option value="${b}">${b}</option>`).join("")}
                </select>
            </div>
            <div class="form-group"><label>Year</label><select id="c-year" required><option value="" disabled selected>Select Year</option><option value="1st">1st</option><option value="2nd">2nd</option><option value="3rd">3rd</option><option value="4th">4th</option></select></div>
            <div class="form-group"><label>Section</label><select id="c-section" required><option value="" disabled selected>Select Section</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
        </form>
    `,
    async () => {
      const data = {
        branch: document.getElementById("c-branch").value,
        year: document.getElementById("c-year").value,
        section: document.getElementById("c-section").value,
      };
      if (!data.branch || !data.year || !data.section) {
        showToast("All fields are required", "error");
        return;
      }
      const exists = currentState.classes.find(
        (c) =>
          c.branch === data.branch &&
          c.year === data.year &&
          c.section === data.section,
      );
      if (exists) {
        showToast("This class already exists!", "error");
        return;
      }
      const { error } = await supabaseClient.from("classes").insert([data]);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Class added!");
      }
    },
  );
};

window.toggleTimetableLab = (isLab) => {
  const ttLabConfig = document.getElementById("tt-lab-config");
  const ttNonLabConfig = document.getElementById("tt-non-lab-config");
  if (ttLabConfig) ttLabConfig.style.display = isLab ? "block" : "none";
  if (ttNonLabConfig) ttNonLabConfig.style.display = isLab ? "none" : "block";
};

window.toggleTimetableBatchConfig = (batch, checked) => {
  const id = batch === "B1" ? "tt-b1-config-section" : "tt-b2-config-section";
  const section = document.getElementById(id);
  if (section) section.style.display = checked ? "block" : "none";
  if (checked) {
    const bothCheckbox = document.getElementById("tt-batch-both");
    if (bothCheckbox && bothCheckbox.checked) {
      bothCheckbox.checked = false;
      const bothSection = document.getElementById("tt-both-config-section");
      if (bothSection) bothSection.style.display = "none";
    }
  }
};

window.toggleTimetableBatchBoth = (checked) => {
  const b1 = document.getElementById("tt-batch-b1");
  const b2 = document.getElementById("tt-batch-b2");
  if (checked) {
    if (b1) {
      b1.checked = false;
      window.toggleTimetableBatchConfig("B1", false);
    }
    if (b2) {
      b2.checked = false;
      window.toggleTimetableBatchConfig("B2", false);
    }
  }

  const bothSection = document.getElementById("tt-both-config-section");
  if (bothSection) bothSection.style.display = checked ? "block" : "none";
};

const mergeTimeSlots = (selectedSlots) => {
  const timeMap = {
    "10.30-11.20": {
      start: "10:30:00",
      end: "11:20:00",
      startMin: 630,
      endMin: 680,
    },
    "11.20-12.10": {
      start: "11:20:00",
      end: "12:10:00",
      startMin: 680,
      endMin: 730,
    },
    "12.10-1.00": {
      start: "12:10:00",
      end: "13:00:00",
      startMin: 730,
      endMin: 780,
    },
    "1.50-2.40": {
      start: "13:50:00",
      end: "14:40:00",
      startMin: 830,
      endMin: 880,
    },
    "2.40-3.30": {
      start: "14:40:00",
      end: "15:30:00",
      startMin: 880,
      endMin: 930,
    },
    "3.30-4.15": {
      start: "15:30:00",
      end: "16:15:00",
      startMin: 930,
      endMin: 975,
    },
    "4.15-5.00": {
      start: "16:15:00",
      end: "17:00:00",
      startMin: 975,
      endMin: 1020,
    },
  };

  const slots = selectedSlots.map((s) => timeMap[s]).filter(Boolean);
  slots.sort((a, b) => a.startMin - b.startMin);

  const merged = [];
  if (slots.length === 0) return merged;

  let current = { ...slots[0] };
  for (let i = 1; i < slots.length; i++) {
    const next = slots[i];
    if (current.endMin === next.startMin) {
      current.end = next.end;
      current.endMin = next.endMin;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
};

window.showAddTimetableModal = (presetDay = "", presetTime = "") => {
  const tFilters = currentState.timetableFilters || {};
  const branches =
    currentState.selectedDept === "IT"
      ? ["IT", "DS"]
      : [currentState.selectedDept];

  const scopedTeachers = currentState.teachers.filter(
    (t) => t.department === currentState.selectedDept,
  );
  const scopedSubjects = currentState.subjects.filter(
    (s) => s.department === currentState.selectedDept,
  );

  showModal(
    "Schedule Lecture",
    `
        <form id="add-timetable-form">
            <div class="form-group" style="margin-top: 1rem;">
                <label>Day of Week</label>
                <select id="tt-day" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                    <option value="" disabled selected>Select Day</option>
                    ${["MON", "TUE", "WED", "THUR", "FRI", "SAT"].map((d) => `<option value="${d}" ${presetDay === d ? "selected" : ""}>${d}</option>`).join("")}
                </select>
            </div>
            
            <div class="form-group" style="margin-top: 1rem;">
                <label>Time Slots (Select one or more consecutive slots to merge)</label>
                <div id="tt-time-list" style="max-height:120px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:0.5rem;">
                    ${[
                      "10.30-11.20",
                      "11.20-12.10",
                      "12.10-1.00",
                      "1.50-2.40",
                      "2.40-3.30",
                      "3.30-4.15",
                      "4.15-5.00",
                    ]
                      .map(
                        (ts) => `
                        <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main); font-size:0.85rem;">
                            <input type="checkbox" name="tt-time-checkbox" value="${ts}" ${presetTime === ts ? "checked" : ""} style="width:auto;">
                            <span>${ts}</span>
                        </label>
                    `,
                      )
                      .join("")}
                </div>
            </div>

            <div class="form-group" style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <input type="checkbox" id="tt-is-lab" style="width:auto;" onchange="window.toggleTimetableLab(this.checked)">
                <label style="margin:0; font-weight:700;">Is Lab?</label>
            </div>
            <div id="tt-non-lab-config" style="margin-top: 1rem;">
                <div class="form-group">
                    <label>Subject</label>
                    <select id="tt-subject" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Subject</option>
                        ${scopedSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group" style="margin-top: 1rem;">
                    <label>Teachers (Select one or more)</label>
                    <div style="max-height:120px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                        ${scopedTeachers
                          .map(
                            (t) => `
                            <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main);">
                                <input type="checkbox" name="tt-teacher-checkbox" value="${t.id}" style="width:auto;">
                                <span>${t.name}</span>
                            </label>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            </div>
            <div id="tt-lab-config" style="margin-top: 1rem; display: none;">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label>Select Batches</label>
                    <div style="display:flex; gap:1.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main);">
                            <input type="checkbox" id="tt-batch-both" style="width:auto;" onchange="window.toggleTimetableBatchBoth(this.checked)">
                            <span>Both (Combined)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main);">
                            <input type="checkbox" id="tt-batch-b1" style="width:auto;" onchange="window.toggleTimetableBatchConfig('B1', this.checked)">
                            <span>Batch B1</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-main);">
                            <input type="checkbox" id="tt-batch-b2" style="width:auto;" onchange="window.toggleTimetableBatchConfig('B2', this.checked)">
                            <span>Batch B2</span>
                        </label>
                    </div>
                </div>
                <div id="tt-both-config-section" style="display:none; padding:1rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(255,255,255,0.02); margin-bottom:1rem;">
                    <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">Combined Lab Configuration</h4>
                    <div class="form-group">
                        <label>Subject for Combined Lab</label>
                        <select id="tt-subject-both" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                            <option value="" disabled selected>Select Subject</option>
                            ${scopedSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:0.75rem;">
                        <label>Teachers for Combined Lab</label>
                        <div style="max-height:100px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                            ${scopedTeachers
                              .map(
                                (t) => `
                                <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main); font-size:0.85rem;">
                                    <input type="checkbox" name="tt-teacher-checkbox-both" value="${t.id}" style="width:auto;">
                                    <span>${t.name}</span>
                                </label>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
                <div id="tt-b1-config-section" style="display:none; padding:1rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(255,255,255,0.02); margin-bottom:1rem;">
                    <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">Batch B1 Configuration</h4>
                    <div class="form-group">
                        <label>Subject for B1</label>
                        <select id="tt-subject-b1" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                            <option value="" disabled selected>Select Subject</option>
                            ${scopedSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:0.75rem;">
                        <label>Teachers for B1</label>
                        <div style="max-height:100px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                            ${scopedTeachers
                              .map(
                                (t) => `
                                <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main); font-size:0.85rem;">
                                    <input type="checkbox" name="tt-teacher-checkbox-b1" value="${t.id}" style="width:auto;">
                                    <span>${t.name}</span>
                                </label>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
                <div id="tt-b2-config-section" style="display:none; padding:1rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(255,255,255,0.02);">
                    <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">Batch B2 Configuration</h4>
                    <div class="form-group">
                        <label>Subject for B2</label>
                        <select id="tt-subject-b2" style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                            <option value="" disabled selected>Select Subject</option>
                            ${scopedSubjects.map((s) => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join("")}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:0.75rem;">
                        <label>Teachers for B2</label>
                        <div style="max-height:100px; overflow-y:auto; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                            ${scopedTeachers
                              .map(
                                (t) => `
                                <label style="display:flex; align-items:center; gap:0.5rem; margin:0; cursor:pointer; color:var(--text-main); font-size:0.85rem;">
                                    <input type="checkbox" name="tt-teacher-checkbox-b2" value="${t.id}" style="width:auto;">
                                    <span>${t.name}</span>
                                </label>
                            `,
                              )
                              .join("")}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="form-group" style="margin-top: 1.5rem; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                <div>
                    <label>Branch</label>
                    <select id="tt-branch" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Branch</option>
                        ${branches.map((b) => `<option value="${b}" ${tFilters.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                <div>
                    <label>Year</label>
                    <select id="tt-year" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Year</option>
                        <option value="1st" ${tFilters.year === "1st" ? "selected" : ""}>1st</option>
                        <option value="2nd" ${tFilters.year === "2nd" ? "selected" : ""}>2nd</option>
                        <option value="3rd" ${tFilters.year === "3rd" ? "selected" : ""}>3rd</option>
                        <option value="4th" ${tFilters.year === "4th" ? "selected" : ""}>4th</option>
                    </select>
                </div>
                <div>
                    <label>Section</label>
                    <select id="tt-section" required style="width:100%; padding:0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
                        <option value="" disabled selected>Select Section</option>
                        <option value="1" ${tFilters.section === "1" ? "selected" : ""}>1</option>
                        <option value="2" ${tFilters.section === "2" ? "selected" : ""}>2</option>
                        <option value="3" ${tFilters.section === "3" ? "selected" : ""}>3</option>
                        <option value="4" ${tFilters.section === "4" ? "selected" : ""}>4</option>
                        <option value="5" ${tFilters.section === "5" ? "selected" : ""}>5</option>
                    </select>
                </div>
            </div>
        </form>
    `,
    async () => {
      const dayVal = document.getElementById("tt-day").value;
      const selectedTimeSlots = document.querySelectorAll(
        'input[name="tt-time-checkbox"]:checked',
      );
      const timeVals = Array.from(selectedTimeSlots).map((cb) => cb.value);

      if (!dayVal || timeVals.length === 0) {
        showToast(
          "Day of week and at least one time slot are required",
          "error",
        );
        return;
      }

      const isLab = document.getElementById("tt-is-lab").checked;
      const branchVal = document.getElementById("tt-branch").value;
      const yearVal = document.getElementById("tt-year").value;
      const sectionVal = document.getElementById("tt-section").value;
      if (!branchVal || !yearVal || !sectionVal) {
        showToast("Branch, Year and Section are required", "error");
        return;
      }

      const classObj = currentState.classes.find(
        (c) =>
          c.branch === branchVal &&
          c.year === yearVal &&
          c.section === sectionVal,
      );
      if (!classObj)
        return showToast(
          "Class not found. Create it first in Class Management.",
          "error",
        );
      const mergedSlots = mergeTimeSlots(timeVals);
      if (mergedSlots.length === 0) {
        showToast("Please select valid time slots", "error");
        return;
      }

      const records = [];

      if (isLab) {
        const hasBoth = document.getElementById("tt-batch-both").checked;
        const hasB1 = document.getElementById("tt-batch-b1").checked;
        const hasB2 = document.getElementById("tt-batch-b2").checked;

        if (!hasBoth && !hasB1 && !hasB2) {
          showToast(
            "Please select at least one batch or Combined for the Lab",
            "error",
          );
          return;
        }

        if (hasBoth) {
          const bothSubjectId =
            document.getElementById("tt-subject-both").value;
          const bothTeacherCheckboxes = document.querySelectorAll(
            'input[name="tt-teacher-checkbox-both"]:checked',
          );
          const bothTeacherIds = Array.from(bothTeacherCheckboxes).map(
            (cb) => cb.value,
          );

          if (!bothSubjectId || bothTeacherIds.length === 0) {
            showToast(
              "Please configure Subject and Teachers for Combined Lab",
              "error",
            );
            return;
          }

          mergedSlots.forEach((slot) => {
            records.push({
              teacher_id: bothTeacherIds[0],
              teacher_ids: bothTeacherIds,
              subject_id: bothSubjectId,
              class_id: classObj.id,
              day_of_week: dayVal,
              start_time: slot.start,
              end_time: slot.end,
              is_lab: true,
              batch: null,
            });
          });
        } else {
          if (hasB1) {
            const b1SubjectId = document.getElementById("tt-subject-b1").value;
            const b1TeacherCheckboxes = document.querySelectorAll(
              'input[name="tt-teacher-checkbox-b1"]:checked',
            );
            const b1TeacherIds = Array.from(b1TeacherCheckboxes).map(
              (cb) => cb.value,
            );

            if (!b1SubjectId || b1TeacherIds.length === 0) {
              showToast(
                "Please configure Subject and Teachers for Batch B1",
                "error",
              );
              return;
            }

            mergedSlots.forEach((slot) => {
              records.push({
                teacher_id: b1TeacherIds[0],
                teacher_ids: b1TeacherIds,
                subject_id: b1SubjectId,
                class_id: classObj.id,
                day_of_week: dayVal,
                start_time: slot.start,
                end_time: slot.end,
                is_lab: true,
                batch: "B1",
              });
            });
          }
          if (hasB2) {
            const b2SubjectId = document.getElementById("tt-subject-b2").value;
            const b2TeacherCheckboxes = document.querySelectorAll(
              'input[name="tt-teacher-checkbox-b2"]:checked',
            );
            const b2TeacherIds = Array.from(b2TeacherCheckboxes).map(
              (cb) => cb.value,
            );

            if (!b2SubjectId || b2TeacherIds.length === 0) {
              showToast(
                "Please configure Subject and Teachers for Batch B2",
                "error",
              );
              return;
            }

            mergedSlots.forEach((slot) => {
              records.push({
                teacher_id: b2TeacherIds[0],
                teacher_ids: b2TeacherIds,
                subject_id: b2SubjectId,
                class_id: classObj.id,
                day_of_week: dayVal,
                start_time: slot.start,
                end_time: slot.end,
                is_lab: true,
                batch: "B2",
              });
            });
          }
        }
      } else {
        const subjectId = document.getElementById("tt-subject").value;
        const teacherCheckboxes = document.querySelectorAll(
          'input[name="tt-teacher-checkbox"]:checked',
        );
        const teacherIds = Array.from(teacherCheckboxes).map((cb) => cb.value);

        if (!subjectId || teacherIds.length === 0) {
          showToast("Subject and at least one teacher are required", "error");
          return;
        }

        mergedSlots.forEach((slot) => {
          records.push({
            teacher_id: teacherIds[0],
            teacher_ids: teacherIds,
            subject_id: subjectId,
            class_id: classObj.id,
            day_of_week: dayVal,
            start_time: slot.start,
            end_time: slot.end,
            is_lab: false,
            batch: null,
          });
        });
      }

      const { error } = await supabaseClient.from("timetable").insert(records);
      if (error) showToast(error.message, "error");
      else {
        await loadAllData();
        closeModal();
        renderActiveView();
        showToast("Schedule saved successfully!");
      }
    },
  );
};

window.deleteStudent = async (id) => {
  if (confirm("Delete this student?")) {
    let error;
    try {
      const res = await supabaseClient.from("students").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_student_entry",
        { student_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Student deleted");
  }
};

window.deleteTeacher = async (id) => {
  if (confirm("Delete this teacher?")) {
    let error;
    try {
      const res = await supabaseClient.from("teachers").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_teacher_entry",
        { teacher_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Teacher deleted");
  }
};

window.deleteSubject = async (id) => {
  if (confirm("Delete this subject?")) {
    let error;
    try {
      const res = await supabaseClient.from("subjects").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_subject_entry",
        { subject_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Subject deleted");
  }
};

window.deleteClass = async (id) => {
  if (confirm("Delete this class?")) {
    let error;
    try {
      const res = await supabaseClient.from("classes").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_class_entry",
        { class_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Class deleted");
  }
};

window.deleteTimetable = async (id) => {
  if (confirm("Delete this scheduled lecture?")) {
    let error;
    try {
      const res = await supabaseClient.from("timetable").delete().eq("id", id);
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      console.warn("Standard delete failed, falling back to RPC:", error);
      const { error: rpcError } = await supabaseClient.rpc(
        "delete_timetable_entry",
        { entry_id: id },
      );
      if (rpcError) {
        showToast(rpcError.message, "error");
        return;
      }
    }
    await loadAllData();
    renderActiveView();
    showToast("Lecture deleted");
  }
};
window.updateSubjectFilter = (key, value) => {
  currentState.subjectsFilters[key] = value;
  renderActiveView();
};
function renderTeacherSchedule(container) {
  const teacher = currentState.teacherData;
  if (!teacher) {
    container.innerHTML = "<p>Not logged in as teacher.</p>";
    return;
  }
  const myEntries = currentState.timetable.filter(
    (t) =>
      t.teacher_id === teacher.id ||
      (t.teacher_ids && t.teacher_ids.includes(teacher.id)),
  );
  const days = ["MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const timeSlots = [
    "10.30-11.20",
    "11.20-12.10",
    "12.10-1.00",
    "1.50-2.40",
    "2.40-3.30",
    "3.30-4.15",
    "4.15-5.00",
  ];

  const formatDbTime = (dbTime) => {
    if (!dbTime) return "";
    const parts = dbTime.split(":");
    const hr = parseInt(parts[0], 10);
    const min = parts[1];
    if (hr >= 10) return `${hr}.${min}`;
    return `${hr > 12 ? hr - 12 : hr}.${min}`;
  };

  const dayMap = {};
  days.forEach((d) => {
    dayMap[d] = myEntries
      .filter((t) => t.day_of_week === d)
      .map((t) => {
        const tStart = formatDbTime(t.start_time);
        const tEnd = formatDbTime(t.end_time);
        return { ...t, slot: `${tStart}-${tEnd}` };
      });
  });

  container.innerHTML = `
        <h1 style="margin-bottom: 0.5rem;">My Weekly Schedule</h1>
        <p style="color:var(--text-muted); margin-bottom: 2rem;">All classes assigned to you across all branches and sections.</p>
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            ${days
              .map((day) => {
                const entries = dayMap[day];
                if (entries.length === 0)
                  return `
                    <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;opacity:0.5;">
                        <strong style="color:var(--text-muted);">${day}</strong>
                        <span style="color:var(--text-muted);font-size:0.85rem;">No classes scheduled</span>
                    </div>`;
                return `
                <div class="card" style="padding:0;overflow:hidden;">
                    <div style="background:rgba(99,102,241,0.08);padding:0.75rem 1.5rem;border-bottom:1px solid var(--border);font-weight:800;color:var(--primary);letter-spacing:0.05em;">${day}</div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); gap:1rem; padding:1rem 1.5rem;">
                        ${entries
                          .map((e) => {
                            const typeLabel = e.is_lab
                              ? `Lab (${e.batch || "All"})`
                              : "Lecture";
                            return `
                                <div style="background:var(--bg-dark);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;border-left:4px solid var(--primary);">
                                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">${e.slot}</div>
                                    <div style="font-weight:700;color:var(--text-main);">${e.subjects?.code || ""} — ${e.subjects?.name || ""}</div>
                                    <div style="font-size:0.8rem;color:var(--primary);margin-top:0.25rem;">${e.classes?.branch || ""} ${e.classes?.year || ""} &middot; Sec ${e.classes?.section || ""}</div>
                                    <div style="font-size:0.75rem;color:var(--accent);margin-top:0.25rem;font-weight:600;">${typeLabel}</div>
                                </div>
                            `;
                          })
                          .join("")}
                    </div>
                </div>`;
              })
              .join("")}
        </div>
    `;
}

async function renderCoordDashboard(container, selectedDateStr = null) {
  const teacher = currentState.teacherData;
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const todayDate =
    selectedDateStr ||
    window._selectedCoordDateStr ||
    new Date().toISOString().split("T")[0];
  window._selectedCoordDateStr = todayDate;

  const dateObj = new Date(todayDate + "T12:00:00");
  const todayDay = daysOfWeek[dateObj.getDay()];
  const displayDayStr = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const displayTimeStr = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formatDbTime = (dbTime) => {
    if (!dbTime) return "";
    const parts = dbTime.split(":");
    const hr = parseInt(parts[0], 10);
    const min = parts[1];
    return `${hr}:${min}`;
  };
  let coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;
  if (!coordClass) {
    container.innerHTML = `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
                ⚠️ You are not designated as a coordinator for any class section. Please contact the Admin.
            </div>
        `;
    return;
  }

  let branch = coordClass.branch;
  let year = coordClass.year;
  let section = coordClass.section;
  let coordClassId = coordClass.id;
  let coordClassLabel = `${branch} ${year} Sec ${section}`;
  const { data: classStudents } = await supabaseClient
    .from("students")
    .select("*")
    .eq("branch", branch)
    .eq("year", year)
    .eq("section", section);

  const totalStudentsCount = classStudents.length;
  const studentIds = classStudents.map((s) => s.id);
  const allTodaySlots = currentState.timetable
    .filter(
      (t) =>
        t.day_of_week === todayDay &&
        (coordClassId ? String(t.class_id) === String(coordClassId) : true),
    )
    .map((t) => ({
      ...t,
      slot: `${formatDbTime(t.start_time)} - ${formatDbTime(t.end_time)}`,
    }))
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  const allClassSlots = currentState.timetable
    .filter((t) =>
      coordClassId ? String(t.class_id) === String(coordClassId) : true,
    )
    .map((t) => ({
      ...t,
      slot: `${formatDbTime(t.start_time)} - ${formatDbTime(t.end_time)}`,
    }))
    .sort((a, b) => {
      const dayOrder = ["MON", "TUE", "WED", "THUR", "FRI", "SAT", "SUN"];
      const da = dayOrder.indexOf(a.day_of_week),
        db = dayOrder.indexOf(b.day_of_week);
      if (da !== db) return da - db;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  const lectureStats = [];
  let lecIdx = 0;
  for (const lec of allTodaySlots) {
    lecIdx++;
    const { data: records } = await supabaseClient
      .from("attendance_records")
      .select("id, status, teacher_id, teacher_ids, subject_id, subjects(code, name), students(name, roll_no)")
      .eq("date", todayDate)
      .eq("class_id", lec.class_id)
      .eq("lecture_no", lecIdx);

    const allRecords = records || [];
    const total = allRecords.length;
    const present = allRecords.filter((r) => r.status === "Present").length;
    const absent = total - present;
    const pct = total > 0 ? ((present / total) * 100).toFixed(1) : null;

    const submittedTeacherIds = allRecords && allRecords[0] ? (allRecords[0].teacher_ids || [allRecords[0].teacher_id]).filter(Boolean) : [];
    const submittedTeachers = submittedTeacherIds.length > 0
      ? submittedTeacherIds
          .map((tid) => currentState.teachers.find((t) => t.id === tid)?.name || "")
          .filter(Boolean)
          .join(", ")
      : "";

    const actualSubjectCode = allRecords && allRecords[0]?.subjects ? allRecords[0].subjects.code : lec.subjects?.code || "";
    const actualSubjectName = allRecords && allRecords[0]?.subjects ? allRecords[0].subjects.name : lec.subjects?.name || "—";

    lectureStats.push({
      id: lec.id,
      class_id: lec.class_id,
      subject_id: allRecords && allRecords[0] ? allRecords[0].subject_id : lec.subject_id,
      label: `${actualSubjectCode} (${lec.slot})`,
      subjectName: actualSubjectName,
      subjectCode: actualSubjectCode,
      slot: lec.slot,
      classInfo: `${lec.classes?.branch || ""} ${lec.classes?.year || ""} Sec ${lec.classes?.section || ""}`,
      typeLabel: lec.is_lab ? `Lab (${lec.batch || "All"})` : "Lecture",
      teachers: submittedTeachers,
      present,
      absent,
      total,
      pct,
      allRecords,
      isSubmitted: total > 0,
    });
  }
  const getWeekRange = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return {
      start: mon.toISOString().split("T")[0],
      end: sun.toISOString().split("T")[0],
    };
  };

  const getMonthRange = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const start = new Date(yr, mo, 1);
    const end = new Date(yr, mo + 1, 0);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  const weekRange = getWeekRange(todayDate);
  const monthRange = getMonthRange(todayDate);
  let weekRecords = [];
  let monthRecords = [];
  if (studentIds.length > 0 && coordClassId) {
    const [wRes, mRes] = await Promise.all([
      supabaseClient
        .from("attendance_records")
        .select("status, subject_id, date, batch")
        .in("student_id", studentIds)
        .gte("date", weekRange.start)
        .lte("date", weekRange.end),
      supabaseClient
        .from("attendance_records")
        .select("status, subject_id, date, batch")
        .in("student_id", studentIds)
        .gte("date", monthRange.start)
        .lte("date", monthRange.end),
    ]);
    weekRecords = wRes.data || [];
    monthRecords = mRes.data || [];
  }
  const weekTotal = weekRecords.length;
  const weekPresent = weekRecords.filter((r) => r.status === "Present").length;
  const weekPct =
    weekTotal > 0
      ? parseFloat(((weekPresent / weekTotal) * 100).toFixed(1))
      : 0;
  const weekAbsent = weekTotal - weekPresent;
  const monthTotal = monthRecords.length;
  const monthPresent = monthRecords.filter(
    (r) => r.status === "Present",
  ).length;
  const monthPct =
    monthTotal > 0
      ? parseFloat(((monthPresent / monthTotal) * 100).toFixed(1))
      : 0;
  const monthAbsent = monthTotal - monthPresent;
  const aggregateBySubject = (rows) => {
    const groups = {};
    rows.forEach((row) => {
      const key = `${row.subjectCode}_${row.typeLabel}`;
      if (!groups[key]) {
        groups[key] = {
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          typeLabel: row.typeLabel,
          teachersSet: new Set(),
          present: 0,
          absent: 0,
          total: 0,
        };
      }
      if (row.teachers && row.teachers !== "Not Assigned") {
        row.teachers
          .split(",")
          .map((t) => t.trim())
          .forEach((t) => {
            if (t) groups[key].teachersSet.add(t);
          });
      }
      groups[key].present += row.present || 0;
      groups[key].absent += row.absent || 0;
      groups[key].total += row.total || 0;
    });

    return Object.values(groups).map((g) => {
      const teachersList = Array.from(g.teachersSet);
      const teachers =
        teachersList.length > 0 ? teachersList.join(", ") : "Not Assigned";
      const rate =
        g.total > 0
          ? `${((g.present / g.total) * 100).toFixed(1)}%`
          : "No Attendance";
      return {
        subjectCode: g.subjectCode,
        subjectName: g.subjectName,
        typeLabel: g.typeLabel,
        teachers,
        present: g.present,
        absent: g.absent,
        total: g.total,
        rate,
      };
    });
  };
  const rawDatewiseLectureRows = lectureStats.map((ls) => ({
    day: todayDay,
    subjectCode: ls.subjectCode,
    subjectName: ls.subjectName,
    slot: ls.slot,
    teachers: ls.teachers || "Not Assigned",
    typeLabel: ls.typeLabel,
    present: ls.present,
    absent: ls.absent,
    total: ls.total,
    rate: ls.total > 0 ? `${ls.pct}%` : "No Attendance",
  }));
  const datewiseLectureRows = aggregateBySubject(rawDatewiseLectureRows);
  const rawWeeklyLectureRows = allClassSlots.map((lec) => {
    const matching = weekRecords.filter((r) => {
      if (r.subject_id !== lec.subject_id) return false;
      const recDate = new Date(r.date + "T12:00:00");
      const recDay = daysOfWeek[recDate.getDay()];
      if (recDay !== lec.day_of_week) return false;
      if (lec.is_lab && lec.batch && r.batch && r.batch !== "All") {
        if (r.batch !== lec.batch) return false;
      }
      return true;
    });

    const total = matching.length;
    const present = matching.filter((r) => r.status === "Present").length;
    const absent = total - present;
    const rate =
      total > 0 ? `${((present / total) * 100).toFixed(1)}%` : "No Attendance";

    const subCode = lec.subjects?.code || lec.subject_id || "—";
    const subName = lec.subjects?.name || "—";
    const lecTeachers =
      (lec.teacher_ids || [lec.teacher_id])
        .filter(Boolean)
        .map(
          (tid) => currentState.teachers.find((t) => t.id === tid)?.name || "",
        )
        .filter(Boolean)
        .join(", ") || "Not Assigned";

    return {
      day: lec.day_of_week || "",
      subjectCode: subCode,
      subjectName: subName,
      slot: lec.slot,
      teachers: lecTeachers,
      typeLabel: lec.is_lab ? `Lab (${lec.batch || "All"})` : "Lecture",
      present,
      absent,
      total,
      rate,
    };
  });
  const weeklyLectureRows = aggregateBySubject(rawWeeklyLectureRows);
  const rawMonthlyLectureRows = allClassSlots.map((lec) => {
    const matching = monthRecords.filter((r) => {
      if (r.subject_id !== lec.subject_id) return false;
      const recDate = new Date(r.date + "T12:00:00");
      const recDay = daysOfWeek[recDate.getDay()];
      if (recDay !== lec.day_of_week) return false;
      if (lec.is_lab && lec.batch && r.batch && r.batch !== "All") {
        if (r.batch !== lec.batch) return false;
      }
      return true;
    });

    const total = matching.length;
    const present = matching.filter((r) => r.status === "Present").length;
    const absent = total - present;
    const rate =
      total > 0 ? `${((present / total) * 100).toFixed(1)}%` : "No Attendance";

    const subCode = lec.subjects?.code || lec.subject_id || "—";
    const subName = lec.subjects?.name || "—";
    const lecTeachers =
      (lec.teacher_ids || [lec.teacher_id])
        .filter(Boolean)
        .map(
          (tid) => currentState.teachers.find((t) => t.id === tid)?.name || "",
        )
        .filter(Boolean)
        .join(", ") || "Not Assigned";

    return {
      day: lec.day_of_week || "",
      subjectCode: subCode,
      subjectName: subName,
      slot: lec.slot,
      teachers: lecTeachers,
      typeLabel: lec.is_lab ? `Lab (${lec.batch || "All"})` : "Lecture",
      present,
      absent,
      total,
      rate,
    };
  });
  const monthlyLectureRows = aggregateBySubject(rawMonthlyLectureRows);
  const classesTodayCount = allTodaySlots.length;
  const grandPresent = lectureStats.reduce((s, ls) => s + ls.present, 0);
  const grandTotal = lectureStats.reduce((s, ls) => s + ls.total, 0);
  const overallPct =
    grandTotal > 0
      ? parseFloat(((grandPresent / grandTotal) * 100).toFixed(1))
      : 0;
  const grandAbsent = grandTotal - grandPresent;
  let below75Count = 0;
  if (studentIds.length > 0) {
    const { data: classRecords } = await supabaseClient
      .from("attendance_records")
      .select("student_id, status")
      .in("student_id", studentIds);

    const studentAttendance = {};
    studentIds.forEach((id) => {
      studentAttendance[id] = { present: 0, total: 0 };
    });
    if (classRecords) {
      classRecords.forEach((r) => {
        if (studentAttendance[r.student_id]) {
          studentAttendance[r.student_id].total++;
          if (r.status === "Present") {
            studentAttendance[r.student_id].present++;
          }
        }
      });
    }
    studentIds.forEach((id) => {
      const s = studentAttendance[id];
      if (s.total > 0) {
        const rate = (s.present / s.total) * 100;
        if (rate < 75) {
          below75Count++;
        }
      }
    });
  }
  window.exportToCSV = () => {
    const stats = window._coordLectureStats || [];
    if (stats.length === 0) {
      showToast("No lecture data to export", "error");
      return;
    }
    const headers = [
      "Subject Code",
      "Subject Name",
      "Time Slot",
      "Class Info",
      "Type",
      "Faculty",
      "Present",
      "Absent",
      "Total",
      "Attendance Rate",
    ];
    const rows = stats.map((s) => [
      s.subjectCode,
      s.subjectName,
      s.slot,
      s.classInfo,
      s.typeLabel,
      s.teachers || "Not Assigned",
      s.present,
      s.absent,
      s.total,
      s.pct ? s.pct + "%" : "0%",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) =>
        r
          .map((val) => {
            let cell = val === null || val === undefined ? "" : String(val);
            cell = cell.split('"').join('""');
            if (
              cell.includes('"') ||
              cell.includes(",") ||
              cell.includes("\n")
            ) {
              cell = `"${cell}"`;
            }
            return cell;
          })
          .join(","),
      ),
    ].join("\r\n");

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `coordinator_daily_report_${window._selectedCoordDateStr || new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Dashboard report CSV downloaded successfully");
  };

  window.changeCoordDate = (dateStr) => {
    window._selectedCoordDateStr = dateStr;
    const container = document.getElementById("main-content");
    if (container) {
      renderCoordDashboard(container, dateStr);
    }
  };

  window.switchCoordTrendTab = (tabName) => {
    const tabs = ["datewise", "weekly", "monthly"];
    tabs.forEach((t) => {
      const panel = document.getElementById("coord-trend-" + t);
      if (panel) panel.style.display = t === tabName ? "flex" : "none";
    });
    document.querySelectorAll(".coord-trend-tab").forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.style.background = "#003366";
        btn.style.color = "#ffffff";
      } else {
        btn.style.background = "none";
        btn.style.color = "var(--text-muted)";
      }
    });
  };

  window.switchCoordSubTab = (parent, sub) => {
    const combined = document.getElementById("coord-" + parent + "-combined");
    const subjectwise = document.getElementById(
      "coord-" + parent + "-subjectwise",
    );
    if (combined) combined.style.display = sub === "combined" ? "flex" : "none";
    if (subjectwise)
      subjectwise.style.display = sub === "subjectwise" ? "block" : "none";
    document.querySelectorAll(".coord-sub-tab").forEach((btn) => {
      if (btn.dataset.parent === parent) {
        if (btn.dataset.sub === sub) {
          btn.style.background = "#003366";
          btn.style.color = "#ffffff";
        } else {
          btn.style.background = "none";
          btn.style.color = "var(--text-muted)";
        }
      }
    });
  };

  container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin: 0;">Welcome back, ${teacher?.name || "Coordinator"} 👋</h2>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.15rem 0 0 0;">Here is today's overview and academic metrics for your class.</p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; background: rgba(0, 51, 102, 0.05); padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(0, 51, 102, 0.15);">
                        Class: ${coordClass ? `${coordClass.branch} ${coordClass.year} · Sec ${coordClass.section}` : "N/A"}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; background: #ffffff; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                        ${displayDayStr} · <span id="coord-live-time-badge">${displayTimeStr}</span>
                    </div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Total Students</span>
                        <i data-lucide="users" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
                    </div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-top: 0.75rem;">
                        ${totalStudentsCount.toLocaleString()}
                    </div>
                </div>
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Classes Today</span>
                        <i data-lucide="graduation-cap" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
                    </div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-top: 0.75rem;">
                        ${classesTodayCount}
                    </div>
                </div>
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm); border: none; background: #003366; color: #ffffff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.65rem; color: rgba(255, 255, 255, 0.75); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Today's Attendance</span>
                        <i data-lucide="trending-up" style="width: 16px; height: 16px; color: #2dd4bf;"></i>
                    </div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: #ffffff; margin-top: 0.75rem;">
                        ${overallPct}%
                    </div>
                </div>
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.65rem; color: #ef4444; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Below 75%</span>
                        <i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #ef4444;"></i>
                    </div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-top: 0.75rem;">
                        ${below75Count}
                    </div>
                </div>
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Absent Today</span>
                        <i data-lucide="user-x" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
                    </div>
                    <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-top: 0.75rem;">
                        ${grandAbsent}
                    </div>
                </div>
            </div>
            <div class="coord-main-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; align-items: stretch;">
                <div class="card" style="margin-bottom: 0; padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff; display: flex; flex-direction: column; gap: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Attendance Trends</h3>
                        <input type="date" value="${todayDate}" onchange="window.changeCoordDate(this.value)" style="background: #ffffff; color: var(--text-main); padding: 0.35rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: inherit; font-size: 0.78rem; cursor: pointer; outline: none;">
                    </div>
                    <div style="display: flex; background: #f1f5f9; border-radius: var(--radius-sm); padding: 0.2rem; gap: 0.2rem;">
                        <button class="coord-trend-tab" data-tab="datewise" onclick="window.switchCoordTrendTab('datewise')" style="flex:1; background: #003366; color: #ffffff; border: none; padding: 0.4rem 0.5rem; font-size: 0.75rem; font-weight: 700; border-radius: var(--radius-sm); cursor: pointer;">Datewise</button>
                        <button class="coord-trend-tab" data-tab="weekly" onclick="window.switchCoordTrendTab('weekly')" style="flex:1; background: none; color: var(--text-muted); border: none; padding: 0.4rem 0.5rem; font-size: 0.75rem; font-weight: 700; border-radius: var(--radius-sm); cursor: pointer;">Weekly</button>
                        <button class="coord-trend-tab" data-tab="monthly" onclick="window.switchCoordTrendTab('monthly')" style="flex:1; background: none; color: var(--text-muted); border: none; padding: 0.4rem 0.5rem; font-size: 0.75rem; font-weight: 700; border-radius: var(--radius-sm); cursor: pointer;">Monthly</button>
                    </div>
                    <div id="coord-trend-datewise" style="display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%;">
                        <div style="display: flex; background: #f1f5f9; border-radius: 9999px; padding: 0.2rem; gap: 0.2rem;">
                            <button class="coord-sub-tab" data-parent="datewise" data-sub="combined" onclick="window.switchCoordSubTab('datewise','combined')" style="background: #003366; color: #ffffff; border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Combined</button>
                            <button class="coord-sub-tab" data-parent="datewise" data-sub="subjectwise" onclick="window.switchCoordSubTab('datewise','subjectwise')" style="background: none; color: var(--text-muted); border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Subjectwise</button>
                        </div>
                        <div id="coord-datewise-combined" style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Attendance for <strong>${todayDate}</strong></div>
                            <div class="attendance-3d-card" style="${grandTotal > 0 ? `background: conic-gradient(#003366 0% ${overallPct}%, #d9383a ${overallPct}% 100%);` : ""}">
                                <div class="inner-card">
                                    <h2>${overallPct}%</h2>
                                    <span>Present</span>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: center; gap: 1.5rem; font-size: 0.8rem; font-weight: 700; margin-top: 0.25rem;">
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #003366;"></span>
                                    Present (${grandPresent})
                                </span>
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #d9383a;"></span>
                                    Absent (${grandAbsent})
                                </span>
                            </div>
                        </div>
                        <div id="coord-datewise-subjectwise" style="display: none; width: 100%;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; width: 100%; background: #f8fafc; padding: 0.75rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
                                    Subjectwise breakdown for <strong>${todayDate}</strong>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);">Combined:</span>
                                    <div class="attendance-mini-gauge" style="width: 40px; height: 40px; ${grandTotal > 0 ? `background: conic-gradient(#003366 0% ${overallPct}%, #d9383a ${overallPct}% 100%);` : ""} cursor: default;" title="Combined Today: ${overallPct}%">
                                        <div class="inner-card">
                                            <span style="font-size: 0.6rem; font-weight: 800;">${overallPct}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="width: 100%; max-height: 300px; overflow-y: auto;">
                                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                    <thead><tr style="border-bottom: 2px solid var(--border);">
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Subject</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Type</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Faculty</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; text-align: center;">Gauge</th>
                                    </tr></thead>
                                    <tbody>
                                        ${
                                          datewiseLectureRows.length > 0
                                            ? datewiseLectureRows
                                                .map(
                                                  (lr) =>
                                                    '<tr style="border-bottom: 1px solid rgba(0,0,0,0.04);">' +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.75rem; font-weight: 700; color: #003366;">' +
                                                    "<div>" +
                                                    lr.subjectCode +
                                                    "</div>" +
                                                    '<div style="font-size: 0.6rem; color: var(--text-muted); font-weight: normal; margin-top: 0.1rem;">' +
                                                    lr.subjectName +
                                                    "</div>" +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.typeLabel +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.teachers +
                                                    "</td>" +
                                                    '<td style="padding: 0.25rem 0.25rem; vertical-align: middle;">' +
                                                    '<div style="display: flex; justify-content: center; align-items: center; width: 100%;">' +
                                                    '<div class="attendance-mini-gauge" ' +
                                                    (lr.total > 0
                                                      ? 'style="background: conic-gradient(#003366 0% ' +
                                                        parseFloat(lr.rate) +
                                                        "%, #d9383a " +
                                                        parseFloat(lr.rate) +
                                                        '% 100%);"'
                                                      : "") +
                                                    ' title="Present: ' +
                                                    lr.present +
                                                    " | Absent: " +
                                                    lr.absent +
                                                    " | Total: " +
                                                    lr.total +
                                                    '">' +
                                                    '<div class="inner-card">' +
                                                    "<span>" +
                                                    (lr.total > 0
                                                      ? lr.rate
                                                      : "0%") +
                                                    "</span>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</td>" +
                                                    "</tr>",
                                                )
                                                .join("")
                                            : '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 0.78rem; padding: 2rem;">No lectures found.</td></tr>'
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div id="coord-trend-weekly" style="display: none; flex-direction: column; align-items: center; gap: 1rem; width: 100%;">
                        <div style="display: flex; background: #f1f5f9; border-radius: 9999px; padding: 0.2rem; gap: 0.2rem;">
                            <button class="coord-sub-tab" data-parent="weekly" data-sub="combined" onclick="window.switchCoordSubTab('weekly','combined')" style="background: #003366; color: #ffffff; border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Combined</button>
                            <button class="coord-sub-tab" data-parent="weekly" data-sub="subjectwise" onclick="window.switchCoordSubTab('weekly','subjectwise')" style="background: none; color: var(--text-muted); border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Subjectwise</button>
                        </div>
                        <div id="coord-weekly-combined" style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-align: center;">Weekly: <strong>${weekRange.start}</strong> to <strong>${weekRange.end}</strong></div>
                            <div class="attendance-3d-card" style="${weekTotal > 0 ? `background: conic-gradient(#003366 0% ${weekPct}%, #d9383a ${weekPct}% 100%);` : ""}">
                                <div class="inner-card">
                                    <h2>${weekPct}%</h2>
                                    <span>Weekly</span>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: center; gap: 1.5rem; font-size: 0.8rem; font-weight: 700; margin-top: 0.25rem;">
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #003366;"></span>
                                    Present (${weekPresent})
                                </span>
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #d9383a;"></span>
                                    Absent (${weekAbsent})
                                </span>
                            </div>
                        </div>
                        <div id="coord-weekly-subjectwise" style="display: none; width: 100%;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; width: 100%; background: #f8fafc; padding: 0.75rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
                                    Subjectwise weekly breakdown: <strong>${weekRange.start}</strong> to <strong>${weekRange.end}</strong>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);">Combined:</span>
                                    <div class="attendance-mini-gauge" style="width: 40px; height: 40px; ${weekTotal > 0 ? `background: conic-gradient(#003366 0% ${weekPct}%, #d9383a ${weekPct}% 100%);` : ""} cursor: default;" title="Combined Weekly: ${weekPct}%">
                                        <div class="inner-card">
                                            <span style="font-size: 0.6rem; font-weight: 800;">${weekPct}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="width: 100%; max-height: 300px; overflow-y: auto;">
                                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                    <thead><tr style="border-bottom: 2px solid var(--border);">
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Subject</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Type</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Faculty</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; text-align: center;">Gauge</th>
                                    </tr></thead>
                                    <tbody>
                                        ${
                                          weeklyLectureRows.length > 0
                                            ? weeklyLectureRows
                                                .map(
                                                  (lr) =>
                                                    '<tr style="border-bottom: 1px solid rgba(0,0,0,0.04);">' +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.75rem; font-weight: 700; color: #003366;">' +
                                                    "<div>" +
                                                    lr.subjectCode +
                                                    "</div>" +
                                                    '<div style="font-size: 0.6rem; color: var(--text-muted); font-weight: normal; margin-top: 0.1rem;">' +
                                                    lr.subjectName +
                                                    "</div>" +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.typeLabel +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.teachers +
                                                    "</td>" +
                                                    '<td style="padding: 0.25rem 0.25rem; vertical-align: middle;">' +
                                                    '<div style="display: flex; justify-content: center; align-items: center; width: 100%;">' +
                                                    '<div class="attendance-mini-gauge" ' +
                                                    (lr.total > 0
                                                      ? 'style="background: conic-gradient(#003366 0% ' +
                                                        parseFloat(lr.rate) +
                                                        "%, #d9383a " +
                                                        parseFloat(lr.rate) +
                                                        '% 100%);"'
                                                      : "") +
                                                    ' title="Present: ' +
                                                    lr.present +
                                                    " | Absent: " +
                                                    lr.absent +
                                                    " | Total: " +
                                                    lr.total +
                                                    '">' +
                                                    '<div class="inner-card">' +
                                                    "<span>" +
                                                    (lr.total > 0
                                                      ? lr.rate
                                                      : "0%") +
                                                    "</span>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</td>" +
                                                    "</tr>",
                                                )
                                                .join("")
                                            : '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 0.78rem; padding: 2rem;">No lectures found.</td></tr>'
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div id="coord-trend-monthly" style="display: none; flex-direction: column; align-items: center; gap: 1rem; width: 100%;">
                        <div style="display: flex; background: #f1f5f9; border-radius: 9999px; padding: 0.2rem; gap: 0.2rem;">
                            <button class="coord-sub-tab" data-parent="monthly" data-sub="combined" onclick="window.switchCoordSubTab('monthly','combined')" style="background: #003366; color: #ffffff; border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Combined</button>
                            <button class="coord-sub-tab" data-parent="monthly" data-sub="subjectwise" onclick="window.switchCoordSubTab('monthly','subjectwise')" style="background: none; color: var(--text-muted); border: none; padding: 0.3rem 0.75rem; font-size: 0.72rem; font-weight: 700; border-radius: 9999px; cursor: pointer;">Subjectwise</button>
                        </div>
                        <div id="coord-monthly-combined" style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-align: center;">Monthly: <strong>${new Date(todayDate).toLocaleString("default", { month: "long", year: "numeric" })}</strong></div>
                            <div class="attendance-3d-card" style="${monthTotal > 0 ? `background: conic-gradient(#003366 0% ${monthPct}%, #d9383a ${monthPct}% 100%);` : ""}">
                                <div class="inner-card">
                                    <h2>${monthPct}%</h2>
                                    <span>Monthly</span>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: center; gap: 1.5rem; font-size: 0.8rem; font-weight: 700; margin-top: 0.25rem;">
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #003366;"></span>
                                    Present (${monthPresent})
                                </span>
                                <span style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #d9383a;"></span>
                                    Absent (${monthAbsent})
                                </span>
                            </div>
                        </div>
                        <div id="coord-monthly-subjectwise" style="display: none; width: 100%;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; width: 100%; background: #f8fafc; padding: 0.75rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
                                    Subjectwise monthly breakdown: <strong>${new Date(todayDate).toLocaleString("default", { month: "long", year: "numeric" })}</strong>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);">Combined:</span>
                                    <div class="attendance-mini-gauge" style="width: 40px; height: 40px; ${monthTotal > 0 ? `background: conic-gradient(#003366 0% ${monthPct}%, #d9383a ${monthPct}% 100%);` : ""} cursor: default;" title="Combined Monthly: ${monthPct}%">
                                        <div class="inner-card">
                                            <span style="font-size: 0.6rem; font-weight: 800;">${monthPct}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="width: 100%; max-height: 300px; overflow-y: auto;">
                                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                    <thead><tr style="border-bottom: 2px solid var(--border);">
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Subject</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Type</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Faculty</th>
                                        <th style="padding: 0.5rem 0.25rem; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; text-align: center;">Gauge</th>
                                    </tr></thead>
                                    <tbody>
                                        ${
                                          monthlyLectureRows.length > 0
                                            ? monthlyLectureRows
                                                .map(
                                                  (lr) =>
                                                    '<tr style="border-bottom: 1px solid rgba(0,0,0,0.04);">' +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.75rem; font-weight: 700; color: #003366;">' +
                                                    "<div>" +
                                                    lr.subjectCode +
                                                    "</div>" +
                                                    '<div style="font-size: 0.6rem; color: var(--text-muted); font-weight: normal; margin-top: 0.1rem;">' +
                                                    lr.subjectName +
                                                    "</div>" +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.typeLabel +
                                                    "</td>" +
                                                    '<td style="padding: 0.5rem 0.25rem; font-size: 0.72rem; color: var(--text-muted);">' +
                                                    lr.teachers +
                                                    "</td>" +
                                                    '<td style="padding: 0.25rem 0.25rem; vertical-align: middle;">' +
                                                    '<div style="display: flex; justify-content: center; align-items: center; width: 100%;">' +
                                                    '<div class="attendance-mini-gauge" ' +
                                                    (lr.total > 0
                                                      ? 'style="background: conic-gradient(#003366 0% ' +
                                                        parseFloat(lr.rate) +
                                                        "%, #d9383a " +
                                                        parseFloat(lr.rate) +
                                                        '% 100%);"'
                                                      : "") +
                                                    ' title="Present: ' +
                                                    lr.present +
                                                    " | Absent: " +
                                                    lr.absent +
                                                    " | Total: " +
                                                    lr.total +
                                                    '">' +
                                                    '<div class="inner-card">' +
                                                    "<span>" +
                                                    (lr.total > 0
                                                      ? lr.rate
                                                      : "0%") +
                                                    "</span>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</div>" +
                                                    "</td>" +
                                                    "</tr>",
                                                )
                                                .join("")
                                            : '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 0.78rem; padding: 2rem;">No lectures found.</td></tr>'
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card" style="margin-bottom: 0; padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff; display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin: 0;">Submission Status</h3>
                        <input type="date" value="${todayDate}" onchange="window.changeCoordDate(this.value)" style="background: #ffffff; color: var(--text-main); padding: 0.25rem 0.4rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: inherit; font-size: 0.75rem; cursor: pointer; outline: none;">
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; min-height: 250px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;" class="dashboard-faculty-table">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <th style="padding: 0.5rem 0.25rem; font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Faculty</th>
                                    <th style="padding: 0.5rem 0.25rem; font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${
                                  lectureStats.length > 0
                                    ? lectureStats
                                        .map(
                                          (ls, idx) => `
                                    <tr style="border-bottom: 1px solid rgba(0,0,0,0.03);">
                                        <td style="padding: 0.75rem 0.25rem; vertical-align: middle;">
                                            <div style="font-weight: 700; font-size: 0.85rem; color: var(--primary); margin-bottom: 0.15rem;">Lecture ${idx + 1} (${ls.typeLabel})</div>
                                            ${ls.isSubmitted ? `
                                                <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-main);">${ls.teachers || "Not Assigned"}</div>
                                                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.05rem;">
                                                    <span style="font-weight: 600; color: var(--text-muted);">${ls.subjectCode} - ${ls.subjectName}</span> · ${ls.slot}
                                                </div>
                                            ` : `
                                                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.05rem;">
                                                    Time Slot · ${ls.slot}
                                                </div>
                                            `}
                                        </td>
                                        <td style="padding: 0.75rem 0.25rem; vertical-align: middle;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span class="status-badge ${ls.isSubmitted ? "submitted" : "pending"}">${ls.isSubmitted ? "Submitted" : "Pending"}</span>
                                                ${
                                                  ls.isSubmitted
                                                    ? `
                                                    <div style="width: 16px; height: 16px; flex-shrink: 0;">
                                                        <canvas id="coord-detail-pie-${idx}" width="16" height="16"></canvas>
                                                    </div>
                                                `
                                                    : ""
                                                }
                                            </div>
                                        </td>
                                    </tr>
                                    `,
                                        )
                                        .join("")
                                    : `
                                    <tr>
                                        <td colspan="2" style="text-align: center; color: var(--text-muted); font-size: 0.78rem; padding: 2rem 0;">No lectures conducted.</td>
                                    </tr>
                                `
                                }
                            </tbody>
                        </table>
                    </div>

                    <button onclick="if(currentState.coordAttendanceFilters) { currentState.coordAttendanceFilters.date = window._selectedCoordDateStr || ''; } window.switchView('coordEditAttendance')" style="width: 100%; border: 1px solid var(--border); background: #ffffff; color: var(--primary); font-size: 0.78rem; font-weight: 700; padding: 0.5rem; border-radius: var(--radius-sm); cursor: pointer; text-align: center; outline: none; margin-top: auto;">
                        View All Submissions
                    </button>
                </div>
            </div>
            <div class="card" style="margin-top: 1.5rem; padding: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: #ffffff;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 1rem; margin-top: 0;">
                    MST Marks & Underperforming Students (${coordClassLabel})
                </h3>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
                    <button class="btn-primary" onclick="window.switchCoordMstTab('mst-1')" id="coord-mst-btn-mst-1" style="padding: 0.4rem 1rem; background: #003366; font-size: 0.8rem; border-radius: var(--radius-sm);">MST-1</button>
                    <button class="btn-primary" onclick="window.switchCoordMstTab('mst-2')" id="coord-mst-btn-mst-2" style="padding: 0.4rem 1rem; background: none; color: var(--text-muted); border: 1px solid var(--border); box-shadow: none; font-size: 0.8rem; border-radius: var(--radius-sm);">MST-2</button>
                </div>
                
                <div id="coord-mst-content-area"></div>
            </div>
        </div>
    `;

  lucide.createIcons();
  window._coordLectureStats = lectureStats;
  setTimeout(window.init3DTilt, 100);
  setTimeout(() => window.switchCoordMstTab("mst-1"), 200);
  if (window.coordTimeBadgeInterval)
    clearInterval(window.coordTimeBadgeInterval);
  window.coordTimeBadgeInterval = setInterval(() => {
    const timeBadge = document.getElementById("coord-live-time-badge");
    if (timeBadge) {
      timeBadge.textContent = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }, 1000);
  setTimeout(() => {
    lectureStats.forEach((ls, idx) => {
      if (!ls.isSubmitted) return;
      const canvas = document.getElementById(`coord-detail-pie-${idx}`);
      if (!canvas || typeof Chart === "undefined") return;
      new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
          datasets: [
            {
              data: [ls.present, ls.absent],
              backgroundColor: ["#003366", "#d9383a"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          cutout: "40%",
        },
      });
    });
  }, 200);
}

window.showLectureStudentList = (idx, type) => {
  const ls = window._coordLectureStats?.[idx];
  if (!ls) return;
  const isPresent = type === "present";
  const title = isPresent ? "Present Students" : "Absent Students";

  const filtered = (ls.allRecords || []).filter((r) => {
    const isRecPresent = r.status.toLowerCase() === "present";
    return isPresent ? isRecPresent : !isRecPresent;
  });

  filtered.sort((a, b) =>
    compareRollNumbers(a.students?.roll_no || "", b.students?.roll_no || ""),
  );

  showModal(
    `${title} — ${ls.subjectName}`,
    `
        <div style="max-height:400px;overflow-y:auto;padding:0.5rem 0;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:0.75rem;">Roll No</th>
                        <th style="text-align:left;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:0.75rem;">Name</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      filtered.length === 0
                        ? `
                        <tr>
                            <td colspan="2" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem;">No students in this list</td>
                        </tr>
                    `
                        : filtered
                            .map(
                              (r) => `
                        <tr>
                            <td style="padding:0.5rem;border-bottom:1px solid var(--border);font-size:0.85rem;color:var(--text-normal);font-weight:600;">${r.students?.roll_no || "—"}</td>
                            <td style="padding:0.5rem;border-bottom:1px solid var(--border);font-size:0.85rem;color:var(--text-normal);">${r.students?.name || "—"}</td>
                        </tr>
                    `,
                            )
                            .join("")
                    }
                </tbody>
            </table>
        </div>
    `,
    null,
    { hideConfirm: true, cancelText: "Close" },
  );
};

window.editLectureAttendance = (idx) => {
  const ls = window._coordLectureStats?.[idx];
  if (!ls || !ls.allRecords || ls.allRecords.length === 0) {
    showToast("No attendance records to edit", "error");
    return;
  }
  ls.allRecords.sort((a, b) =>
    compareRollNumbers(a.students?.roll_no || "", b.students?.roll_no || ""),
  );
  showModal(
    `Edit Attendance — ${ls.subjectName} (${ls.slot})`,
    `
        <p style="color:var(--text-muted);margin-bottom:1rem;font-size:0.85rem;">${ls.classInfo} · Click to toggle status</p>
        <div style="max-height:420px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;" id="edit-att-modal-table">
                <thead><tr>
                    <th style="text-align:left;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:0.78rem;">Roll No</th>
                    <th style="text-align:left;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:0.78rem;">Name</th>
                    <th style="text-align:center;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:0.78rem;">Status</th>
                </tr></thead>
                <tbody>
                    ${ls.allRecords
                      .map(
                        (r) => `
                        <tr id="edit-att-row-${r.id}">
                            <td style="padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);font-size:0.82rem;">${r.students?.roll_no || "—"}</td>
                            <td style="padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);font-size:0.82rem;">${r.students?.name || "—"}</td>
                            <td style="padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);text-align:center;">
                                <button onclick="window.toggleModalAttendance('${r.id}','${r.status}')" id="toggle-btn-${r.id}"
                                    style="padding:0.3rem 0.75rem;border-radius:1rem;font-size:0.75rem;font-weight:700;cursor:pointer;border:none;
                                    background:${r.status === "Present" ? "rgba(45,212,191,0.2)" : "rgba(239,68,68,0.2)"};
                                    color:${r.status === "Present" ? "var(--accent)" : "var(--error)"};">
                                    ${r.status}
                                </button>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `,
    () => {
      closeModal();
      window.switchView("coordDashboard");
    },
    { confirmText: "Done", cancelText: "Cancel" },
  );
};

window.toggleModalAttendance = async (id, currentStatus) => {
  const newStatus = currentStatus === "Present" ? "Absent" : "Present";
  const btn = document.getElementById(`toggle-btn-${id}`);
  if (btn) {
    btn.textContent = "...";
    btn.disabled = true;
  }
  const { error } = await supabaseClient
    .from("attendance_records")
    .update({ status: newStatus })
    .eq("id", id);
  if (error) {
    showToast(error.message, "error");
    if (btn) {
      btn.textContent = currentStatus;
      btn.disabled = false;
    }
  } else {
    if (btn) {
      btn.textContent = newStatus;
      btn.style.background =
        newStatus === "Present"
          ? "rgba(45,212,191,0.2)"
          : "rgba(239,68,68,0.2)";
      btn.style.color =
        newStatus === "Present" ? "var(--accent)" : "var(--error)";
      btn.setAttribute(
        "onclick",
        `window.toggleModalAttendance('${id}','${newStatus}')`,
      );
      btn.disabled = false;
    }
    const ls_arr = window._coordLectureStats || [];
    ls_arr.forEach((ls) => {
      const rec = (ls.allRecords || []).find((r) => r.id === id);
      if (rec) {
        rec.status = newStatus;
      }
    });
  }
};

window.showPresentStudents = (idx) =>
  window.showLectureStudentList(idx, "present");

async function renderCoordAllStudents(container) {
  const teacher = currentState.teacherData;
  const coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;

  if (!coordClass) {
    container.innerHTML = `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
                ⚠️ You are not designated as a coordinator for any class section. Please contact the Admin.
            </div>
        `;
    return;
  }

  const { data: allStudents } = await supabaseClient
    .from("students")
    .select("*")
    .eq("branch", coordClass.branch)
    .eq("year", coordClass.year)
    .eq("section", coordClass.section);

  const { data: allRecords } = await supabaseClient
    .from("attendance_records")
    .select("*, subjects(name, code), classes(branch, year, section)")
    .eq("class_id", coordClass.id)
    .order("date", { ascending: false });

  const records = allRecords || [];
  const students = allStudents || [];
  const studentMap = {};
  students.forEach((s) => {
    studentMap[s.id] = { ...s, records: [] };
  });
  records.forEach((r) => {
    if (studentMap[r.student_id]) studentMap[r.student_id].records.push(r);
  });

  const sortedStudents = Object.values(studentMap).sort((a, b) =>
    compareRollNumbers(a.roll_no || "", b.roll_no || ""),
  );

  window._coordAllStudentsData = sortedStudents;

  container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
            <h1 style="margin:0;">All Students Attendance</h1>
            <button class="btn-secondary" onclick="window.switchView('coordDashboard')" style="padding:0.5rem 1rem; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Return to Dashboard
            </button>
        </div>
        <div class="card">
            <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center;">
                <div style="flex:1;min-width:200px;">
                    <input type="text" id="coord-student-search" placeholder="Search by name or roll no..." oninput="window.filterCoordStudents()" style="width:100%;margin:0;">
                </div>
                <div>
                    <select id="coord-student-batch-filter" onchange="window.filterCoordStudents()" style="padding: 0.65rem 1.75rem 0.65rem 1rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.88rem; font-family: inherit; font-weight: 600; outline: none; cursor: pointer; height: auto;">
                        <option value="All">All Batches</option>
                        <option value="B1">Batch B1</option>
                        <option value="B2">Batch B2</option>
                    </select>
                </div>
            </div>
            <div class="table-container">
                <table id="coord-students-table">
                    <thead><tr>
                        <th>Roll No</th><th>Name</th><th>Branch/Year/Sec</th><th>Batch</th><th>Total</th><th>Present</th><th>%</th><th>Details</th>
                    </tr></thead>
                    <tbody>
                        ${sortedStudents
                          .map((s, idx) => {
                            const extraAtt = s.extra_attendance || {};
                            let totalExtraConducted = 0;
                            let totalExtraPresent = 0;
                            Object.values(extraAtt).forEach((val) => {
                              totalExtraConducted += val.total || 0;
                              totalExtraPresent += val.present || 0;
                            });
                            const total = s.records.length;
                            const present = Math.min(
                              total,
                              s.records.filter((r) => r.status === "Present")
                                .length + totalExtraPresent,
                            );
                            const pct =
                              total > 0
                                ? ((present / total) * 100).toFixed(1)
                                : "0.0";
                            const hasExtra = totalExtraConducted > 0;
                            const hasAchievements =
                              s.achievements && s.achievements.length > 0;
                            return `
                            <tr data-search="${(s.name + " " + s.roll_no).toLowerCase()}" data-batch="${s.batch || "B1"}">
                                <td style="font-size:0.82rem;">${s.roll_no}</td>
                                <td style="font-size:0.85rem;font-weight:600;">
                                    <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                                        <span>${s.name}</span>
                                        ${hasExtra ? `<span style="background:linear-gradient(135deg, rgba(51,54,130,0.12), rgba(45,212,191,0.12));color:var(--primary);padding:0.15rem 0.45rem;border-radius:1rem;font-size:0.65rem;font-weight:700;border:1px solid rgba(51,54,130,0.2);white-space:nowrap;" title="Extra ${totalExtraPresent}/${totalExtraConducted} added by coordinator">✨ +${totalExtraPresent} Extra</span>` : ""}
                                        ${hasAchievements ? `<span style="background:rgba(16,185,129,0.08);color:#10b981;padding:0.15rem 0.45rem;border-radius:1rem;font-size:0.65rem;font-weight:700;border:1px solid rgba(16,185,129,0.2);white-space:nowrap;" title="${s.achievements.map((a) => `${a.type}: ${a.name}`).join("\n")}">🏆 ${s.achievements.length} Achievement${s.achievements.length > 1 ? "s" : ""}</span>` : ""}
                                    </div>
                                </td>
                                <td><span style="font-size:0.75rem;">${s.branch} ${s.year} · Sec ${s.section}</span></td>
                                <td><span style="background:rgba(45,212,191,0.1);color:var(--accent);padding:0.2rem 0.5rem;border-radius:1rem;font-size:0.75rem;">${s.batch || "B1"}</span></td>
                                <td>${total}</td>
                                <td style="color:var(--accent);font-weight:700;">${present}</td>
                                <td><span style="color:${parseFloat(pct) >= 75 ? "var(--accent)" : "var(--error)"};font-weight:700;">${pct}%</span></td>
                                <td>
                                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                                        <button onclick="window.viewStudentDetail('${s.id}')" style="background:var(--glass);border:1px solid var(--border);border-radius:0.5rem;color:var(--primary);padding:0.3rem 0.6rem;font-size:0.75rem;cursor:pointer;">View</button>
                                        <button onclick="window.showEditExtraAttendanceModal('${s.id}')" style="background:rgba(79, 70, 229, 0.08);border:1px solid rgba(79, 70, 229, 0.2);border-radius:0.5rem;color:var(--primary);padding:0.3rem 0.6rem;font-size:0.75rem;cursor:pointer;">${hasExtra ? "✏️ Extra" : "+ Extra"}</button>
                                        <button onclick="window.showAchievementsModal('${s.id}')" style="background:rgba(16, 185, 129, 0.08);border:1px solid rgba(16, 185, 129, 0.2);border-radius:0.5rem;color:#10b981;padding:0.3rem 0.6rem;font-size:0.75rem;cursor:pointer;font-weight:600;">🏆 Achievement</button>
                                    </div>
                                </td>
                            </tr>`;
                          })
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
  lucide.createIcons();
  setTimeout(window.init3DTilt, 100);
}

window.filterCoordStudents = () => {
  const q = (
    document.getElementById("coord-student-search")?.value || ""
  ).toLowerCase();
  const batchFilter =
    document.getElementById("coord-student-batch-filter")?.value || "All";
  document.querySelectorAll("#coord-students-table tbody tr").forEach((row) => {
    const s = row.getAttribute("data-search") || "";
    const b = row.getAttribute("data-batch") || "B1";
    const matchesQuery = s.includes(q);
    const matchesBatch = batchFilter === "All" || b === batchFilter;
    row.style.display = matchesQuery && matchesBatch ? "" : "none";
  });
};

window.viewStudentDetail = (studentId) => {
  const s = window._coordAllStudentsData?.find((st) => st.id === studentId);
  if (!s) return;

  const extraAtt = s.extra_attendance || {};
  let totalExtraConducted = 0;
  let totalExtraPresent = 0;
  Object.values(extraAtt).forEach((val) => {
    totalExtraConducted += val.total || 0;
    totalExtraPresent += val.present || 0;
  });

  const total = s.records.length;
  const present = Math.min(
    total,
    s.records.filter((r) => r.status === "Present").length + totalExtraPresent,
  );
  const pct = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";
  const byDate = {};
  s.records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  showModal(
    `${s.name} — Attendance Detail & Profile`,
    `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; background: var(--bg-dark); font-size: 0.8rem; line-height: 1.5;">
            <div>
                <strong style="color:var(--primary); display:block; margin-bottom: 0.4rem; font-size: 0.85rem;">Student Details</strong>
                <div><strong>Roll No:</strong> ${s.roll_no}</div>
                <div><strong>Branch/Year:</strong> ${s.branch} ${s.year} &middot; Sec ${s.section}</div>
                <div><strong>Lab Batch:</strong> ${s.batch || "B1"}</div>
                <div><strong>Email:</strong> ${s.email || "—"}</div>
                <div><strong>Phone:</strong> ${s.phone || "—"}</div>
            </div>
            <div>
                <strong style="color:var(--primary); display:block; margin-bottom: 0.4rem; font-size: 0.85rem;">Guardian Details</strong>
                <div><strong>Father's Name:</strong> ${s.father_name || "—"}</div>
                <div><strong>Father's Phone:</strong> ${s.father_phone || "—"}</div>
                <div><strong>Mother's Name:</strong> ${s.mother_name || "—"}</div>
            </div>
            <div>
                <strong style="color:var(--primary); display:block; margin-bottom: 0.4rem; font-size: 0.85rem;">Academic Details</strong>
                <div><strong>Class 10:</strong> ${s.class_10_board || "—"} (${s.class_10_percent ? s.class_10_percent + "%" : "—"})</div>
                <div><strong>Class 12:</strong> ${s.class_12_board || "—"} (${s.class_12_percent ? s.class_12_percent + "%" : "—"})</div>
                <div><strong>Diploma:</strong> ${s.diploma_percent ? s.diploma_percent + "%" : "—"}</div>
                <div><strong>CGPA:</strong> ${s.current_cgpa || "—"}</div>
                <div><strong>Backlogs:</strong> ${s.active_backlogs || 0} active, ${s.history_backlogs || 0} history</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.25rem;background:rgba(99,102,241,0.05);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;">
            <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--accent);">${present}</div><div style="font-size:0.7rem;color:var(--text-muted);">Present</div></div>
            <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--error);">${total - present}</div><div style="font-size:0.7rem;color:var(--text-muted);">Absent</div></div>
            <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:${parseFloat(pct) >= 75 ? "var(--accent)" : "var(--error)"};">${pct}%</div><div style="font-size:0.7rem;color:var(--text-muted);">Overall (incl. Extra)</div></div>
        </div>
        
        ${
          totalExtraConducted > 0
            ? `
        <div style="margin-bottom:1.25rem; padding:0.75rem 1rem; border: 1px dashed var(--accent); border-radius: 0.5rem; background: rgba(13, 148, 136, 0.04); font-size: 0.8rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="color:var(--accent);">✨ Extra Attendance (Included in Overall)</strong>
                <button onclick="window.showEditExtraAttendanceModal('${studentId}')" style="background:rgba(79,70,229,0.08);border:1px solid rgba(79,70,229,0.2);border-radius:0.4rem;color:var(--primary);padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer;font-weight:600;">✏️ Edit</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.5rem;font-size:0.8rem;">
                <div style="padding:0.5rem;background:var(--bg-dark);border-radius:0.4rem;text-align:center;">
                    <div style="font-weight:700;color:var(--text-muted);font-size:0.68rem;margin-bottom:0.2rem;">Regular Attendance</div>
                    <span style="font-weight:700;color:var(--accent);">${s.records.filter((r) => r.status === "Present").length}</span> / <span style="font-weight:600;">${s.records.length}</span>
                </div>
                <div style="padding:0.5rem;background:var(--bg-dark);border-radius:0.4rem;text-align:center;">
                    <div style="font-weight:700;color:var(--text-muted);font-size:0.68rem;margin-bottom:0.2rem;">Extra (by Coordinator)</div>
                    <span style="font-weight:700;color:var(--primary);">${totalExtraPresent}</span> / <span style="font-weight:600;">${totalExtraConducted}</span>
                </div>
            </div>
        </div>`
            : `
        <div style="margin-bottom:1.25rem; padding:0.5rem 1rem; border: 1px dashed var(--border); border-radius: 0.5rem; background: var(--bg-dark); font-size: 0.8rem; display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted); font-size:0.78rem;">No extra attendance added</span>
            <button onclick="window.showEditExtraAttendanceModal('${studentId}')" style="background:rgba(79,70,229,0.08);border:1px solid rgba(79,70,229,0.2);border-radius:0.4rem;color:var(--primary);padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer;font-weight:600;">+ Add Extra</button>
        </div>`
        }
        <div style="margin-bottom:1.25rem; padding:0.75rem 1rem; border: 1px dashed #10b981; border-radius: 0.5rem; background: rgba(16, 185, 129, 0.04); font-size: 0.8rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="color:#10b981; display:flex; align-items:center; gap:0.25rem;">🏆 Achievements</strong>
                <button onclick="window.showAchievementsModal('${studentId}')" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:0.4rem;color:#10b981;padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer;font-weight:600;">✏️ Edit</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
                ${
                  s.achievements && s.achievements.length > 0
                    ? s.achievements
                        .map(
                          (a) => `
                    <div style="display:flex; align-items:center; gap:0.5rem; background:var(--bg-dark); padding:0.4rem 0.6rem; border-radius:0.4rem; border: 1px solid var(--border);">
                        <span style="background:rgba(16,185,129,0.12); color:#10b981; padding:0.15rem 0.45rem; border-radius:0.25rem; font-size:0.68rem; font-weight:700; text-transform:uppercase; display:inline-block;">${a.type}</span>
                        <span style="font-weight:600; color:var(--text-main); font-size:0.78rem;">${a.name}</span>
                    </div>
                `,
                        )
                        .join("")
                    : '<span style="color:var(--text-muted); font-style:italic; font-size:0.78rem;">No achievements recorded yet.</span>'
                }
            </div>
        </div>

        <div style="max-height:380px;overflow-y:auto;" id="student-detail-table-wrap">
            ${dates
              .map(
                (date) => `
                <div class="student-detail-date-group" data-date="${date}">
                    <div style="font-weight:700;font-size:0.82rem;color:var(--primary);padding:0.4rem 0;border-bottom:1px solid var(--border);margin-bottom:0.25rem;">${date}</div>
                    ${byDate[date]
                      .map(
                        (r) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.35rem 0.25rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                            <div>
                                <span style="font-size:0.83rem;font-weight:600;">${r.subjects?.name || "—"}</span>
                                <span style="font-size:0.72rem;color:var(--text-muted);margin-left:0.5rem;">${r.subjects?.code || ""}</span>
                            </div>
                            <span style="padding:0.2rem 0.6rem;border-radius:1rem;font-size:0.75rem;font-weight:700;background:${r.status === "Present" ? "rgba(45,212,191,0.15)" : "rgba(239,68,68,0.15)"};color:${r.status === "Present" ? "var(--accent)" : "var(--error)"};">
                                ${r.status}
                            </span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            `,
              )
              .join("")}
        </div>
    `,
    () => closeModal(),
    { hideConfirm: true, cancelText: "Close", isWide: true },
  );
};

window.filterStudentDetailByDate = (studentId) => {
  const dateVal = document.getElementById("student-detail-date")?.value || "";
  document.querySelectorAll(".student-detail-date-group").forEach((group) => {
    const gDate = group.getAttribute("data-date");
    group.style.display = !dateVal || gDate === dateVal ? "" : "none";
  });
};

window.showAchievementsModal = (studentId) => {
  let s = window._coordAllStudentsData?.find((st) => st.id === studentId);
  if (!s) {
    s = currentState.students.find((st) => st.id === studentId);
  }
  if (!s) return;

  window._tempAchievements = [...(s.achievements || [])];

  const renderTempList = () => {
    const listContainer = document.getElementById("achievements-temp-list");
    if (!listContainer) return;

    if (window._tempAchievements.length === 0) {
      listContainer.innerHTML = `<span style="color:var(--text-muted); font-style:italic; font-size:0.82rem;">No achievements added yet.</span>`;
      return;
    }

    listContainer.innerHTML = window._tempAchievements
      .map(
        (a, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-dark); padding:0.5rem 0.75rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.4rem;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="background:rgba(16, 185, 129, 0.12); color:#10b981; padding:0.15rem 0.45rem; border-radius:0.25rem; font-size:0.68rem; font-weight:700; text-transform:uppercase;">${a.type}</span>
                    <span style="font-weight:600; font-size:0.83rem;">${a.name}</span>
                </div>
                <button onclick="window.removeTempAchievement(${idx})" style="background:none; border:none; color:var(--error); font-size:1.1rem; cursor:pointer; padding:0.2rem; display:flex; align-items:center; justify-content:center;">&times;</button>
            </div>
        `,
      )
      .join("");
  };

  window.removeTempAchievement = (idx) => {
    window._tempAchievements.splice(idx, 1);
    renderTempList();
  };

  window.addTempAchievement = () => {
    const typeSelect = document.getElementById("achievement-type-select");
    const nameInput = document.getElementById("achievement-name-input");
    if (!typeSelect || !nameInput) return;

    const type = typeSelect.value;
    const name = nameInput.value.trim();

    if (!type) {
      showToast("Please select an achievement type", "error");
      return;
    }
    if (!name) {
      showToast("Please enter the name/details manually", "error");
      return;
    }

    window._tempAchievements.push({ type, name });
    nameInput.value = "";
    renderTempList();
  };

  showModal(
    `Achievements — ${s.name}`,
    `
        <div style="margin-bottom:1.25rem;">
            <label style="font-weight:700; margin-bottom:0.5rem; display:block;">Current Achievements</label>
            <div id="achievements-temp-list" style="max-height:160px; overflow-y:auto; padding:0.5rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(0,0,0,0.01);">
            </div>
        </div>
        
        <div style="border-top:1px solid var(--border); padding-top:1rem; margin-top:1rem;">
            <label style="font-weight:700; margin-bottom:0.5rem; display:block; color:#10b981;">🏆 Add New Achievement</label>
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-size:0.78rem;">Achievement Type</label>
                    <select id="achievement-type-select" style="padding:0.5rem;" onchange="window.updateAchievementPlaceholder(this.value)">
                        <option value="">-- Select Type --</option>
                        <option value="Internship">Internship</option>
                        <option value="Hackathon">Hackathon</option>
                        <option value="Sports">Sports</option>
                        <option value="Certifications">Certifications</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-size:0.78rem;" id="achievement-name-label">Details / Name</label>
                    <input type="text" id="achievement-name-input" placeholder="e.g. Google Web Development Certification, Basketball Runner Up, etc." style="padding:0.65rem; border-radius:0.5rem;">
                </div>
                <button type="button" class="btn-primary" onclick="window.addTempAchievement()" style="background:#10b981; border:none; padding:0.5rem 1rem; align-self:flex-end; font-size:0.82rem; margin-top:0.25rem; font-weight:700; box-shadow:none;">+ Add to List</button>
            </div>
        </div>
    `,
    async () => {
      const updatedAchievements = window._tempAchievements;
      const saveBtn = document.querySelector(".modal-overlay .btn-primary");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }

      const { error } = await supabaseClient
        .from("students")
        .update({ achievements: updatedAchievements })
        .eq("id", studentId);

      if (error) {
        showToast(error.message, "error");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
      } else {
        if (window._coordAllStudentsData) {
          const target = window._coordAllStudentsData.find(
            (st) => st.id === studentId,
          );
          if (target) target.achievements = updatedAchievements;
        }
        const globalTarget = currentState.students.find(
          (st) => st.id === studentId,
        );
        if (globalTarget) globalTarget.achievements = updatedAchievements;

        showToast("Achievements updated successfully!");
        closeModal();
        if (currentState.view === "coordAllStudents") {
          const container = document.getElementById("main-content");
          if (container) renderCoordAllStudents(container);
        }
      }
    },
  );

  renderTempList();

  window.updateAchievementPlaceholder = (val) => {
    const label = document.getElementById("achievement-name-label");
    const input = document.getElementById("achievement-name-input");
    if (!label || !input) return;

    if (val === "Sports") {
      label.textContent = "Sport Name";
      input.placeholder =
        "e.g. Basketball National Tournament, Cricket Captain";
    } else if (val === "Internship") {
      label.textContent = "Internship Details";
      input.placeholder = "e.g. Amazon Software Engineer Intern (3 Months)";
    } else if (val === "Hackathon") {
      label.textContent = "Hackathon Details";
      input.placeholder = "e.g. Smart India Hackathon 2026 Winner";
    } else if (val === "Certifications") {
      label.textContent = "Certification Name";
      input.placeholder = "e.g. AWS Certified Solutions Architect";
    } else {
      label.textContent = "Details / Name";
      input.placeholder = "e.g. Details of achievement...";
    }
  };
};

window.showAddExtraAttendanceModal = (studentId) => {
  window.showEditExtraAttendanceModal(studentId);
};

window.showEditExtraAttendanceModal = (studentId) => {
  const s = window._coordAllStudentsData?.find((st) => st.id === studentId);
  if (!s) return;

  const existingExtra = s.extra_attendance || {};
  const currentExtraPresent = existingExtra.general?.present || 0;
  const currentExtraTotal = existingExtra.general?.total || 0;

  showModal(
    `Edit Extra Attendance — ${s.name}`,
    `
        ${
          currentExtraTotal > 0
            ? `
        <div style="margin-bottom:1.25rem; padding:0.75rem 1rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-dark); font-size:0.8rem; line-height:1.5;">
            <strong style="color:var(--primary); display:block; margin-bottom:0.3rem;">Current Extra Attendance</strong>
            <div>Extra <strong style="color:var(--accent);">${currentExtraTotal}</strong> lectures added</div>
        </div>`
            : ""
        }
        <div class="form-group" style="margin-bottom:1.25rem;">
            <label>Extra Lectures</label>
            <input type="number" id="extra-edit-lectures" min="0" value="${currentExtraTotal}" style="width:100%; padding:0.65rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main);">
        </div>
        ${
          currentExtraTotal > 0
            ? `
        <div style="margin-bottom:1rem;">
            <button onclick="document.getElementById('extra-edit-lectures').value=0;" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:0.5rem;color:var(--error);padding:0.4rem 0.8rem;font-size:0.78rem;cursor:pointer;font-weight:600;">🗑️ Remove All Extra Attendance</button>
        </div>`
            : ""
        }
        <p style="font-size:0.75rem; color:var(--text-muted); line-height:1.45; margin:0;">
            * Each extra lecture covers 1 absence — it adds to present count without increasing total lectures. Set to 0 to remove.
        </p>
    `,
    async () => {
      const count =
        parseInt(document.getElementById("extra-edit-lectures").value) || 0;

      if (count < 0) {
        showToast("Value cannot be negative", "error");
        return;
      }

      const updatedExtra = { ...(s.extra_attendance || {}) };
      if (count === 0) {
        delete updatedExtra.general;
      } else {
        updatedExtra.general = {
          present: count,
          total: count,
        };
      }
      const finalExtra =
        Object.keys(updatedExtra).length === 0 ? {} : updatedExtra;

      const { error } = await supabaseClient
        .from("students")
        .update({ extra_attendance: finalExtra })
        .eq("id", studentId);

      if (error) {
        showToast(error.message, "error");
      } else {
        const action = count === 0 ? "Removed" : "Updated";
        showToast(`${action} extra attendance for ${s.name}!`);
        closeModal();
        await loadAllData();
        const container = document.getElementById("main-content");
        if (container) {
          renderCoordAllStudents(container);
        }
      }
    },
    { confirmText: "Save Extra Attendance", cancelText: "Cancel" },
  );
};

async function renderCoordStudentRequests(container) {
  const teacher = currentState.teacherData;
  const coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;

  if (!coordClass) {
    container.innerHTML = `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
                ⚠️ You are not designated as a coordinator for any class section. Please contact the Admin.
            </div>
        `;
    return;
  }

  // Fetch students of coordinated class
  const { data: classStudents } = await supabaseClient
    .from("students")
    .select("id, name, roll_no")
    .eq("branch", coordClass.branch)
    .eq("year", coordClass.year)
    .eq("section", coordClass.section);

  const studentIds = (classStudents || []).map((s) => s.id);

  if (studentIds.length === 0) {
    container.innerHTML = `
        <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
            No students found in your coordinated class (${coordClass.branch} ${coordClass.year} Sec ${coordClass.section}).
        </div>
    `;
    return;
  }

  // Fetch updates
  const { data: updates, error } = await supabaseClient
    .from("student_updates")
    .select("*, students(name, roll_no)")
    .in("student_id", studentIds)
    .order("requested_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  currentState.coordRequestsTab = currentState.coordRequestsTab || "pending";
  const activeTab = currentState.coordRequestsTab;

  const pendingRequests = (updates || []).filter(r => r.status === "Pending");
  const historyRequests = (updates || []).filter(r => r.status !== "Pending");

  const displayRequests = activeTab === "pending" ? pendingRequests : historyRequests;

  container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
            <div>
                <h1 style="margin:0;">Student Profile Update Requests</h1>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.15rem 0 0 0;">
                    Review profile updates requested by students of class ${coordClass.branch} ${coordClass.year} Sec ${coordClass.section}.
                </p>
            </div>
            <button class="btn-secondary" onclick="window.switchView('coordDashboard')" style="padding:0.5rem 1rem; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Return to Dashboard
            </button>
        </div>

        <div style="display: flex; background: #f1f5f9; border-radius: var(--radius-sm); padding: 0.2rem; gap: 0.2rem; margin-bottom:1.5rem; max-width: 400px;">
            <button class="coord-req-tab" data-tab="pending" onclick="window.switchCoordRequestsTab('pending')" style="flex:1; background: ${activeTab === "pending" ? "#003366" : "none"}; color: ${activeTab === "pending" ? "#ffffff" : "var(--text-muted)"}; border: none; padding: 0.5rem; font-size: 0.8rem; font-weight: 700; border-radius: var(--radius-sm); cursor: pointer;">
                Pending (${pendingRequests.length})
            </button>
            <button class="coord-req-tab" data-tab="history" onclick="window.switchCoordRequestsTab('history')" style="flex:1; background: ${activeTab === "history" ? "#003366" : "none"}; color: ${activeTab === "history" ? "#ffffff" : "var(--text-muted)"}; border: none; padding: 0.5rem; font-size: 0.8rem; font-weight: 700; border-radius: var(--radius-sm); cursor: pointer;">
                History (${historyRequests.length})
            </button>
        </div>

        <div class="card" style="padding:0; border-radius:1rem; overflow:hidden; border: 1px solid var(--border); background:#ffffff;">
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid var(--border); color:var(--text-muted); font-weight:700;">
                            <th style="padding:1rem;">Student Details</th>
                            <th style="padding:1rem;">Field</th>
                            <th style="padding:1rem;">Proposed Changes (Only Modified Shown)</th>
                            <th style="padding:1rem;">Date Requested</th>
                            ${activeTab === "history" ? `<th style="padding:1rem;">Status / Reviewer</th>` : `<th style="padding:1rem; text-align:right;">Actions</th>`}
                        </tr>
                    </thead>
                    <tbody>
                        ${displayRequests.length === 0 ? `
                            <tr>
                                <td colspan="5" style="text-align:center; padding:4rem; color:var(--text-muted); font-style:italic;">
                                    No requests found in this tab.
                                </td>
                            </tr>
                        ` : displayRequests.map(req => {
                            const name = req.students?.name || "Unknown Student";
                            const rollNo = req.students?.roll_no || "N/A";
                            const field = req.field_name || "N/A";
                            const reqDate = new Date(req.requested_at).toLocaleDateString("en-US", {
                                year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            });

                            let changeHtml = "";
                            if (field === "profile_update") {
                                const oldVal = req.old_value || {};
                                const newVal = req.new_value || {};
                                
                                const changedFields = [];
                                const fieldLabels = {
                                  gender: "Gender",
                                  caste: "Caste",
                                  email: "Email",
                                  phone: "Phone",
                                  father_name: "Father's Name",
                                  mother_name: "Mother's Name",
                                  father_phone: "Father's Phone",
                                  class_10_board: "10th Board",
                                  class_10_percent: "10th %",
                                  class_12_board: "12th Board",
                                  class_12_percent: "12th %",
                                  diploma_percent: "Diploma %",
                                  current_cgpa: "CGPA"
                                };

                                Object.keys(fieldLabels).forEach(k => {
                                  const o = oldVal[k] !== null && oldVal[k] !== undefined ? String(oldVal[k]).trim() : "";
                                  const n = newVal[k] !== null && newVal[k] !== undefined ? String(newVal[k]).trim() : "";
                                  if (o !== n) {
                                    changedFields.push({
                                      label: fieldLabels[k],
                                      old: oldVal[k] !== null && oldVal[k] !== undefined && oldVal[k] !== "" ? oldVal[k] : "None",
                                      new: newVal[k] !== null && newVal[k] !== undefined && newVal[k] !== "" ? newVal[k] : "None"
                                    });
                                  }
                                });

                                // Compare Semester-wise Attendance
                                const oldSem = oldVal.sem_attendance || {};
                                const newSem = newVal.sem_attendance || {};
                                for (let num = 1; num <= 8; num++) {
                                  const o = oldSem[num] !== null && oldSem[num] !== undefined ? String(oldSem[num]).trim() : "";
                                  const n = newSem[num] !== null && newSem[num] !== undefined ? String(newSem[num]).trim() : "";
                                  if (o !== n) {
                                    changedFields.push({
                                      label: `Sem ${num} Att.`,
                                      old: o !== "" ? o + "%" : "None",
                                      new: n !== "" ? n + "%" : "None"
                                    });
                                  }
                                }

                                // Compare Achievements
                                const oldAch = oldVal.achievements || [];
                                const newAch = newVal.achievements || [];
                                const oldAchStr = oldAch.map(a => `[${a.type}] ${a.name}`).join(", ") || "None";
                                const newAchStr = newAch.map(a => `[${a.type}] ${a.name}`).join(", ") || "None";
                                if (JSON.stringify(oldAch) !== JSON.stringify(newAch)) {
                                  changedFields.push({
                                    label: "Achievements",
                                    old: oldAchStr,
                                    new: newAchStr
                                  });
                                }

                                if (changedFields.length === 0) {
                                  changeHtml = `<span style="color:var(--text-muted); font-style:italic;">No changes detected</span>`;
                                } else {
                                  changeHtml = `
                                    <div style="display:flex; flex-direction:column; gap:0.4rem; font-size:0.8rem; max-width:450px;">
                                      ${changedFields.map(cf => `
                                        <div style="display:grid; grid-template-columns:110px 1fr; gap:0.5rem; align-items:center; border-bottom:1px dashed #e2e8f0; padding-bottom:0.25rem;">
                                          <span style="font-weight:700; color:#475569;">${cf.label}:</span>
                                          <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                                            <span style="color:#ef4444; text-decoration:line-through;">${cf.old}</span>
                                            <i data-lucide="arrow-right" style="width:12px; height:12px; color:var(--text-muted);"></i>
                                            <span style="color:#0f766e; background:#ccfbf1; padding:0.15rem 0.35rem; border-radius:0.25rem; font-weight:600;">${cf.new}</span>
                                          </div>
                                        </div>
                                      `).join("")}
                                    </div>
                                  `;
                                }
                            } else {
                                changeHtml = `<pre style="margin:0; font-family:inherit; font-size:0.8rem;">${JSON.stringify(req.new_value)}</pre>`;
                            }

                            let actionHtml = "";
                            if (activeTab === "pending") {
                                actionHtml = `
                                    <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                                        <button onclick="window.approveStudentRequest('${req.id}')" style="background:#10b981; border:none; color:#ffffff; font-weight:700; padding:0.4rem 0.75rem; border-radius:0.4rem; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
                                            <i data-lucide="check" style="width:14px; height:14px;"></i> Approve
                                        </button>
                                        <button onclick="window.editAndApproveStudentRequest('${req.id}')" style="background:#003366; border:none; color:#ffffff; font-weight:700; padding:0.4rem 0.75rem; border-radius:0.4rem; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
                                            <i data-lucide="edit" style="width:14px; height:14px;"></i> View & Edit
                                        </button>
                                        <button onclick="window.rejectStudentRequest('${req.id}')" style="background:#ef4444; border:none; color:#ffffff; font-weight:700; padding:0.4rem 0.75rem; border-radius:0.4rem; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
                                            <i data-lucide="x" style="width:14px; height:14px;"></i> Reject
                                        </button>
                                    </div>
                                `;
                            } else {
                                const reviewerName = currentState.teachers.find(t => t.id === req.reviewer_id)?.name || "Coordinator";
                                const isApproved = req.status === "Approved";
                                actionHtml = `
                                    <div style="display:flex; flex-direction:column; gap:0.25rem;">
                                        <span style="align-self:flex-start; font-weight:700; font-size:0.75rem; padding:0.15rem 0.5rem; border-radius:0.25rem; text-transform:uppercase; background:${isApproved ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${isApproved ? '#10b981' : '#ef4444'}; border:1px solid ${isApproved ? '#10b981' : '#ef4444'};">
                                            ${req.status}
                                        </span>
                                        <span style="font-size:0.72rem; color:var(--text-muted);">By: ${reviewerName}</span>
                                        ${req.rejection_reason ? `<span style="font-size:0.72rem; color:#b91c1c; font-style:italic; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${req.rejection_reason}">Reason: ${req.rejection_reason}</span>` : ""}
                                    </div>
                                `;
                            }

                            return `
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:1rem; font-weight:600;">
                                        <div style="color:var(--text-main);">${name}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${rollNo}</div>
                                    </td>
                                    <td style="padding:1rem; font-weight:700; color:#475569;">Profile Update</td>
                                    <td style="padding:1rem;">${changeHtml}</td>
                                    <td style="padding:1rem; color:var(--text-muted); font-size:0.8rem;">${reqDate}</td>
                                    <td style="padding:1rem; ${activeTab === "pending" ? "text-align:right;" : ""}">${actionHtml}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
  `;

  lucide.createIcons();
}

window.switchCoordRequestsTab = (tab) => {
  currentState.coordRequestsTab = tab;
  const container = document.getElementById("main-content");
  if (container) renderCoordStudentRequests(container);
};

window.approveStudentRequest = async (requestId) => {
  try {
    const { data: req, error: fetchErr } = await supabaseClient
      .from("student_updates")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchErr || !req) {
      throw new Error(fetchErr?.message || "Request not found");
    }

    const { student_id, field_name, new_value } = req;

    if (field_name === "profile_update") {
      const updates = {
        gender: new_value.gender || null,
        caste: new_value.caste || null,
        email: new_value.email || null,
        phone: new_value.phone || null,
        father_name: new_value.father_name || null,
        mother_name: new_value.mother_name || null,
        father_phone: new_value.father_phone || null,
        class_10_board: new_value.class_10_board || null,
        class_10_percent: parseFloat(new_value.class_10_percent) || null,
        class_12_board: new_value.class_12_board || null,
        class_12_percent: parseFloat(new_value.class_12_percent) || null,
        diploma_percent: parseFloat(new_value.diploma_percent) || null,
        current_cgpa: parseFloat(new_value.current_cgpa) || null,
        sem_attendance: new_value.sem_attendance || {},
        achievements: new_value.achievements || []
      };

      const { error: updErr } = await supabaseClient
        .from("students")
        .update(updates)
        .eq("id", student_id);
      if (updErr) throw updErr;
    }

    const { error: reqErr } = await supabaseClient
      .from("student_updates")
      .update({
        status: "Approved",
        reviewed_at: new Date().toISOString(),
        reviewer_id: currentState.teacherData.id
      })
      .eq("id", requestId);
    if (reqErr) throw reqErr;

    showToast("Request approved and student profile updated!");
    await loadAllData();
    const container = document.getElementById("main-content");
    if (container) renderCoordStudentRequests(container);

  } catch (err) {
    showToast(err.message, "error");
  }
};

window.rejectStudentRequest = (requestId) => {
  const content = `
    <div style="display:flex; flex-direction:column; gap:0.5rem;">
      <label style="font-weight:700; font-size:0.9rem; color:var(--text-main);">Reason for Rejection *</label>
      <textarea id="reject-reason-input" placeholder="Enter reason for rejecting this request..." style="padding:0.65rem 0.75rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-main); font-family:inherit; min-height:100px; resize:vertical;"></textarea>
    </div>
  `;

  showModal(
    "Reject Request",
    content,
    async () => {
      const reason = document.getElementById("reject-reason-input").value.trim();
      if (!reason) {
        showToast("Please enter a reason for rejection", "error");
        return;
      }

      try {
        const { error } = await supabaseClient
          .from("student_updates")
          .update({
            status: "Rejected",
            rejection_reason: reason,
            reviewed_at: new Date().toISOString(),
            reviewer_id: currentState.teacherData.id
          })
          .eq("id", requestId);

        if (error) throw error;

        showToast("Request rejected.");
        closeModal();
        await loadAllData();
        const container = document.getElementById("main-content");
        if (container) renderCoordStudentRequests(container);
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    { confirmText: "Submit Rejection", cancelText: "Cancel" }
  );
};

window.editAndApproveStudentRequest = async (requestId) => {
  try {
    const { data: req, error } = await supabaseClient
      .from("student_updates")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error || !req) {
      throw new Error(error?.message || "Request not found");
    }

    const { field_name, new_value } = req;

    if (field_name === "profile_update") {
      window._coordEditProfile = { ...(new_value || {}) };
      window._coordEditProfileAchievements = Array.isArray(window._coordEditProfile.achievements) 
        ? [...window._coordEditProfile.achievements] 
        : [];

      const content = `<div id="coord-edit-modal-body" style="display:flex; flex-direction:column; gap:1rem;"></div>`;

      showModal(
        "Edit and Approve Profile Details",
        content,
        async () => {
          const gender = document.getElementById("coord-ep-gender").value;
          const caste = document.getElementById("coord-ep-caste").value.trim() || null;
          const email = document.getElementById("coord-ep-email").value.trim() || null;
          const phone = document.getElementById("coord-ep-phone").value.trim() || null;
          const father_name = document.getElementById("coord-ep-father-name").value.trim() || null;
          const mother_name = document.getElementById("coord-ep-mother-name").value.trim() || null;
          const father_phone = document.getElementById("coord-ep-father-phone").value.trim() || null;
          const class_10_board = document.getElementById("coord-ep-10-board").value.trim() || null;
          const class_10_percent = parseFloat(document.getElementById("coord-ep-10-pct").value) || null;
          const class_12_board = document.getElementById("coord-ep-12-board").value.trim() || null;
          const class_12_percent = parseFloat(document.getElementById("coord-ep-12-pct").value) || null;
          const diploma_percent = parseFloat(document.getElementById("coord-ep-diploma-pct").value) || null;
          const current_cgpa = parseFloat(document.getElementById("coord-ep-cgpa").value) || null;

          if (current_cgpa !== null && (current_cgpa < 0 || current_cgpa > 10)) {
            showToast("CGPA must be between 0 and 10", "error");
            return;
          }

          const sem_attendance = {};
          for (let num = 1; num <= 8; num++) {
            const inputEl = document.getElementById(`coord-ep-sem-${num}`);
            const val = inputEl ? parseFloat(inputEl.value) : NaN;
            sem_attendance[num] = !isNaN(val) ? val : null;
          }

          const achievements = window._coordEditProfileAchievements || [];

          const edited = {
            gender, caste, email, phone, father_name, mother_name, father_phone,
            class_10_board, class_10_percent, class_12_board, class_12_percent, diploma_percent, current_cgpa,
            sem_attendance, achievements
          };

          try {
            const { error: reqErr } = await supabaseClient
              .from("student_updates")
              .update({ new_value: edited })
              .eq("id", requestId);
            if (reqErr) throw reqErr;

            await window.approveStudentRequest(requestId);
            closeModal();
          } catch (err) {
            showToast(err.message, "error");
          }
        },
        { confirmText: "Approve with Changes", cancelText: "Cancel", isWide: true }
      );

      window.addCoordEpAchievement = () => {
        const typeSelect = document.getElementById("coord-ep-ach-type");
        const nameInput = document.getElementById("coord-ep-ach-name");
        if (!typeSelect || !nameInput) return;
        const type = typeSelect.value;
        const name = nameInput.value.trim();
        if (!type || !name) {
          showToast("Please enter achievement details", "error");
          return;
        }
        window._coordEditProfileAchievements.push({ type, name });
        window.renderCoordEpAchievementsList();
        nameInput.value = "";
      };

      window.removeCoordEpAchievement = (idx) => {
        window._coordEditProfileAchievements.splice(idx, 1);
        window.renderCoordEpAchievementsList();
      };

      window.renderCoordEpAchievementsList = () => {
        const container = document.getElementById("coord-ep-ach-list");
        if (!container) return;
        if (window._coordEditProfileAchievements.length === 0) {
          container.innerHTML = `<span style="color:var(--text-muted); font-style:italic; font-size:0.8rem;">No achievements.</span>`;
        } else {
          container.innerHTML = window._coordEditProfileAchievements.map((ach, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-dark); padding:0.4rem 0.6rem; border-radius:0.4rem; border:1px solid var(--border);">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="background:rgba(16, 185, 129, 0.12); color:#10b981; padding:0.15rem 0.45rem; border-radius:0.25rem; font-size:0.68rem; font-weight:700; text-transform:uppercase;">${ach.type}</span>
                <span style="font-weight:600; font-size:0.82rem; color:var(--text-main);">${ach.name}</span>
              </div>
              <button type="button" onclick="window.removeCoordEpAchievement(${idx})" style="background:none; border:none; color:var(--error); font-size:1.1rem; cursor:pointer; font-weight:700;">&times;</button>
            </div>
          `).join("");
        }
      };

      const body = document.getElementById("coord-edit-modal-body");
      if (body) {
        body.innerHTML = `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; max-height:450px; overflow-y:auto; padding:0.25rem;">
            <div style="grid-column: 1 / -1;"><h4 style="margin:0; color:var(--primary);">Personal Details</h4></div>
            
            <div class="form-group" style="margin-bottom:0;">
              <label>Gender</label>
              <select id="coord-ep-gender" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
                <option value="" ${!window._coordEditProfile.gender ? "selected" : ""}>-- Select Gender --</option>
                <option value="Male" ${window._coordEditProfile.gender === "Male" ? "selected" : ""}>Male</option>
                <option value="Female" ${window._coordEditProfile.gender === "Female" ? "selected" : ""}>Female</option>
                <option value="Other" ${window._coordEditProfile.gender === "Other" ? "selected" : ""}>Other</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Caste</label>
              <input type="text" id="coord-ep-caste" value="${window._coordEditProfile.caste || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Email</label>
              <input type="email" id="coord-ep-email" value="${window._coordEditProfile.email || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Phone</label>
              <input type="tel" id="coord-ep-phone" value="${window._coordEditProfile.phone || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Father's Name</label>
              <input type="text" id="coord-ep-father-name" value="${window._coordEditProfile.father_name || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Mother's Name</label>
              <input type="text" id="coord-ep-mother-name" value="${window._coordEditProfile.mother_name || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Father's Phone</label>
              <input type="tel" id="coord-ep-father-phone" value="${window._coordEditProfile.father_phone || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div style="grid-column: 1 / -1; margin-top:0.5rem; border-top:1px solid var(--border); padding-top:1rem;"><h4 style="margin:0; color:var(--primary);">Academic Details</h4></div>

            <div class="form-group" style="margin-bottom:0;">
              <label>10th Board</label>
              <input type="text" id="coord-ep-10-board" value="${window._coordEditProfile.class_10_board || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>10th Percentage (%)</label>
              <input type="number" step="0.01" id="coord-ep-10-pct" value="${window._coordEditProfile.class_10_percent || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>12th Board</label>
              <input type="text" id="coord-ep-12-board" value="${window._coordEditProfile.class_12_board || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>12th Percentage (%)</label>
              <input type="number" step="0.01" id="coord-ep-12-pct" value="${window._coordEditProfile.class_12_percent || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Diploma Percentage (%)</label>
              <input type="number" step="0.01" id="coord-ep-diploma-pct" value="${window._coordEditProfile.diploma_percent || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label>Current CGPA</label>
              <input type="number" step="0.01" id="coord-ep-cgpa" value="${window._coordEditProfile.current_cgpa || ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
            </div>

            <div style="grid-column: 1 / -1; margin-top:0.5rem; border-top:1px solid var(--border); padding-top:1rem;"><h4 style="margin:0; color:var(--primary);">Semester-wise Attendance (%)</h4></div>
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(num => `
              <div class="form-group" style="margin-bottom:0;">
                <label>Semester ${num}</label>
                <input type="number" step="0.01" min="0" max="100" id="coord-ep-sem-${num}" value="${window._coordEditProfile.sem_attendance?.[num] !== undefined ? window._coordEditProfile.sem_attendance[num] : ""}" style="width:100%; padding:0.5rem; background:var(--bg-dark); border:1px solid var(--border); border-radius:0.4rem; color:var(--text-main);">
              </div>
            `).join("")}

            <div style="grid-column: 1 / -1; margin-top:0.5rem; border-top:1px solid var(--border); padding-top:1rem;"><h4 style="margin:0; color:var(--primary);">Achievements</h4></div>
            <div style="grid-column: 1 / -1; display:flex; flex-direction:column; gap:0.5rem;">
              <div id="coord-ep-ach-list" style="max-height:150px; overflow-y:auto; padding:0.5rem; border:1px solid var(--border); border-radius:0.4rem; background:rgba(0,0,0,0.01); display:flex; flex-direction:column; gap:0.4rem;"></div>
              <div style="display:grid; grid-template-columns:1fr 2fr auto; gap:0.5rem; align-items:end; margin-top:0.5rem;">
                <select id="coord-ep-ach-type" style="padding:0.4rem; border:1px solid var(--border); border-radius:0.4rem; background:var(--bg-dark); color:var(--text-main); font-size:0.8rem;">
                  <option value="Internship">Internship</option>
                  <option value="Hackathon">Hackathon</option>
                  <option value="Sports">Sports</option>
                  <option value="Certifications">Certifications</option>
                  <option value="Others">Others</option>
                </select>
                <input type="text" id="coord-ep-ach-name" placeholder="Details" style="padding:0.4rem; border:1px solid var(--border); border-radius:0.4rem; background:var(--bg-dark); color:var(--text-main); font-size:0.8rem;">
                <button type="button" onclick="window.addCoordEpAchievement()" style="background:#10b981; color:white; border:none; padding:0.4rem 0.8rem; border-radius:0.4rem; font-weight:700; font-size:0.8rem; cursor:pointer;">+ Add</button>
              </div>
            </div>
          </div>
        `;
        window.renderCoordEpAchievementsList();
      }
    }
  } catch (err) {
    showToast(err.message, "error");
  }
};

async function renderCoordEditStudents(container) {
  const teacher = currentState.teacherData;
  const coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;

  if (!coordClass) {
    container.innerHTML = `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
                ⚠️ You are not designated as a coordinator for any class section.
            </div>`;
    return;
  }

  const { data: students } = await supabaseClient
    .from("students")
    .select("*")
    .eq("branch", coordClass.branch)
    .eq("year", coordClass.year)
    .eq("section", coordClass.section)
    .order("roll_no");

  const sorted = (students || []).sort((a, b) =>
    compareRollNumbers(a.roll_no || "", b.roll_no || ""),
  );

  container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
            <h1 style="margin:0;">Edit Students</h1>
            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                <button class="btn-primary" onclick="window.downloadCoordStudentsExcel()" style="padding:0.5rem 1rem; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem; background:#10b981; border-color:#10b981; color:#fff;">
                    <i data-lucide="download" style="width:16px;height:16px;"></i> Download Excel
                </button>
                <button class="btn-secondary" onclick="window.switchView('coordDashboard')" style="padding:0.5rem 1rem; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
                    <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Return to Dashboard
                </button>
            </div>
        </div>
        <div class="card">
            <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center;">
                <div style="flex:1;min-width:200px;">
                    <input type="text" id="coord-edit-student-search" placeholder="Search by name or roll no..." oninput="window.filterCoordEditStudents()" style="width:100%;margin:0;">
                </div>
                <div>
                    <select id="coord-edit-student-batch-filter" onchange="window.filterCoordEditStudents()" style="padding: 0.65rem 1.75rem 0.65rem 1rem; background: var(--bg-dark); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.88rem; font-family: inherit; font-weight: 600; outline: none; cursor: pointer; height: auto;">
                        <option value="All">All Batches</option>
                        <option value="B1">Batch B1</option>
                        <option value="B2">Batch B2</option>
                    </select>
                </div>
            </div>
            <div class="table-container">
                <table id="coord-edit-students-table">
                    <thead><tr>
                        <th>Roll No</th><th>Name</th><th>Branch</th><th>Year</th><th>Section</th><th>Batch</th><th>Gender</th><th>Caste</th>
                        <th>Email</th><th>Phone</th><th>Father's Name</th><th>Mother's Name</th><th>Father's Phone</th>
                        <th>10th Board</th><th>10th %</th><th>12th Board</th><th>12th %</th>
                        <th>Diploma %</th><th>CGPA</th><th>Active BL</th><th>History BL</th>
                        <th style="text-align:right;">Action</th>
                    </tr></thead>
                    <tbody>
                        ${sorted
                          .map(
                            (s) => `
                        <tr data-search="${(s.name + " " + s.roll_no).toLowerCase()}" data-batch="${s.batch || "B1"}">
                            <td style="font-size:0.82rem;">${s.roll_no}</td>
                            <td style="font-weight:600;">${s.name}</td>
                            <td>${s.branch}</td>
                            <td>${s.year}</td>
                            <td>${s.section}</td>
                            <td><span style="background:rgba(45,212,191,0.1);color:var(--accent);padding:0.2rem 0.5rem;border-radius:1rem;font-size:0.75rem;font-weight:700;">${s.batch || "B1"}</span></td>
                            <td><span style="font-size:0.8rem;color:${s.gender === "Female" ? "#ec4899" : s.gender === "Male" ? "#3b82f6" : "var(--text-muted)"};">${s.gender || '<span style="opacity:0.4;">—</span>'}</span></td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${s.caste || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${s.email || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${s.phone || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.8rem;">${s.father_name || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.8rem;">${s.mother_name || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${s.father_phone || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;color:var(--text-muted);">${s.class_10_board || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;">${s.class_10_percent ? s.class_10_percent + "%" : '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;color:var(--text-muted);">${s.class_12_board || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;">${s.class_12_percent ? s.class_12_percent + "%" : '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;">${s.diploma_percent ? s.diploma_percent + "%" : '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;">${s.current_cgpa || '<span style="opacity:0.4;">—</span>'}</td>
                            <td style="font-size:0.78rem;text-align:center;">${s.active_backlogs || 0}</td>
                            <td style="font-size:0.78rem;text-align:center;">${s.history_backlogs || 0}</td>
                            <td style="text-align:right;">
                                <button onclick="window.editCoordStudent('${s.id}')" style="background:var(--glass);border:1px solid var(--border);border-radius:0.5rem;color:var(--primary);padding:0.35rem 0.75rem;font-size:0.78rem;cursor:pointer;">Edit</button>
                            </td>
                        </tr>`,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
  window._coordStudentsList = sorted;
  lucide.createIcons();
  setTimeout(window.init3DTilt, 100);
}

window.filterCoordEditStudents = () => {
  const q = (
    document.getElementById("coord-edit-student-search")?.value || ""
  ).toLowerCase();
  const batchFilter =
    document.getElementById("coord-edit-student-batch-filter")?.value || "All";
  document
    .querySelectorAll("#coord-edit-students-table tbody tr")
    .forEach((row) => {
      const s = row.getAttribute("data-search") || "";
      const b = row.getAttribute("data-batch") || "B1";
      const matchesQuery = s.includes(q);
      const matchesBatch = batchFilter === "All" || b === batchFilter;
      row.style.display = matchesQuery && matchesBatch ? "" : "none";
    });
};

window.downloadCoordStudentsExcel = () => {
  const list = window._coordStudentsList || [];
  const q = (
    document.getElementById("coord-edit-student-search")?.value || ""
  ).toLowerCase();
  const batchFilter =
    document.getElementById("coord-edit-student-batch-filter")?.value || "All";

  const filtered = list.filter((s) => {
    const searchStr = (s.name + " " + s.roll_no).toLowerCase();
    const matchesQuery = searchStr.includes(q);
    const matchesBatch =
      batchFilter === "All" || (s.batch || "B1") === batchFilter;
    return matchesQuery && matchesBatch;
  });

  if (filtered.length === 0) {
    showToast("No student data to export", "error");
    return;
  }

  const headers = [
    "Roll No",
    "Name",
    "Branch",
    "Year",
    "Section",
    "Batch",
    "Gender",
    "Caste",
    "Email",
    "Phone",
    "Father's Name",
    "Mother's Name",
    "Father's Phone",
    "10th Board",
    "10th %",
    "12th Board",
    "12th %",
    "Diploma %",
    "CGPA",
    "Active Backlogs",
    "History Backlogs",
  ];

  const rows = filtered.map((s) => [
    s.roll_no || "",
    s.name || "",
    s.branch || "",
    s.year || "",
    s.section || "",
    s.batch || "B1",
    s.gender || "",
    s.caste || "",
    s.email || "",
    s.phone || "",
    s.father_name || "",
    s.mother_name || "",
    s.father_phone || "",
    s.class_10_board || "",
    s.class_10_percent || "",
    s.class_12_board || "",
    s.class_12_percent || "",
    s.diploma_percent || "",
    s.current_cgpa || "",
    s.active_backlogs || 0,
    s.history_backlogs || 0,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r
        .map((val) => {
          let cell = val === null || val === undefined ? "" : String(val);
          cell = cell.split('"').join('""');
          if (cell.includes('"') || cell.includes(",") || cell.includes("\n")) {
            cell = `"${cell}"`;
          }
          return cell;
        })
        .join(","),
    ),
  ].join("\r\n");

  const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `students_details_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Excel/CSV downloaded successfully");
};

window.editCoordStudent = (studentId) => {
  const s = window._coordStudentsList?.find((st) => st.id === studentId);
  if (!s) return;
  
  window._csEditAchievements = Array.isArray(s.achievements) ? [...s.achievements] : [];

  showModal(
    `Edit Student — ${s.name}`,
    `
        <div style="display:grid;gap:1rem;margin-top:0.5rem;max-height:450px;overflow-y:auto;padding-right:0.25rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Full Name</label><input id="cs-name" value="${s.name || ""}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                <div class="form-group"><label>Roll No</label><input id="cs-roll" value="${s.roll_no || ""}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Branch</label>
                    <select id="cs-branch" disabled style="width:100%;padding:0.75rem;background:rgba(0,0,0,0.05);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-muted);cursor:not-allowed;">
                        ${["CS", "IT", "CSIT", "DS", "AIML"].map((b) => `<option value="${b}" ${s.branch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Year</label>
                    <select id="cs-year" disabled style="width:100%;padding:0.75rem;background:rgba(0,0,0,0.05);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-muted);cursor:not-allowed;">
                        ${["1st", "2nd", "3rd", "4th"].map((y) => `<option value="${y}" ${s.year === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group"><label>Section</label>
                    <select id="cs-section" disabled style="width:100%;padding:0.75rem;background:rgba(0,0,0,0.05);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-muted);cursor:not-allowed;">
                        ${["1", "2", "3", "4", "5"].map((sec) => `<option value="${sec}" ${s.section === sec ? "selected" : ""}>${sec}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Batch</label>
                    <select id="cs-batch" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        <option value="B1" ${s.batch === "B1" ? "selected" : ""}>B1</option>
                        <option value="B2" ${s.batch === "B2" ? "selected" : ""}>B2</option>
                    </select>
                </div>
                <div class="form-group"><label>Student Email</label><input type="email" id="cs-email" value="${s.email || ""}" placeholder="student@example.com" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Gender</label>
                    <select id="cs-gender" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                        <option value="" ${!s.gender ? "selected" : ""}>-- Select Gender --</option>
                        <option value="Male" ${s.gender === "Male" ? "selected" : ""}>Male</option>
                        <option value="Female" ${s.gender === "Female" ? "selected" : ""}>Female</option>
                        <option value="Other" ${s.gender === "Other" ? "selected" : ""}>Other</option>
                    </select>
                </div>
                <div class="form-group"><label>Caste</label>
                    <input type="text" id="cs-caste" value="${s.caste || ""}" placeholder="e.g. General, OBC, SC, ST" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Student Phone</label><input type="tel" id="cs-phone" value="${s.phone || ""}" placeholder="+91 9876543210" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                <div class="form-group"><label>Father's Name</label><input type="text" id="cs-father-name" value="${s.father_name || ""}" placeholder="Father's full name" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            </div>
            <div class="form-group"><label>Father's Phone</label><input type="tel" id="cs-father-phone" value="${s.father_phone || ""}" placeholder="+91 9876543210" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
            
            <div style="border-top:1px solid var(--border);padding-top:1rem;grid-column:1 / -1;margin-top:0.5rem;">
                <h4 style="margin:0 0 1rem 0;color:var(--primary);">Academic Records & Profile Details</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Class 10 Board</label><input type="text" id="cs-10-board" value="${s.class_10_board || ""}" placeholder="e.g. CBSE / State Board" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Class 10 %</label><input type="number" step="0.01" id="cs-10-pct" value="${s.class_10_percent || ""}" placeholder="e.g. 92.4" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Class 12 Board</label><input type="text" id="cs-12-board" value="${s.class_12_board || ""}" placeholder="e.g. CBSE / State Board" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Class 12 %</label><input type="number" step="0.01" id="cs-12-pct" value="${s.class_12_percent || ""}" placeholder="e.g. 88.5" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>Diploma %</label><input type="number" step="0.01" id="cs-diploma-pct" value="${s.diploma_percent || ""}" placeholder="e.g. 78.2" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Current CGPA</label><input type="number" step="0.01" id="cs-cgpa" value="${s.current_cgpa || ""}" placeholder="e.g. 8.45" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Active Backlogs</label><input type="number" id="cs-active-backlogs" value="${s.active_backlogs || 0}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                    <div class="form-group"><label>History Backlogs</label><input type="number" id="cs-history-backlogs" value="${s.history_backlogs || 0}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                    <div class="form-group"><label>Mother's Name</label><input type="text" id="cs-mother-name" value="${s.mother_name || ""}" placeholder="Mother's full name" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);"></div>
                </div>

                <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:1rem;">
                    <h4 style="margin:0 0 1rem 0;color:var(--primary);">Semester-wise Attendance (%)</h4>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1rem;margin-bottom:1rem;">
                        ${[1, 2, 3, 4, 5, 6, 7, 8].map(num => `
                            <div class="form-group">
                                <label>Semester ${num}</label>
                                <input type="number" step="0.01" min="0" max="100" id="cs-sem-${num}" value="${s.sem_attendance?.[num] !== undefined ? s.sem_attendance[num] : ""}" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-main);">
                            </div>
                        `).join("")}
                    </div>
                </div>

                <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:1rem;">
                    <h4 style="margin:0 0 1rem 0;color:var(--primary);">Achievements</h4>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
                        <div id="cs-ach-list" style="max-height:150px; overflow-y:auto; padding:0.5rem; border:1px solid var(--border); border-radius:0.5rem; background:rgba(0,0,0,0.01); display:flex; flex-direction:column; gap:0.4rem;"></div>
                        <div style="display:grid; grid-template-columns:1fr 2fr auto; gap:0.5rem; align-items:end; margin-top:0.5rem;">
                            <select id="cs-ach-type" style="padding:0.45rem; border:1px solid var(--border); border-radius:0.4rem; background:var(--bg-dark); color:var(--text-main); font-size:0.85rem;">
                                <option value="Internship">Internship</option>
                                <option value="Hackathon">Hackathon</option>
                                <option value="Sports">Sports</option>
                                <option value="Certifications">Certifications</option>
                                <option value="Others">Others</option>
                            </select>
                            <input type="text" id="cs-ach-name" placeholder="Details" style="padding:0.45rem; border:1px solid var(--border); border-radius:0.4rem; background:var(--bg-dark); color:var(--text-main); font-size:0.85rem;">
                            <button type="button" onclick="window.addCsAchievement()" style="background:#10b981; color:white; border:none; padding:0.45rem 1rem; border-radius:0.4rem; font-weight:700; font-size:0.85rem; cursor:pointer;">+ Add</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    async () => {
      const sem_attendance = {};
      for (let num = 1; num <= 8; num++) {
        const inputEl = document.getElementById(`cs-sem-${num}`);
        const val = inputEl ? parseFloat(inputEl.value) : NaN;
        sem_attendance[num] = !isNaN(val) ? val : null;
      }
      
      const achievements = window._csEditAchievements || [];

      const updates = {
        name: document.getElementById("cs-name").value.trim(),
        roll_no: document.getElementById("cs-roll").value.trim(),
        branch: document.getElementById("cs-branch").value,
        year: document.getElementById("cs-year").value,
        section: document.getElementById("cs-section").value,
        batch: document.getElementById("cs-batch").value,
        gender: document.getElementById("cs-gender").value || null,
        caste: document.getElementById("cs-caste").value.trim() || null,
        email: document.getElementById("cs-email").value.trim() || null,
        phone: document.getElementById("cs-phone").value.trim() || null,
        father_name:
          document.getElementById("cs-father-name").value.trim() || null,
        father_phone:
          document.getElementById("cs-father-phone").value.trim() || null,
        class_10_board:
          document.getElementById("cs-10-board").value.trim() || null,
        class_10_percent:
          parseFloat(document.getElementById("cs-10-pct").value) || null,
        class_12_board:
          document.getElementById("cs-12-board").value.trim() || null,
        class_12_percent:
          parseFloat(document.getElementById("cs-12-pct").value) || null,
        diploma_percent:
          parseFloat(document.getElementById("cs-diploma-pct").value) || null,
        current_cgpa:
          parseFloat(document.getElementById("cs-cgpa").value) || null,
        active_backlogs:
          parseInt(document.getElementById("cs-active-backlogs").value, 10) ||
          0,
        history_backlogs:
          parseInt(document.getElementById("cs-history-backlogs").value, 10) ||
          0,
        mother_name:
          document.getElementById("cs-mother-name").value.trim() || null,
        sem_attendance,
        achievements
      };
      const { error } = await supabaseClient
        .from("students")
        .update(updates)
        .eq("id", studentId);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Student updated successfully!");
        await loadAllData();
        renderCoordEditStudents(document.getElementById("main-content"));
      }
    },
    { confirmText: "Save Changes", isWide: true },
  );

  window.addCsAchievement = () => {
    const typeSelect = document.getElementById("cs-ach-type");
    const nameInput = document.getElementById("cs-ach-name");
    if (!typeSelect || !nameInput) return;
    const type = typeSelect.value;
    const name = nameInput.value.trim();
    if (!type || !name) {
      showToast("Please enter achievement details", "error");
      return;
    }
    window._csEditAchievements.push({ type, name });
    window.renderCsAchievementsList();
    nameInput.value = "";
  };

  window.removeCsAchievement = (idx) => {
    window._csEditAchievements.splice(idx, 1);
    window.renderCsAchievementsList();
  };

  window.renderCsAchievementsList = () => {
    const container = document.getElementById("cs-ach-list");
    if (!container) return;
    if (window._csEditAchievements.length === 0) {
      container.innerHTML = `<span style="color:var(--text-muted); font-style:italic; font-size:0.8rem;">No achievements.</span>`;
    } else {
      container.innerHTML = window._csEditAchievements.map((ach, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-dark); padding:0.4rem 0.6rem; border-radius:0.4rem; border:1px solid var(--border);">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="background:rgba(16, 185, 129, 0.12); color:#10b981; padding:0.15rem 0.45rem; border-radius:0.25rem; font-size:0.68rem; font-weight:700; text-transform:uppercase;">${ach.type}</span>
            <span style="font-weight:600; font-size:0.82rem; color:var(--text-main);">${ach.name}</span>
          </div>
          <button type="button" onclick="window.removeCsAchievement(${idx})" style="background:none; border:none; color:var(--error); font-size:1.1rem; cursor:pointer; font-weight:700;">&times;</button>
        </div>
      `).join("");
    }
  };

  window.renderCsAchievementsList();
};

async function renderCoordEditAttendance(container) {
  const teacher = currentState.teacherData;
  const coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;

  if (!coordClass) {
    container.innerHTML = `
            <div style="background: rgba(99,102,241,0.03); border: 1px solid var(--border); border-radius: 1rem; padding: 3rem; color:var(--text-muted); font-size:1.1rem; text-align:center; margin-top:2rem;">
                ⚠️ You are not designated as a coordinator for any class section.
            </div>`;
    return;
  }

  if (!currentState.coordAttendanceFilters) {
    currentState.coordAttendanceFilters = {
      date: window._selectedCoordDateStr || "",
      branch: coordClass.branch,
      section: coordClass.section,
      subject: "All",
    };
  }
  const filters = currentState.coordAttendanceFilters;

  filters.branch = coordClass.branch;
  filters.section = coordClass.section;

  const queryClassIds = [coordClass.id];

  let query = supabaseClient
    .from("attendance_records")
    .select(
      "*, students(*), subjects(name, code), classes(branch, year, section)",
    )
    .in("class_id", queryClassIds)
    .order("date", { ascending: false });

  if (filters.date) query = query.eq("date", filters.date);

  const { data: records } = await query;

  const filtered = (records || []).filter((r) => {
    const matchBranch =
      String(r.classes?.branch).toLowerCase() ===
      String(filters.branch).toLowerCase();
    const matchSection =
      String(r.classes?.section).replace(/sec\s*/i, "") ===
      String(filters.section).replace(/sec\s*/i, "");
    const matchSubject =
      filters.subject === "All" || r.subjects?.code === filters.subject;
    return matchBranch && matchSection && matchSubject;
  });
  filtered.sort((a, b) =>
    compareRollNumbers(a.students?.roll_no || "", b.students?.roll_no || ""),
  );

  const allSubjects = [
    ...new Set(currentState.subjects.map((s) => s.code).filter(Boolean)),
  ].sort();

  container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
            <h1 style="margin:0;">Edit Attendance</h1>
            <button class="btn-secondary" onclick="window.switchView('coordDashboard')" style="padding:0.5rem 1rem; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
                <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Return to Dashboard
            </button>
        </div>
        <div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;align-items:end;margin-bottom:1.5rem;">
            <div class="form-group"><label>Date</label>
                <input type="date" value="${filters.date}" onchange="window.updateCoordAttFilter('date',this.value)">
            </div>
            <div class="form-group"><label>Branch</label>
                <select disabled>
                    <option value="${coordClass.branch}">${coordClass.branch}</option>
                </select>
            </div>
            <div class="form-group"><label>Section</label>
                <select disabled>
                    <option value="${coordClass.section}">Sec ${coordClass.section}</option>
                </select>
            </div>
            <div class="form-group"><label>Subject</label>
                <select onchange="window.updateCoordAttFilter('subject',this.value)">
                    <option value="All">All</option>
                    ${allSubjects.map((s) => `<option value="${s}" ${filters.subject === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem;">
                <h3 style="margin:0;">Attendance Records (${filtered.length})</h3>
                <div class="bulk-switch-container">
                    <div class="attendance-switch bulk-switch absent-active" id="coord-bulk-switch" onclick="window.toggleBulkCoordSwitch(this, '${filtered
                      .slice(0, 200)
                      .map((r) => r.id)
                      .join(",")}')">
                        <button class="switch-btn absent">Absent All</button>
                        <button class="switch-btn present">Present All</button>
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead><tr>
                        <th>Date</th><th>Roll No</th><th>Name</th><th>Subject</th><th>Class</th><th style="text-align:center;">Mark Status</th>
                    </tr></thead>
                    <tbody>
                        ${filtered
                          .slice(0, 200)
                          .map(
                            (r) => `
                        <tr id="edit-att-row-${r.id}">
                            <td style="font-size:0.8rem;">${r.date}</td>
                            <td style="font-size:0.8rem;">${r.students?.roll_no || "—"}</td>
                            <td style="font-size:0.8rem;">${r.students?.name || "—"}</td>
                            <td style="font-size:0.78rem;">${r.subjects?.code || "—"}</td>
                            <td style="font-size:0.78rem;">${r.classes?.branch || ""} ${r.classes?.year || ""}-${r.classes?.section || ""}</td>
                            <td style="text-align:center; min-width:200px;">
                                <div style="display:flex; justify-content:center;">
                                    <div class="attendance-switch ${r.status === "Present" ? "present-active" : "absent-active"} coord-row-switch" data-record-id="${r.id}" data-status="${r.status}" onclick="window.toggleCoordRowSwitch(this, '${r.id}')">
                                        <button class="switch-btn absent">Absent</button>
                                        <button class="switch-btn present">Present</button>
                                    </div>
                                </div>
                            </td>
                        </tr>`,
                          )
                          .join("")}
                        ${filtered.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:3rem;">No records found for the selected filters.</td></tr>` : ""}
                    </tbody>
                </table>
            </div>
            ${filtered.length > 200 ? `<p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem;text-align:center;">Showing 200 of ${filtered.length} records. Use filters to narrow down.</p>` : ""}
        </div>
    `;
  lucide.createIcons();
  setTimeout(window.init3DTilt, 100);
}

window.updateCoordAttFilter = (key, value) => {
  if (!currentState.coordAttendanceFilters)
    currentState.coordAttendanceFilters = {};
  currentState.coordAttendanceFilters[key] = value;
  renderCoordEditAttendance(document.getElementById("main-content"));
};

window.setCoordAttendanceStatus = async (id, newStatus) => {
  const row = document.getElementById(`edit-att-row-${id}`);
  if (row) {
    const sw = row.querySelector(".coord-row-switch");
    if (sw) {
      sw.classList.remove("present-active", "absent-active");
      sw.classList.add(
        newStatus === "Present" ? "present-active" : "absent-active",
      );
      sw.dataset.status = newStatus;
    }
  }

  const { error } = await supabaseClient
    .from("attendance_records")
    .update({ status: newStatus })
    .eq("id", id);
  if (error) {
    showToast(error.message, "error");
    renderCoordEditAttendance(document.getElementById("main-content"));
  } else {
    showToast(`Updated to ${newStatus}`);
  }
};
window.toggleCoordRowSwitch = async (element, recordId) => {
  const isPresent = element.classList.contains("absent-active"); // toggle it
  const newStatus = isPresent ? "Present" : "Absent";

  element.classList.remove("present-active", "absent-active");
  element.classList.add(isPresent ? "present-active" : "absent-active");
  element.dataset.status = newStatus;

  const { error } = await supabaseClient
    .from("attendance_records")
    .update({ status: newStatus })
    .eq("id", recordId);
  if (error) {
    showToast(error.message, "error");
    element.classList.remove("present-active", "absent-active");
    element.classList.add(!isPresent ? "present-active" : "absent-active");
    element.dataset.status = !isPresent ? "Present" : "Absent";
  } else {
    showToast(`Updated to ${newStatus}`);
  }
};
window.toggleBulkCoordSwitch = async (element, idsStr) => {
  if (!idsStr) {
    showToast("No records to update", "error");
    return;
  }
  const recordIds = idsStr.split(",");
  if (recordIds.length === 0) return;

  const isPresentAll = element.classList.contains("absent-active"); // toggle it
  if (isPresentAll) {
    element.classList.remove("absent-active");
    element.classList.add("present-active");
  } else {
    element.classList.remove("present-active");
    element.classList.add("absent-active");
  }

  const targetStatus = isPresentAll ? "Present" : "Absent";
  const activeClass = isPresentAll ? "present-active" : "absent-active";
  const inactiveClass = isPresentAll ? "absent-active" : "present-active";
  const rowSwitches = document.querySelectorAll(".coord-row-switch");
  rowSwitches.forEach((sw) => {
    sw.classList.remove(inactiveClass);
    sw.classList.add(activeClass);
    sw.dataset.status = targetStatus;
  });

  const { error } = await supabaseClient
    .from("attendance_records")
    .update({ status: targetStatus })
    .in("id", recordIds);
  if (error) {
    showToast(error.message, "error");
    renderCoordEditAttendance(document.getElementById("main-content"));
  } else {
    showToast(`Marked all as ${targetStatus}`);
  }
};

window.updateAllCoordAttendance = async (status, idsStr) => {
  const bulkSwitch = document.getElementById("coord-bulk-switch");
  if (!bulkSwitch) return;
  const isPresent = status === "Present";

  bulkSwitch.classList.remove("present-active", "absent-active");
  bulkSwitch.classList.add(isPresent ? "present-active" : "absent-active");

  window.toggleBulkCoordSwitch(bulkSwitch, idsStr);
};

window.changeCoordDate = (newDate) => {
  const container = document.getElementById("main-content");
  renderCoordDashboard(container, newDate);
};
window.renderMstSettings = async (container) => {
  const { data: settingsData } = await supabaseClient
    .from("mst_settings")
    .select("*");
  if (settingsData) {
    currentState.mstSettings = settingsData;
  }
  const settings = [...currentState.mstSettings].sort((a, b) =>
    a.mst_name.localeCompare(b.mst_name),
  );

  container.innerHTML = `
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0;">MST Settings</h2>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.25rem 0 0 0;">Set passing criteria, total marks and exam duration for MST-1 and MST-2</p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
                ${settings
                  .map(
                    (s) => `
                    <div style="padding: 1.5rem; border: 1px solid var(--border); border-radius: 0.5rem; background: var(--bg-light);">
                        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin: 0 0 1rem 0; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem;">
                            ${s.mst_name}
                        </h3>
                        <form onsubmit="window.saveMstSettings(event, '${s.mst_name}')" style="display: flex; flex-direction: column; gap: 1rem;">
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Total Marks</label>
                                <input type="number" id="mst-total-${s.mst_name}" value="${s.total_marks}" required min="1" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Passing Criteria (Marks)</label>
                                <input type="number" id="mst-pass-${s.mst_name}" value="${s.passing_criteria}" required min="0" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Exam Duration</label>
                                <input type="text" id="mst-duration-${s.mst_name}" value="${s.exam_duration}" placeholder="e.g. 2 Hours" required class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);">
                            </div>
                            <button type="submit" class="btn-primary" style="margin-top: 0.5rem; align-self: flex-start; padding: 0.5rem 1.25rem; font-size: 0.85rem; border-radius: 0.25rem;">
                                Save ${s.mst_name.toUpperCase()} Settings
                            </button>
                        </form>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        </div>
    `;
};

window.saveMstSettings = async (event, mstName) => {
  event.preventDefault();
  const totalMarks = parseFloat(
    document.getElementById(`mst-total-${mstName}`).value,
  );
  const passingCriteria = parseFloat(
    document.getElementById(`mst-pass-${mstName}`).value,
  );
  const examDuration = document
    .getElementById(`mst-duration-${mstName}`)
    .value.trim();

  if (passingCriteria > totalMarks) {
    showToast("Passing criteria cannot be greater than total marks", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("mst_settings")
    .update({
      total_marks: totalMarks,
      passing_criteria: passingCriteria,
      exam_duration: examDuration,
    })
    .eq("mst_name", mstName);

  if (error) {
    showToast(`Error saving settings: ${error.message}`, "error");
  } else {
    showToast(`Settings for ${mstName.toUpperCase()} saved successfully!`);
    await loadAllData();
    renderActiveView();
  }
};

window.convert12to24 = (hour, minute, ampm) => {
  let h = parseInt(hour);
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const hStr = String(h).padStart(2, "0");
  const mStr = String(minute).padStart(2, "0");
  return `${hStr}:${mStr}:00`;
};

window.convert24to12 = (timeStr) => {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  let h = parseInt(parts[0]);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};

window.parseDurationStringToMinutes = (durationStr) => {
  if (!durationStr) return 120; // default 2 hours
  const str = durationStr.toLowerCase().trim();
  const decimalHoursMatch = str.match(/^([\d.]+)\s*(hours|hour|hrs|hr|h)$/);
  if (decimalHoursMatch) {
    return Math.round(parseFloat(decimalHoursMatch[1]) * 60);
  }
  const minutesMatch = str.match(/^(\d+)\s*(minutes|minute|mins|min|m)$/);
  if (minutesMatch) {
    return parseInt(minutesMatch[1], 10);
  }
  let totalMinutes = 0;
  const hourMatch = str.match(/(\d+)\s*(hours|hour|hrs|hr|h)/);
  const minMatch = str.match(/(\d+)\s*(minutes|minute|mins|min|m)/);

  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1], 10) * 60;
  }
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1], 10);
  }

  if (totalMinutes > 0) return totalMinutes;
  const justNumber = str.match(/^([\d.]+)$/);
  if (justNumber) {
    const val = parseFloat(justNumber[1]);
    if (val >= 10) return Math.round(val);
    return Math.round(val * 60);
  }

  return 120; // fallback
};

window.updateMstEndTime = (elementInRow) => {
  const row = elementInRow.closest(".mst-subject-row");
  if (!row) return;

  const mstName = document.getElementById("mst-tt-name").value;
  const mstConfig = currentState.mstSettings.find(
    (s) => s.mst_name === mstName,
  );
  const durationStr = mstConfig ? mstConfig.exam_duration : "2 Hours";
  const durationMinutes = window.parseDurationStringToMinutes(durationStr);

  const shour = parseInt(row.querySelector(".mst-sub-shour").value, 10);
  const sminute = parseInt(row.querySelector(".mst-sub-sminute").value, 10);
  const sampm = row.querySelector(".mst-sub-sampm").value;

  let startHours24 = shour;
  if (sampm === "PM" && shour < 12) startHours24 += 12;
  if (sampm === "AM" && shour === 12) startHours24 = 0;

  const startTotalMinutes = startHours24 * 60 + sminute;
  let endTotalMinutes = (startTotalMinutes + durationMinutes) % (24 * 60);

  let endHours24 = Math.floor(endTotalMinutes / 60);
  let endMinutes = endTotalMinutes % 60;
  endMinutes = Math.round(endMinutes / 5) * 5;
  if (endMinutes === 60) {
    endMinutes = 0;
    endHours24 = (endHours24 + 1) % 24;
  }

  let endAmpm = "AM";
  let endHour12 = endHours24;
  if (endHours24 >= 12) {
    endAmpm = "PM";
    if (endHours24 > 12) endHour12 = endHours24 - 12;
  }
  if (endHour12 === 0) {
    endHour12 = 12;
  }

  const endMinutesStr = String(endMinutes).padStart(2, "0");

  row.querySelector(".mst-sub-ehour").value = endHour12;
  row.querySelector(".mst-sub-eminute").value = endMinutesStr;
  row.querySelector(".mst-sub-eampm").value = endAmpm;
};
window.renderMstTimetable = async (container) => {
  const { data: timetableData } = await supabaseClient
    .from("mst_timetable")
    .select("*, subjects(*), classes(*)");
  if (timetableData) {
    currentState.mstTimetable = timetableData;
  }

  const activeBranches = currentState.deptBranches || [];
  const years = ["1st", "2nd", "3rd", "4th"];
  const sections = ["1", "2", "3", "4", "5"];

  const selectedMst = localStorage.getItem("mst_tt_selected_mst") || "mst-1";
  const selectedBranch = localStorage.getItem("mst_tt_selected_branch") || "";
  const selectedYear = localStorage.getItem("mst_tt_selected_year") || "";
  const selectedSection = localStorage.getItem("mst_tt_selected_section") || "";

  const mstLockKey = `mst_tt_locked_${selectedMst}_${selectedBranch}_${selectedYear}_${selectedSection}`;
  const isMstLocked =
    selectedMst &&
    selectedBranch &&
    selectedYear &&
    selectedSection &&
    localStorage.getItem(mstLockKey) === "true";
  const hasScheduledMstSlots =
    timetableData &&
    timetableData.some(
      (t) =>
        t.mst_name === selectedMst &&
        t.classes?.branch === selectedBranch &&
        t.classes?.year === selectedYear &&
        t.classes?.section === selectedSection,
    );

  container.innerHTML = `
        <style>
            .mst-tt-form-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 1rem;
                margin-bottom: 1.5rem;
                align-items: end;
            }
            .time-select-group {
                display: flex;
                gap: 0.25rem;
                align-items: center;
            }
            .time-select-group select {
                padding: 0.35rem 0.25rem;
                border: 1px solid var(--border);
                border-radius: 0.25rem;
                font-size: 0.85rem;
                background: #ffffff;
            }
        </style>
        
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow); margin-bottom: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 0.5rem 0;">Schedule MST Exams</h2>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">Configure exam schedule for a branch, year, and section together</p>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    ${
                      selectedMst &&
                      selectedBranch &&
                      selectedYear &&
                      selectedSection &&
                      !isMstLocked &&
                      hasScheduledMstSlots
                        ? `
                        <button class="btn-primary" onclick="window.lockMstTimetable()" style="background:var(--accent);color:white;border:1px solid var(--accent);font-weight:600;padding: 0.6rem 1.25rem; border-radius: 0.25rem; cursor: pointer;">
                            ✓ Submit & Lock
                        </button>
                    `
                        : ""
                    }
                    ${
                      isMstLocked
                        ? `
                        <span style="background:rgba(16,185,129,0.1);color:var(--accent);padding:0.6rem 1.25rem;border-radius:0.25rem;border:1px solid var(--accent);font-weight:600;font-size:0.85rem;">🔒 MST Timetable Locked</span>
                        <button class="btn-primary" onclick="window.unlockMstTimetable()" style="background:var(--error);color:white;border:1px solid var(--error);padding:0.6rem 1.25rem;font-size:0.85rem;font-weight:600;border-radius:0.25rem;cursor:pointer;">
                            Unlock & Edit
                        </button>
                    `
                        : ""
                    }
                </div>
            </div>
            
            <div class="mst-tt-form-grid">
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">MST Name</label>
                    <select id="mst-tt-name" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstTimetableFilters()">
                        <option value="mst-1" ${selectedMst === "mst-1" ? "selected" : ""}>MST-1</option>
                        <option value="mst-2" ${selectedMst === "mst-2" ? "selected" : ""}>MST-2</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Branch</label>
                    <select id="mst-tt-branch" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstTimetableFilters()">
                        <option value="" disabled selected>Select Branch</option>
                        ${activeBranches.map((b) => `<option value="${b}" ${selectedBranch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Year</label>
                    <select id="mst-tt-year" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstTimetableFilters()">
                        <option value="" disabled selected>Select Year</option>
                        ${years.map((y) => `<option value="${y}" ${selectedYear === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Section</label>
                    <select id="mst-tt-section" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstTimetableFilters()">
                        <option value="" disabled selected>Select Section</option>
                        ${sections.map((s) => `<option value="${s}" ${selectedSection === s ? "selected" : ""}>${s}</option>`).join("")}
                    </select>
                </div>
                
                <div>
                    <button onclick="window.loadMstTimetableScheduler()" class="btn-primary" style="width: 100%; padding: 0.6rem 1rem; border-radius: 0.25rem; cursor: pointer;">
                        Configure Schedules
                    </button>
                </div>
            </div>
            
            <div id="mst-scheduler-subjects-area" style="display: none; border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
            </div>
        </div>

        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow);">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 1rem 0;">MST Timetable Records</h2>
            
            <div style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light);">
                            <th style="padding: 0.75rem; font-weight: 600;">MST</th>
                            <th style="padding: 0.75rem; font-weight: 600;">Class Details</th>
                            <th style="padding: 0.75rem; font-weight: 600;">Subject</th>
                            <th style="padding: 0.75rem; font-weight: 600;">Date</th>
                            <th style="padding: 0.75rem; font-weight: 600;">Time</th>
                            <th style="padding: 0.75rem; font-weight: 600;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          currentState.mstTimetable.length === 0
                            ? `
                            <tr>
                                <td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No MST timetable scheduled yet.</td>
                            </tr>
                        `
                            : currentState.mstTimetable
                                .map((t) => {
                                  const br =
                                    t.classes?.branch || t.branch || "";
                                  const yr = t.classes?.year || "";
                                  const sec = t.classes?.section || "";
                                  const recordLockKey = `mst_tt_locked_${t.mst_name}_${br}_${yr}_${sec}`;
                                  const isRecordLocked =
                                    br &&
                                    yr &&
                                    sec &&
                                    localStorage.getItem(recordLockKey) ===
                                      "true";

                                  return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 0.75rem; font-weight: 600; text-transform: uppercase;">${t.mst_name}</td>
                                    <td style="padding: 0.75rem;">${t.classes ? `${t.classes.branch} ${t.classes.year} Sec ${t.classes.section}` : t.branch || ""}</td>
                                    <td style="padding: 0.75rem;">
                                        <div style="font-weight: 600;">${t.subjects?.name || "Unknown Subject"}</div>
                                        <div style="font-size: 0.8rem; color: var(--text-muted);">${t.subjects?.code || ""}</div>
                                    </td>
                                    <td style="padding: 0.75rem;">${new Date(t.exam_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                    <td style="padding: 0.75rem;">${window.convert24to12(t.start_time)} - ${window.convert24to12(t.end_time)}</td>
                                    <td style="padding: 0.75rem;">
                                        ${
                                          !isRecordLocked
                                            ? `
                                            <button class="btn-danger" onclick="window.deleteMstTimetable('${t.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-radius: 0.25rem; display: flex; align-items: center; gap: 0.25rem; border: none; cursor: pointer;">
                                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete
                                            </button>
                                        `
                                            : `
                                            <span style="font-size:0.75rem;color:var(--accent);background:rgba(16,185,129,0.1);padding:0.25rem 0.5rem;border-radius:0.25rem;border:1px solid var(--accent);font-weight:600;">🔒 Locked</span>
                                        `
                                        }
                                    </td>
                                </tr>
                            `;
                                })
                                .join("")
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
  lucide.createIcons();
  if (selectedMst && selectedBranch && selectedYear && selectedSection) {
    window.loadMstTimetableScheduler();
  }
};

window.lockMstTimetable = () => {
  const mstName = document.getElementById("mst-tt-name").value;
  const branch = document.getElementById("mst-tt-branch").value;
  const year = document.getElementById("mst-tt-year").value;
  const section = document.getElementById("mst-tt-section").value;
  if (!mstName || !branch || !year || !section) return;

  const lockKey = `mst_tt_locked_${mstName}_${branch}_${year}_${section}`;
  localStorage.setItem(lockKey, "true");
  showToast(
    `${mstName.toUpperCase()} Timetable for ${branch} ${year} - Sec ${section} is now locked!`,
  );
  renderActiveView();
};

window.unlockMstTimetable = () => {
  const mstName = document.getElementById("mst-tt-name").value;
  const branch = document.getElementById("mst-tt-branch").value;
  const year = document.getElementById("mst-tt-year").value;
  const section = document.getElementById("mst-tt-section").value;
  if (!mstName || !branch || !year || !section) return;

  const lockKey = `mst_tt_locked_${mstName}_${branch}_${year}_${section}`;
  localStorage.removeItem(lockKey);
  showToast(
    `${mstName.toUpperCase()} Timetable unlocked for editing.`,
    "success",
  );
  renderActiveView();
};

window.saveMstTimetableFilters = () => {
  localStorage.setItem(
    "mst_tt_selected_mst",
    document.getElementById("mst-tt-name").value,
  );
  localStorage.setItem(
    "mst_tt_selected_branch",
    document.getElementById("mst-tt-branch").value,
  );
  localStorage.setItem(
    "mst_tt_selected_year",
    document.getElementById("mst-tt-year").value,
  );
  localStorage.setItem(
    "mst_tt_selected_section",
    document.getElementById("mst-tt-section").value,
  );
  renderActiveView(); // Force UI refresh so button status updates
};

window.toggleMstSubjectRow = (checkbox) => {
  const row = checkbox.closest(".mst-subject-row");
  if (!row) return;
  const inputs = row.querySelectorAll("input:not(.mst-sub-enable), select");
  if (checkbox.checked) {
    row.style.opacity = "1";
    inputs.forEach((input) => input.removeAttribute("disabled"));
  } else {
    row.style.opacity = "0.5";
    inputs.forEach((input) => input.setAttribute("disabled", "true"));
  }
};

window.loadMstTimetableScheduler = async () => {
  const mstName = document.getElementById("mst-tt-name").value;
  const branch = document.getElementById("mst-tt-branch").value;
  const year = document.getElementById("mst-tt-year").value;
  const section = document.getElementById("mst-tt-section").value;

  if (!branch || !year || !section) {
    showToast("Please select branch, year, and section first", "error");
    return;
  }

  const mstLockKey = `mst_tt_locked_${mstName}_${branch}_${year}_${section}`;
  const isMstLocked =
    branch && year && section && localStorage.getItem(mstLockKey) === "true";

  const area = document.getElementById("mst-scheduler-subjects-area");
  area.style.display = "block";
  area.innerHTML = `
        <div style="display:flex; justify-content:center; padding: 2rem;">
            <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  const { data: classObj, error: cErr } = await supabaseClient
    .from("classes")
    .select("*")
    .eq("branch", branch)
    .eq("year", year)
    .eq("section", section)
    .maybeSingle();

  if (cErr) {
    showToast(`Error fetching class: ${cErr.message}`, "error");
    return;
  }

  if (!classObj) {
    area.innerHTML = `
            <div style="color: var(--error); font-weight: 600; text-align: center; padding: 1rem;">
                No class found matching ${branch} ${year} Sec ${section}. Please create the class first.
            </div>
        `;
    return;
  }

  const subjects = currentState.subjects.filter((s) => s.branch === branch);

  if (subjects.length === 0) {
    area.innerHTML = `
            <div style="color: var(--text-muted); text-align: center; padding: 1rem;">
                No subjects found for branch ${branch}. Please add subjects first.
            </div>
        `;
    return;
  }

  const { data: existingSlots } = await supabaseClient
    .from("mst_timetable")
    .select("*")
    .eq("mst_name", mstName)
    .eq("class_id", classObj.id);

  const slotMap = {};
  (existingSlots || []).forEach((s) => {
    slotMap[s.subject_id] = s;
  });

  const hoursOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutesOptions = Array.from({ length: 60 }, (_, i) => i)
    .filter((m) => m % 5 === 0)
    .map((m) => String(m).padStart(2, "0"));

  const parse24hTime = (timeStr) => {
    if (!timeStr) return { hour: "10", minute: "00", ampm: "AM" };
    const parts = timeStr.split(":");
    let h = parseInt(parts[0]);
    const m = parts[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return { hour: String(h), minute: m, ampm };
  };

  area.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--primary); margin: 0;">
                Schedule subjects for ${branch} ${year} Sec ${section} (${mstName.toUpperCase()})
            </h3>
            ${
              isMstLocked
                ? `
                <span style="font-size: 0.8rem; color: var(--accent); background: rgba(16, 185, 129, 0.1); padding: 0.3rem 0.75rem; border-radius: 1rem; border: 1px solid var(--accent); font-weight: 600;">🔒 Schedule Locked</span>
            `
                : `
                <span style="font-size: 0.8rem; color: var(--text-muted); background: var(--glass); padding: 0.3rem 0.75rem; border-radius: 1rem; font-weight: 600;">✏️ Editable</span>
            `
            }
        </div>
        
        <form onsubmit="window.saveAllMstSchedules(event, '${classObj.id}')" style="display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${subjects
                  .map((sub) => {
                    const existing = slotMap[sub.id] || {};
                    const examDate = existing.exam_date || "";

                    const defaultStartTimeStr = "10:00:00";
                    const mstConfig = currentState.mstSettings.find(
                      (s) => s.mst_name === mstName,
                    );
                    const durationStr = mstConfig
                      ? mstConfig.exam_duration
                      : "2 Hours";
                    const durationMinutes =
                      window.parseDurationStringToMinutes(durationStr);

                    const calculateEndTimeStr = (startTime24h, durMins) => {
                      const parts = startTime24h.split(":");
                      const h = parseInt(parts[0], 10);
                      const m = parseInt(parts[1], 10);
                      const totalStartMins = h * 60 + m;
                      const totalEndMins =
                        (totalStartMins + durMins) % (24 * 60);
                      const eh = Math.floor(totalEndMins / 60);
                      const em = Math.round((totalEndMins % 60) / 5) * 5;
                      let finalEh = eh;
                      let finalEm = em;
                      if (finalEm === 60) {
                        finalEm = 0;
                        finalEh = (finalEh + 1) % 24;
                      }
                      return `${String(finalEh).padStart(2, "0")}:${String(finalEm).padStart(2, "0")}:00`;
                    };

                    const defaultEndTimeStr = calculateEndTimeStr(
                      existing.start_time || defaultStartTimeStr,
                      durationMinutes,
                    );
                    const startT = parse24hTime(
                      existing.start_time || defaultStartTimeStr,
                    );
                    const endT = parse24hTime(
                      existing.end_time || defaultEndTimeStr,
                    );

                    const isChecked =
                      existingSlots && existingSlots.length > 0
                        ? !!slotMap[sub.id]
                        : true;
                    const opacity = isChecked ? "1" : "0.5";
                    const disabled =
                      isChecked && !isMstLocked ? "" : "disabled";
                    const checkboxDisabled = isMstLocked ? "disabled" : "";

                    return `
                        <div class="mst-subject-row" data-subject-id="${sub.id}" style="display: grid; grid-template-columns: auto 2fr 1.5fr 2fr 2fr; gap: 1.5rem; align-items: center; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; background: var(--bg-light); opacity: ${opacity}; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; justify-content: center;">
                                <input type="checkbox" class="mst-sub-enable" ${isChecked ? "checked" : ""} ${checkboxDisabled} onchange="window.toggleMstSubjectRow(this)" style="width: 1.2rem; height: 1.2rem; cursor: pointer;">
                            </div>
                            <div>
                                <div style="font-weight: 700; color: var(--text-main);">${sub.name}</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted);">${sub.code}</div>
                            </div>
                            <div>
                                <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Date</label>
                                <input type="date" class="mst-sub-date" value="${examDate}" ${disabled} style="width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 0.25rem; background: #ffffff;">
                            </div>
                            <div>
                                <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Start Time (12h)</label>
                                <div class="time-select-group">
                                    <select class="mst-sub-shour" ${disabled} onchange="window.updateMstEndTime(this)">
                                        ${hoursOptions.map((h) => `<option value="${h}" ${startT.hour == h ? "selected" : ""}>${h}</option>`).join("")}
                                    </select>
                                    <span>:</span>
                                    <select class="mst-sub-sminute" ${disabled} onchange="window.updateMstEndTime(this)">
                                        ${minutesOptions.map((m) => `<option value="${m}" ${startT.minute == m ? "selected" : ""}>${m}</option>`).join("")}
                                    </select>
                                    <select class="mst-sub-sampm" ${disabled} onchange="window.updateMstEndTime(this)">
                                        <option value="AM" ${startT.ampm === "AM" ? "selected" : ""}>AM</option>
                                        <option value="PM" ${startT.ampm === "PM" ? "selected" : ""}>PM</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">End Time (12h)</label>
                                <div class="time-select-group">
                                    <select class="mst-sub-ehour" ${disabled}>
                                        ${hoursOptions.map((h) => `<option value="${h}" ${endT.hour == h ? "selected" : ""}>${h}</option>`).join("")}
                                    </select>
                                    <span>:</span>
                                    <select class="mst-sub-eminute" ${disabled}>
                                        ${minutesOptions.map((m) => `<option value="${m}" ${endT.minute == m ? "selected" : ""}>${m}</option>`).join("")}
                                    </select>
                                    <select class="mst-sub-eampm" ${disabled}>
                                        <option value="AM" ${endT.ampm === "AM" ? "selected" : ""}>AM</option>
                                        <option value="PM" ${endT.ampm === "PM" ? "selected" : ""}>PM</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;
                  })
                  .join("")}
            </div>
            
            ${
              isMstLocked
                ? `
                <div style="text-align: right; color: var(--text-muted); font-size: 0.9rem; font-weight: 600; padding-top: 1rem;">
                    🔒 This exam timetable schedule is locked and cannot be edited.
                </div>
            `
                : `
                <button type="submit" class="btn-primary" style="align-self: flex-end; padding: 0.75rem 2rem; margin-top: 1rem; border-radius: 0.25rem; font-size: 1rem; border: none; cursor: pointer;">
                    Save Schedule Timetable
                </button>
            `
            }
        </form>
    `;
};

window.saveAllMstSchedules = async (event, classId) => {
  event.preventDefault();
  const mstName = document.getElementById("mst-tt-name").value;
  const branch = document.getElementById("mst-tt-branch").value;
  const year = document.getElementById("mst-tt-year").value;
  const section = document.getElementById("mst-tt-section").value;

  const lockKey = `mst_tt_locked_${mstName}_${branch}_${year}_${section}`;
  if (localStorage.getItem(lockKey) === "true") {
    showToast("This schedule is locked and cannot be saved.", "error");
    return;
  }

  const rows = document.querySelectorAll(".mst-subject-row");
  const records = [];
  const deleteSubjectIds = [];

  let hasEmptyDate = false;

  rows.forEach((row) => {
    const subjectId = row.dataset.subjectId;
    const enabled = row.querySelector(".mst-sub-enable").checked;

    if (enabled) {
      const examDate = row.querySelector(".mst-sub-date").value;
      if (!examDate) {
        hasEmptyDate = true;
        return;
      }
      const shour = row.querySelector(".mst-sub-shour").value;
      const sminute = row.querySelector(".mst-sub-sminute").value;
      const sampm = row.querySelector(".mst-sub-sampm").value;
      const startTime = window.convert12to24(shour, sminute, sampm);

      const ehour = row.querySelector(".mst-sub-ehour").value;
      const minutes = row.querySelector(".mst-sub-eminute").value;
      const eampm = row.querySelector(".mst-sub-eampm").value;
      const endTime = window.convert12to24(ehour, minutes, eampm);

      records.push({
        mst_name: mstName,
        branch: branch,
        class_id: classId,
        subject_id: subjectId,
        exam_date: examDate,
        start_time: startTime,
        end_time: endTime,
      });
    } else {
      deleteSubjectIds.push(subjectId);
    }
  });

  if (hasEmptyDate) {
    showToast("Please fill the date for all selected subjects", "error");
    return;
  }
  if (deleteSubjectIds.length > 0) {
    const { error: delError } = await supabaseClient
      .from("mst_timetable")
      .delete()
      .eq("mst_name", mstName)
      .eq("class_id", classId)
      .in("subject_id", deleteSubjectIds);

    if (delError) {
      showToast(
        `Error removing deselected subjects: ${delError.message}`,
        "error",
      );
      return;
    }
  }

  if (records.length === 0 && deleteSubjectIds.length === 0) {
    showToast("Please select at least one subject to schedule", "error");
    return;
  }

  if (records.length > 0) {
    const { error } = await supabaseClient
      .from("mst_timetable")
      .upsert(records, { onConflict: "mst_name,class_id,subject_id" });

    if (error) {
      showToast(`Error saving: ${error.message}`, "error");
      return;
    }
  }

  showToast("MST timetable saved successfully!");
  await loadAllData();
  renderActiveView();
};

window.deleteMstTimetable = async (id) => {
  const record = currentState.mstTimetable.find((t) => t.id === id);
  if (record) {
    const br = record.classes?.branch || record.branch || "";
    const yr = record.classes?.year || "";
    const sec = record.classes?.section || "";
    const recordLockKey = `mst_tt_locked_${record.mst_name}_${br}_${yr}_${sec}`;
    if (localStorage.getItem(recordLockKey) === "true") {
      showToast("This schedule is locked and cannot be deleted.", "error");
      return;
    }
  }

  if (!confirm("Are you sure you want to delete this exam schedule?")) return;
  const { error } = await supabaseClient
    .from("mst_timetable")
    .delete()
    .eq("id", id);

  if (error) {
    showToast(`Error deleting: ${error.message}`, "error");
  } else {
    showToast("MST timetable entry deleted.");
    await loadAllData();
    renderActiveView();
  }
};
window.renderMstMarksEntry = async (container) => {
  const branches = ["IT", "DS"];
  const years = ["1st", "2nd", "3rd", "4th"];
  const sections = ["1", "2", "3", "4", "5"];

  const selectedMst = localStorage.getItem("mst_entry_selected_mst") || "mst-1";
  const selectedBranch =
    localStorage.getItem("mst_entry_selected_branch") || "";
  const selectedYear = localStorage.getItem("mst_entry_selected_year") || "";
  const selectedSection =
    localStorage.getItem("mst_entry_selected_section") || "";
  const selectedSubject =
    localStorage.getItem("mst_entry_selected_subject") || "";
  const scheduledMstSlots = currentState.mstTimetable.filter(
    (t) =>
      t.mst_name === selectedMst &&
      (t.classes?.branch === selectedBranch || t.branch === selectedBranch) &&
      t.classes?.year === selectedYear &&
      t.classes?.section === selectedSection,
  );
  const scheduledSubjectIds = scheduledMstSlots.map((t) => t.subject_id);
  const teacher = currentState.teacherData;
  const mySubjectIds = [
    ...new Set(
      currentState.timetable
        .filter(
          (t) =>
            t.teacher_id === teacher?.id ||
            (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
        )
        .map((t) => t.subject_id),
    ),
  ];
  const allowedSubjectIds = mySubjectIds.filter((id) =>
    scheduledSubjectIds.includes(id),
  );
  const filteredSubjects = currentState.subjects.filter((s) =>
    allowedSubjectIds.includes(s.id),
  );
  const finalSelectedSubject = filteredSubjects.some(
    (s) => s.id === selectedSubject,
  )
    ? selectedSubject
    : "";

  container.innerHTML = `
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow); margin-bottom: 2rem;">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 1.5rem 0;">Mark MST Marks</h2>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end;">
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Select MST</label>
                    <select id="mst-entry-mst" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstEntryFilters()">
                        <option value="mst-1" ${selectedMst === "mst-1" ? "selected" : ""}>MST-1</option>
                        <option value="mst-2" ${selectedMst === "mst-2" ? "selected" : ""}>MST-2</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Branch</label>
                    <select id="mst-entry-branch" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstEntryFilters()">
                        <option value="" disabled selected>Select Branch</option>
                        ${branches.map((b) => `<option value="${b}" ${selectedBranch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Year</label>
                    <select id="mst-entry-year" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstEntryFilters()">
                        <option value="" disabled selected>Select Year</option>
                        ${years.map((y) => `<option value="${y}" ${selectedYear === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Section</label>
                    <select id="mst-entry-section" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstEntryFilters()">
                        <option value="" disabled selected>Select Section</option>
                        ${sections.map((s) => `<option value="${s}" ${selectedSection === s ? "selected" : ""}>${s}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Subject</label>
                    <select id="mst-entry-subject" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstEntryFilters()">
                        <option value="" disabled selected>${selectedBranch && selectedYear && selectedSection ? "Select Subject" : "Select Class First"}</option>
                        ${filteredSubjects.map((s) => `<option value="${s.id}" ${finalSelectedSubject === s.id ? "selected" : ""}>${s.name} (${s.code})</option>`).join("")}
                    </select>
                </div>
                
                <div>
                    <button onclick="window.loadMstStudentList()" class="btn-primary" style="width: 100%; padding: 0.6rem 1rem; border-radius: 0.25rem; cursor: pointer;">
                        Load Student List
                    </button>
                </div>
            </div>
        </div>
        
        <div id="mst-student-list-container" style="display: none;"></div>
    `;

  if (
    selectedMst &&
    selectedBranch &&
    selectedYear &&
    selectedSection &&
    finalSelectedSubject
  ) {
    window.loadMstStudentList();
  }
};

window.saveMstEntryFilters = () => {
  localStorage.setItem(
    "mst_entry_selected_mst",
    document.getElementById("mst-entry-mst").value,
  );
  localStorage.setItem(
    "mst_entry_selected_branch",
    document.getElementById("mst-entry-branch").value,
  );
  localStorage.setItem(
    "mst_entry_selected_year",
    document.getElementById("mst-entry-year").value,
  );
  localStorage.setItem(
    "mst_entry_selected_section",
    document.getElementById("mst-entry-section").value,
  );

  const subjectEl = document.getElementById("mst-entry-subject");
  localStorage.setItem(
    "mst_entry_selected_subject",
    subjectEl ? subjectEl.value : "",
  );

  renderActiveView(); // Force UI re-render so that dynamic subject list updates!
};

window.loadMstStudentList = async () => {
  const mst = document.getElementById("mst-entry-mst").value;
  const branch = document.getElementById("mst-entry-branch").value;
  const year = document.getElementById("mst-entry-year").value;
  const section = document.getElementById("mst-entry-section").value;
  const subjectId = document.getElementById("mst-entry-subject").value;

  if (!branch || !year || !section || !subjectId) {
    showToast("Please select all filters first", "error");
    return;
  }

  const teacher = currentState.teacherData;
  const mySubjectIds = [
    ...new Set(
      currentState.timetable
        .filter(
          (t) =>
            t.teacher_id === teacher?.id ||
            (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
        )
        .map((t) => t.subject_id),
    ),
  ];
  if (!mySubjectIds.includes(subjectId)) {
    showToast("You are not authorized to mark marks for this subject", "error");
    return;
  }

  const container = document.getElementById("mst-student-list-container");
  container.style.display = "block";
  container.innerHTML = `
        <div style="display:flex; justify-content:center; padding: 2rem;">
            <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  const { data: students, error: stErr } = await supabaseClient
    .from("students")
    .select("*")
    .eq("branch", branch)
    .eq("year", year)
    .eq("section", section);

  if (stErr) {
    showToast(`Error loading students: ${stErr.message}`, "error");
    return;
  }

  const sortedStudents = (students || []).sort((a, b) =>
    compareRollNumbers(a.roll_no || "", b.roll_no || ""),
  );

  const { data: marksRecords, error: mErr } = await supabaseClient
    .from("mst_marks")
    .select("*")
    .eq("subject_id", subjectId)
    .eq("mst_name", mst);

  if (mErr) {
    showToast(`Error loading marks records: ${mErr.message}`, "error");
    return;
  }

  const marksMap = {};
  (marksRecords || []).forEach((r) => {
    marksMap[r.student_id] = r;
  });

  const mstConfig = currentState.mstSettings.find(
    (s) => s.mst_name === mst,
  ) || { total_marks: 40, passing_criteria: 12 };
  const maxMarks = mstConfig.total_marks;

  container.innerHTML = `
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--primary); margin: 0;">
                    Student Marks Sheet (${mst.toUpperCase()} · Max Marks: ${maxMarks})
                </h3>
                <div style="font-size: 0.9rem; color: var(--text-muted);">
                    Passing Marks Criteria: <strong style="color: var(--accent);">${mstConfig.passing_criteria}</strong>
                </div>
            </div>
            
            <div style="overflow-x: auto; margin-bottom: 1.5rem;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light);">
                            <th style="padding: 0.75rem; width: 80px;">S.No.</th>
                            <th style="padding: 0.75rem; width: 150px;">Roll No</th>
                            <th style="padding: 0.75rem;">Student Name</th>
                            <th style="padding: 0.75rem; width: 150px; text-align: center;">
                                Absent
                                <div style="margin-top: 0.15rem; display: flex; justify-content: center; align-items: center;">
                                    <label style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; font-weight: normal; cursor: pointer; color: var(--text-muted); margin: 0;">
                                        <input type="checkbox" id="mst-bulk-absent" onchange="window.toggleMstBulkAbsent(this.checked)" style="width: auto; height: auto; margin: 0; cursor: pointer;">
                                        <span>All</span>
                                    </label>
                                </div>
                            </th>
                            <th style="padding: 0.75rem; width: 200px;">Marks Obtained</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          sortedStudents.length === 0
                            ? `
                            <tr>
                                <td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No students found in this section.</td>
                            </tr>
                        `
                            : sortedStudents
                                .map((st, idx) => {
                                  const rec = marksMap[st.id] || {};
                                  const marksVal =
                                    rec.marks !== undefined &&
                                    rec.marks !== null
                                      ? rec.marks
                                      : "";
                                  const isAbsentChecked = rec.is_absent
                                    ? "checked"
                                    : "";
                                  const inputDisabled = rec.is_absent
                                    ? "disabled"
                                    : "";
                                  return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 0.75rem;">${idx + 1}</td>
                                    <td style="padding: 0.75rem; font-weight: 600;">${st.roll_no}</td>
                                    <td style="padding: 0.75rem;">${st.name}</td>
                                    <td style="padding: 0.75rem; text-align: center;">
                                        <input type="checkbox" class="mst-absent-chk" data-student-id="${st.id}" ${isAbsentChecked} onchange="window.toggleMstAbsent(this, '${st.id}')" style="transform: scale(1.2); cursor: pointer;">
                                    </td>
                                    <td style="padding: 0.75rem;">
                                        <input type="number" class="mst-marks-input form-control" data-student-id="${st.id}" value="${marksVal}" ${inputDisabled} min="0" max="${maxMarks}" step="0.5" placeholder="Enter Marks" style="width: 120px; padding: 0.4rem; border: 1px solid var(--border); border-radius: 0.25rem;">
                                    </td>
                                </tr>
                            `;
                                })
                                .join("")
                        }
                    </tbody>
                </table>
            </div>
            
            ${
              sortedStudents.length > 0
                ? `
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button onclick="window.submitMstMarks()" class="btn-primary" style="padding: 0.75rem 2rem; font-size: 1rem; border-radius: 0.25rem; border: none; cursor: pointer;">
                        Save & Submit Marks
                    </button>
                </div>
            `
                : ""
            }
        </div>
    `;
};

window.toggleMstAbsent = (checkbox, studentId) => {
  const input = document.querySelector(
    `.mst-marks-input[data-student-id="${studentId}"]`,
  );
  if (input) {
    input.disabled = checkbox.checked;
    if (checkbox.checked) {
      input.value = "";
    }
  }
};

window.toggleMstBulkAbsent = (isChecked) => {
  const checkboxes = document.querySelectorAll(".mst-absent-chk");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    window.toggleMstAbsent(cb, cb.getAttribute("data-student-id"));
  });
};

window.submitMstMarks = async () => {
  const mst = document.getElementById("mst-entry-mst").value;
  const subjectId = document.getElementById("mst-entry-subject").value;

  const teacher = currentState.teacherData;
  const mySubjectIds = [
    ...new Set(
      currentState.timetable
        .filter(
          (t) =>
            t.teacher_id === teacher?.id ||
            (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
        )
        .map((t) => t.subject_id),
    ),
  ];
  if (!mySubjectIds.includes(subjectId)) {
    showToast("You are not authorized to save marks for this subject", "error");
    return;
  }

  const marksInputs = document.querySelectorAll(".mst-marks-input");
  const absentCheckboxes = document.querySelectorAll(".mst-absent-chk");

  const mstConfig = currentState.mstSettings.find(
    (s) => s.mst_name === mst,
  ) || { total_marks: 40 };
  const maxMarks = mstConfig.total_marks;

  const records = [];
  let isValid = true;

  marksInputs.forEach((input) => {
    const studentId = input.dataset.studentId;
    const checkbox = Array.from(absentCheckboxes).find(
      (c) => c.dataset.studentId === studentId,
    );
    const isAbsent = checkbox ? checkbox.checked : false;
    let marks = null;

    if (!isAbsent) {
      const val = input.value.trim();
      if (val === "") {
        showToast(
          "Please enter marks for all students or mark them as Absent",
          "error",
        );
        isValid = false;
        return;
      }
      marks = parseFloat(val);
      if (isNaN(marks) || marks < 0 || marks > maxMarks) {
        showToast(`Marks must be between 0 and ${maxMarks}`, "error");
        isValid = false;
        return;
      }
    }

    records.push({
      student_id: studentId,
      subject_id: subjectId,
      mst_name: mst,
      marks: marks,
      is_absent: isAbsent,
    });
  });

  if (!isValid) return;

  const { error } = await supabaseClient
    .from("mst_marks")
    .upsert(records, { onConflict: "student_id,subject_id,mst_name" });

  if (error) {
    showToast(`Error submitting marks: ${error.message}`, "error");
  } else {
    showToast("MST marks saved successfully!");
    await loadAllData();
    window.loadMstStudentList();
  }
};
window.renderMstSubjectMarks = async (container) => {
  const branches = ["IT", "DS"];
  const years = ["1st", "2nd", "3rd", "4th"];
  const sections = ["1", "2", "3", "4", "5"];

  const selectedBranch = localStorage.getItem("mst_view_selected_branch") || "";
  const selectedYear = localStorage.getItem("mst_view_selected_year") || "";
  const selectedSection =
    localStorage.getItem("mst_view_selected_section") || "";
  const selectedSubject =
    localStorage.getItem("mst_view_selected_subject") || "";
  let scheduledMstSlots = currentState.mstTimetable || [];
  if (selectedBranch) {
    scheduledMstSlots = scheduledMstSlots.filter(
      (t) =>
        t.classes?.branch === selectedBranch || t.branch === selectedBranch,
    );
  }
  if (selectedYear) {
    scheduledMstSlots = scheduledMstSlots.filter(
      (t) => t.classes?.year === selectedYear,
    );
  }
  if (selectedSection) {
    scheduledMstSlots = scheduledMstSlots.filter(
      (t) => t.classes?.section === selectedSection,
    );
  }
  const scheduledSubjectIds = scheduledMstSlots.map((t) => t.subject_id);
  const teacher = currentState.teacherData;
  const mySubjectIds = [
    ...new Set(
      currentState.timetable
        .filter(
          (t) =>
            t.teacher_id === teacher?.id ||
            (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
        )
        .map((t) => t.subject_id),
    ),
  ];
  const allowedSubjectIds = mySubjectIds.filter((id) =>
    scheduledSubjectIds.includes(id),
  );
  const filteredSubjects = currentState.subjects.filter((s) =>
    allowedSubjectIds.includes(s.id),
  );
  const finalSelectedSubject = filteredSubjects.some(
    (s) => s.id === selectedSubject,
  )
    ? selectedSubject
    : "";

  container.innerHTML = `
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow); margin-bottom: 2rem;">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 0.5rem 0;">View MST Marks</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0 0 1.5rem 0;">View student marks branch and section wise</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; align-items: end; margin-bottom: 1.5rem;">
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Branch</label>
                    <select id="mst-view-branch" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstViewFilters()">
                        <option value="" disabled selected>Select Branch</option>
                        ${branches.map((b) => `<option value="${b}" ${selectedBranch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Year</label>
                    <select id="mst-view-year" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstViewFilters()">
                        <option value="" disabled selected>Select Year</option>
                        ${years.map((y) => `<option value="${y}" ${selectedYear === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Section</label>
                    <select id="mst-view-section" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstViewFilters()">
                        <option value="" disabled selected>Select Section</option>
                        ${sections.map((s) => `<option value="${s}" ${selectedSection === s ? "selected" : ""}>${s}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Subject</label>
                    <select id="mst-view-subject" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveMstViewFilters()">
                        <option value="" disabled selected>${selectedBranch && selectedYear && selectedSection ? "Select Subject" : "Select Class First"}</option>
                        ${filteredSubjects.map((s) => `<option value="${s.id}" ${finalSelectedSubject === s.id ? "selected" : ""}>${s.name} (${s.code})</option>`).join("")}
                    </select>
                </div>
            </div>
            
            <div style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light);">
                            <th style="padding: 0.75rem;">Roll No</th>
                            <th style="padding: 0.75rem;">Name</th>
                            <th style="padding: 0.75rem;">Branch & Sec</th>
                            <th style="padding: 0.75rem;">Subject</th>
                            <th style="padding: 0.75rem; text-align: center;">MST-1</th>
                            <th style="padding: 0.75rem; text-align: center;">MST-2</th>
                        </tr>
                    </thead>
                    <tbody id="mst-subject-marks-tbody">
                    </tbody>
                </table>
            </div>
        </div>
    `;

  window.populateTeacherMstMarksTable(
    finalSelectedSubject,
    selectedBranch,
    selectedYear,
    selectedSection,
  );
};

window.saveMstViewFilters = () => {
  localStorage.setItem(
    "mst_view_selected_branch",
    document.getElementById("mst-view-branch").value,
  );
  localStorage.setItem(
    "mst_view_selected_year",
    document.getElementById("mst-view-year").value,
  );
  localStorage.setItem(
    "mst_view_selected_section",
    document.getElementById("mst-view-section").value,
  );

  const subjectEl = document.getElementById("mst-view-subject");
  localStorage.setItem(
    "mst_view_selected_subject",
    subjectEl ? subjectEl.value : "",
  );

  renderActiveView();
};

window.populateTeacherMstMarksTable = (subjectId, branch, year, section) => {
  const tbody = document.getElementById("mst-subject-marks-tbody");
  if (!tbody) return;

  if (!branch || !year || !section || !subjectId) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">Please select all class filters and subject to load marks.</td></tr>`;
    return;
  }

  const teacher = currentState.teacherData;
  const mySubjectIds = [
    ...new Set(
      currentState.timetable
        .filter(
          (t) =>
            t.teacher_id === teacher?.id ||
            (t.teacher_ids && t.teacher_ids.includes(teacher?.id)),
        )
        .map((t) => t.subject_id),
    ),
  ];
  const mySubjects = currentState.subjects.filter((s) =>
    mySubjectIds.includes(s.id),
  );
  if (!mySubjectIds.includes(subjectId)) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No authorized subject selected.</td></tr>`;
    return;
  }
  const studentsToDisplay = currentState.students.filter(
    (st) => st.branch === branch && st.year === year && st.section === section,
  );

  const rowsHtml = studentsToDisplay
    .map((st) => {
      const subjectsList = mySubjects.filter(
        (s) => s.id === subjectId && s.branch === st.branch,
      );

      return subjectsList
        .map((sub) => {
          const m1 = currentState.mstMarks.find(
            (m) =>
              m.student_id === st.id &&
              m.subject_id === sub.id &&
              m.mst_name === "mst-1",
          );
          const m2 = currentState.mstMarks.find(
            (m) =>
              m.student_id === st.id &&
              m.subject_id === sub.id &&
              m.mst_name === "mst-2",
          );

          const cfg1 = currentState.mstSettings.find(
            (c) => c.mst_name === "mst-1",
          ) || { total_marks: 40, passing_criteria: 12 };
          const cfg2 = currentState.mstSettings.find(
            (c) => c.mst_name === "mst-2",
          ) || { total_marks: 40, passing_criteria: 12 };

          const displayMark = (m, cfg) => {
            if (!m)
              return `<span style="color: var(--text-muted); font-weight: 500;">-</span>`;
            if (m.is_absent)
              return `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700;">Absent</span>`;
            const isBelow = m.marks < cfg.passing_criteria;
            const color = isBelow ? "#ef4444" : "#10b981";
            const weight = isBelow ? "700" : "600";
            return `<span style="color: ${color}; font-weight: ${weight};">${m.marks} / ${cfg.total_marks}</span>`;
          };

          return `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 0.75rem; font-weight: 600;">${st.roll_no}</td>
                    <td style="padding: 0.75rem;">${st.name}</td>
                    <td style="padding: 0.75rem;">${st.branch} · Sec ${st.section} (${st.year})</td>
                    <td style="padding: 0.75rem;">
                        <div style="font-weight: 600;">${sub.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${sub.code}</div>
                    </td>
                    <td style="padding: 0.75rem; text-align: center;">${displayMark(m1, cfg1)}</td>
                    <td style="padding: 0.75rem; text-align: center;">${displayMark(m2, cfg2)}</td>
                </tr>
            `;
        })
        .join("");
    })
    .join("");

  tbody.innerHTML =
    rowsHtml.trim() ||
    `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No MST marks found for the selected class.</td></tr>`;
};
window.renderMstTimetableTeacher = async (container) => {
  const { data: timetableData } = await supabaseClient
    .from("mst_timetable")
    .select("*, subjects(*), classes(*)");
  if (timetableData) {
    currentState.mstTimetable = timetableData;
  }

  const activeBranches = ["IT", "DS"];
  const years = ["1st", "2nd", "3rd", "4th"];
  const sections = ["1", "2", "3", "4", "5"];
  let defaultBranch = "";
  let defaultYear = "";
  let defaultSection = "";

  const teacher = currentState.teacherData;
  if (teacher && teacher.coordinator_class) {
    const coordClass = currentState.classes.find(
      (c) => c.id === teacher.coordinator_class,
    );
    if (coordClass) {
      defaultBranch = coordClass.branch || "";
      defaultYear = coordClass.year || "";
      defaultSection = coordClass.section || "";
    }
  }

  const selectedBranch =
    localStorage.getItem("teacher_mst_tt_branch") || defaultBranch;
  const selectedYear =
    localStorage.getItem("teacher_mst_tt_year") || defaultYear;
  const selectedSection =
    localStorage.getItem("teacher_mst_tt_section") || defaultSection;
  let filteredTt = currentState.mstTimetable || [];
  if (selectedBranch) {
    filteredTt = filteredTt.filter(
      (t) => (t.classes?.branch || t.branch) === selectedBranch,
    );
  }
  if (selectedYear) {
    filteredTt = filteredTt.filter((t) => t.classes?.year === selectedYear);
  }
  if (selectedSection) {
    filteredTt = filteredTt.filter(
      (t) => t.classes?.section === selectedSection,
    );
  }

  container.innerHTML = `
        <div style="padding: 1.5rem; background: #ffffff; border-radius: 0.75rem; box-shadow: var(--shadow);">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 0.5rem 0;">MST Exam Timetable</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0 0 1.5rem 0;">View schedules for MST exams branch and section wise</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; align-items: end;">
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Branch</label>
                    <select id="teacher-mst-tt-branch" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveTeacherMstFilters()">
                        <option value="">All Branches</option>
                        ${activeBranches.map((b) => `<option value="${b}" ${selectedBranch === b ? "selected" : ""}>${b}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Year</label>
                    <select id="teacher-mst-tt-year" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveTeacherMstFilters()">
                        <option value="">All Years</option>
                        ${years.map((y) => `<option value="${y}" ${selectedYear === y ? "selected" : ""}>${y}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Section</label>
                    <select id="teacher-mst-tt-section" class="form-control" style="width: 100%; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid var(--border);" onchange="window.saveTeacherMstFilters()">
                        <option value="">All Sections</option>
                        ${sections.map((s) => `<option value="${s}" ${selectedSection === s ? "selected" : ""}>${s}</option>`).join("")}
                    </select>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light);">
                            <th style="padding: 0.75rem;">MST</th>
                            <th style="padding: 0.75rem;">Class</th>
                            <th style="padding: 0.75rem;">Subject</th>
                            <th style="padding: 0.75rem;">Date</th>
                            <th style="padding: 0.75rem;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          filteredTt.length === 0
                            ? `
                            <tr>
                                <td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No MST exams scheduled matching filters.</td>
                            </tr>
                        `
                            : filteredTt
                                .map((t) => {
                                  const classText = t.classes
                                    ? `${t.classes.branch} ${t.classes.year} Sec ${t.classes.section}`
                                    : t.branch || "";
                                  return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 0.75rem; font-weight: 600; text-transform: uppercase;">${t.mst_name}</td>
                                    <td style="padding: 0.75rem;">${classText}</td>
                                    <td style="padding: 0.75rem;">
                                        <div style="font-weight: 600;">${t.subjects?.name || "Unknown Subject"}</div>
                                        <div style="font-size: 0.8rem; color: var(--text-muted);">${t.subjects?.code || ""}</div>
                                    </td>
                                    <td style="padding: 0.75rem;">${new Date(t.exam_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                    <td style="padding: 0.75rem;">${window.convert24to12(t.start_time)} - ${window.convert24to12(t.end_time)}</td>
                                </tr>
                            `;
                                })
                                .join("")
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

window.saveTeacherMstFilters = () => {
  localStorage.setItem(
    "teacher_mst_tt_branch",
    document.getElementById("teacher-mst-tt-branch").value,
  );
  localStorage.setItem(
    "teacher_mst_tt_year",
    document.getElementById("teacher-mst-tt-year").value,
  );
  localStorage.setItem(
    "teacher_mst_tt_section",
    document.getElementById("teacher-mst-tt-section").value,
  );
  renderActiveView();
};
window.switchCoordMstTab = async (mstName) => {
  const area = document.getElementById("coord-mst-content-area");
  if (!area) return;

  const btn1 = document.getElementById("coord-mst-btn-mst-1");
  const btn2 = document.getElementById("coord-mst-btn-mst-2");
  if (btn1 && btn2) {
    if (mstName === "mst-1") {
      btn1.style.background = "#003366";
      btn1.style.color = "#ffffff";
      btn1.style.border = "none";
      btn2.style.background = "none";
      btn2.style.color = "var(--text-muted)";
      btn2.style.border = "1px solid var(--border)";
    } else {
      btn2.style.background = "#003366";
      btn2.style.color = "#ffffff";
      btn2.style.border = "none";
      btn1.style.background = "none";
      btn1.style.color = "var(--text-muted)";
      btn1.style.border = "1px solid var(--border)";
    }
  }

  area.innerHTML = `
        <div style="display:flex; justify-content:center; padding: 1.5rem;">
            <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  const teacher = currentState.teacherData;
  let coordClass = teacher?.coordinator_class
    ? currentState.classes.find((c) => c.id === teacher.coordinator_class)
    : null;
  if (!coordClass) return;

  const { data: students } = await supabaseClient
    .from("students")
    .select("*")
    .eq("branch", coordClass.branch)
    .eq("year", coordClass.year)
    .eq("section", coordClass.section);

  const sortedStudents = (students || []).sort((a, b) =>
    compareRollNumbers(a.roll_no || "", b.roll_no || ""),
  );
  const studentIds = sortedStudents.map((s) => s.id);

  if (studentIds.length === 0) {
    area.innerHTML = `<p style="color: var(--text-muted);">No students found in this section.</p>`;
    return;
  }

  const subjects = currentState.subjects.filter(
    (s) => s.branch === coordClass.branch,
  );

  const { data: marksData } = await supabaseClient
    .from("mst_marks")
    .select("*")
    .eq("mst_name", mstName)
    .in("student_id", studentIds);

  const marksMap = {};
  (marksData || []).forEach((r) => {
    if (!marksMap[r.student_id]) marksMap[r.student_id] = {};
    marksMap[r.student_id][r.subject_id] = r;
  });

  const mstConfig = currentState.mstSettings.find(
    (s) => s.mst_name === mstName,
  ) || { total_marks: 40, passing_criteria: 12 };
  const passingCriteria = mstConfig.passing_criteria;

  const defaulters = [];
  sortedStudents.forEach((st) => {
    subjects.forEach((sub) => {
      const mRecord = marksMap[st.id]?.[sub.id];
      const isAbsent = mRecord?.is_absent;
      const marks = mRecord?.marks;
      const isBelow =
        isAbsent ||
        (marks !== undefined && marks !== null && marks < passingCriteria);
      if (isBelow) {
        defaulters.push({
          student: st,
          subject: sub,
          marks: isAbsent ? "Absent" : marks,
        });
      }
    });
  });

  area.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; align-items: stretch;">
            <div style="min-width: 0;">
                <h4 style="font-weight: 700; color: var(--primary); margin: 0 0 0.75rem 0;">All Students Marks Sheet</h4>
                <div style="overflow-x: auto; max-height: 400px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
                    <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light); position: sticky; top: 0; z-index: 1;">
                                <th style="padding: 0.5rem;">Roll No</th>
                                <th style="padding: 0.5rem;">Name</th>
                                ${subjects.map((s) => `<th style="padding: 0.5rem; text-align: center;" title="${s.name}">${s.code}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedStudents
                              .map(
                                (st) => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 0.5rem; font-weight: 600;">${st.roll_no}</td>
                                    <td style="padding: 0.5rem;">${st.name}</td>
                                    ${subjects
                                      .map((sub) => {
                                        const mRecord =
                                          marksMap[st.id]?.[sub.id];
                                        if (!mRecord)
                                          return `<td style="padding: 0.5rem; text-align: center; color: var(--text-muted);">-</td>`;
                                        if (mRecord.is_absent)
                                          return `<td style="padding: 0.5rem; text-align: center; color: #ef4444; font-weight: 700;">Ab</td>`;
                                        const isBelow =
                                          mRecord.marks < passingCriteria;
                                        const color = isBelow
                                          ? "#ef4444"
                                          : "#10b981";
                                        return `<td style="padding: 0.5rem; text-align: center; color: ${color}; font-weight: ${isBelow ? "800" : "600"};">${mRecord.marks}</td>`;
                                      })
                                      .join("")}
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div style="border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02); border-radius: var(--radius-sm); padding: 1rem;">
                <h4 style="font-weight: 700; color: #ef4444; margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.25rem;">
                    <i data-lucide="alert-triangle" style="width: 18px; height: 18px;"></i> Defaulters (Marks < ${passingCriteria})
                </h4>
                <div style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
                    ${
                      defaulters.length === 0
                        ? `
                        <p style="color: var(--text-muted); font-size: 0.85rem;">All students meet the passing criteria! 🎉</p>
                    `
                        : defaulters
                            .map(
                              (d) => `
                        <div style="padding: 0.5rem; background: #ffffff; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 0.25rem; font-size: 0.8rem;">
                            <div style="font-weight: 700; color: var(--text-main);">${d.student.name} (${d.student.roll_no})</div>
                            <div style="color: var(--text-muted); margin-top: 0.2rem;">
                                Subject: <strong style="color: var(--primary);">${d.subject.code}</strong> · Marks: <strong style="color: #ef4444;">${d.marks}</strong>
                            </div>
                        </div>
                    `,
                            )
                            .join("")
                    }
                </div>
            </div>
        </div>
    `;
  lucide.createIcons();
};
window.loadStudentMstMarks = async () => {
  const area = document.getElementById("student-mst-marks-area");
  if (!area) return;

  area.innerHTML = `
        <div style="display:flex; justify-content:center; padding: 2rem;">
            <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  const student = currentState.studentData;

  const { data: marks, error } = await supabaseClient
    .from("mst_marks")
    .select("*, subjects(*)")
    .eq("student_id", student.id);

  if (error) {
    area.innerHTML = `<p style="color: var(--error);">Error loading marks: ${error.message}</p>`;
    return;
  }

  const { data: configs } = await supabaseClient
    .from("mst_settings")
    .select("*");
  const settings = configs || [];

  const scheduledSubjectIds = currentState.mstTimetable
    .filter(
      (t) =>
        (t.classes?.branch === student.branch || t.branch === student.branch) &&
        t.classes?.year === student.year &&
        t.classes?.section === student.section,
    )
    .map((t) => t.subject_id);

  const subjects = currentState.subjects.filter(
    (s) => s.branch === student.branch && scheduledSubjectIds.includes(s.id),
  );

  const getMstDetail = (subId, mstName) => {
    const m = (marks || []).find(
      (x) => x.subject_id === subId && x.mst_name === mstName,
    );
    const cfg = settings.find((c) => c.mst_name === mstName) || {
      total_marks: 40,
      passing_criteria: 12,
    };
    if (!m)
      return {
        html: `<span style="color: var(--text-muted); font-weight: 500;">Not Marked</span>`,
        below: false,
      };
    if (m.is_absent)
      return {
        html: `<span style="color: #ef4444; font-weight: 700;">Absent</span>`,
        below: true,
        criteria: cfg.passing_criteria,
      };
    const isBelow = m.marks < cfg.passing_criteria;
    const color = isBelow ? "#ef4444" : "#10b981";
    return {
      html: `<span style="color: ${color}; font-weight: 700; font-size: 1.1rem;">${m.marks}</span> <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${cfg.total_marks}</span>`,
      below: isBelow,
      criteria: cfg.passing_criteria,
    };
  };

  area.innerHTML = `
        <div style="background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 1rem; padding: 2rem; box-shadow: var(--shadow);">
            <h3 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 1.5rem 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">My Mid-Semester Exam Marks</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
                ${
                  subjects.length === 0
                    ? `<p style="color: var(--text-muted);">No subjects found for your branch.</p>`
                    : subjects
                        .map((sub) => {
                          const mst1Info = getMstDetail(sub.id, "mst-1");
                          const mst2Info = getMstDetail(sub.id, "mst-2");
                          return `
                        <div style="border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem; background: var(--bg-light); display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <h4 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0 0 0.25rem 0;">${sub.name}</h4>
                                <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 0.25rem; text-transform: uppercase;">${sub.code}</span>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 1rem;">
                                <div style="border-right: 1px solid rgba(0,0,0,0.05); padding-right: 0.5rem;">
                                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem;">MST-1</div>
                                    <div>${mst1Info.html}</div>
                                    ${mst1Info.below ? `<div style="font-size: 0.7rem; color: #ef4444; font-weight: 600; margin-top: 0.25rem;">⚠️ Below criteria (${mst1Info.criteria})</div>` : ""}
                                </div>
                                <div style="padding-left: 0.5rem;">
                                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem;">MST-2</div>
                                    <div>${mst2Info.html}</div>
                                    ${mst2Info.below ? `<div style="font-size: 0.7rem; color: #ef4444; font-weight: 600; margin-top: 0.25rem;">⚠️ Below criteria (${mst2Info.criteria})</div>` : ""}
                                </div>
                            </div>
                        </div>
                    `;
                        })
                        .join("")
                }
            </div>
        </div>
    `;
};
window.loadStudentMstTimetable = async () => {
  const area = document.getElementById("student-mst-timetable-area");
  if (!area) return;

  area.innerHTML = `
        <div style="display:flex; justify-content:center; padding: 2rem;">
            <div style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  const student = currentState.studentData;

  const { data: ttData, error } = await supabaseClient
    .from("mst_timetable")
    .select("*, subjects(*)")
    .eq("branch", student.branch);

  if (error) {
    area.innerHTML = `<p style="color: var(--error);">Error loading timetable: ${error.message}</p>`;
    return;
  }

  const sortedTt = (ttData || []).sort((a, b) => {
    const diffDate = new Date(a.exam_date) - new Date(b.exam_date);
    if (diffDate !== 0) return diffDate;
    return a.start_time.localeCompare(b.start_time);
  });

  area.innerHTML = `
        <div style="background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 1rem; padding: 2rem; box-shadow: var(--shadow);">
            <h3 style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0 0 1.5rem 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">MST Exam Timetable (${student.branch})</h3>
            
            <div style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); background: var(--bg-light);">
                            <th style="padding: 0.75rem;">MST</th>
                            <th style="padding: 0.75rem;">Subject</th>
                            <th style="padding: 0.75rem;">Date</th>
                            <th style="padding: 0.75rem;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          sortedTt.length === 0
                            ? `
                            <tr>
                                <td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No MST timetable set for branch ${student.branch}.</td>
                            </tr>
                        `
                            : sortedTt
                                .map(
                                  (t) => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem; font-weight: 700; text-transform: uppercase;">${t.mst_name}</td>
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 600;">${t.subjects?.name || "Unknown Subject"}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">${t.subjects?.code || ""}</div>
                                </td>
                                <td style="padding: 0.75rem;">${new Date(t.exam_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                <td style="padding: 0.75rem;">${t.start_time?.substring(0, 5)} - ${t.end_time?.substring(0, 5)}</td>
                            </tr>
                        `,
                                )
                                .join("")
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

window.renderHodDashboard = async (container) => {
  container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 4rem 0;">
            <div class="loader" style="width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
    `;

  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
    currentState.hodDept = activeDept;
  }
  const deptBranches =
    activeDept === "IT"
      ? ["IT", "DS"]
      : activeDept === "CS"
        ? ["CS"]
        : ["CSIT"];

  const filteredStudents = currentState.students.filter((s) =>
    deptBranches.includes(s.branch),
  );
  const filteredTeachers = currentState.teachers.filter(
    (t) => t.department === activeDept,
  );
  const filteredClasses = currentState.classes.filter((cl) =>
    deptBranches.includes(cl.branch),
  );
  const classIds = filteredClasses.map((c) => c.id);

  const todayStr = new Date().toISOString().split("T")[0];
  const deptStudentIds = filteredStudents.map((s) => s.id);
  let todayRecords = [];
  let cumulativeRecords = [];

  try {
    if (deptStudentIds.length > 0) {
      const [todayRes, cumRes] = await Promise.all([
        supabaseClient
          .from("attendance_records")
          .select("*")
          .eq("date", todayStr)
          .in("student_id", deptStudentIds),
        supabaseClient
          .from("attendance_records")
          .select("status, class_id, subject_id")
          .in("student_id", deptStudentIds),
      ]);
      todayRecords = todayRes.data || [];
      cumulativeRecords = cumRes.data || [];
    }
  } catch (err) {
    console.error("Error fetching HOD stats:", err);
  }

  const totalToday = todayRecords.length;
  const presentToday = todayRecords.filter(
    (r) => r.status === "Present",
  ).length;

  let todayPct = "0.0";
  if (totalToday > 0) {
    todayPct = ((presentToday / totalToday) * 100).toFixed(1);
  } else if (cumulativeRecords.length > 0) {
    const cumPresent = cumulativeRecords.filter(
      (r) => r.status === "Present",
    ).length;
    todayPct = ((cumPresent / cumulativeRecords.length) * 100).toFixed(1);
  } else {
    todayPct = "85.5";
  }
  const sectionLabels = filteredClasses.map(
    (cl) => `${cl.branch} ${cl.year}-${cl.section}`,
  );
  const sectionAttendance = filteredClasses.map((cl) => {
    const clRecords = cumulativeRecords.filter((r) => r.class_id === cl.id);
    if (clRecords.length > 0) {
      const pres = clRecords.filter((r) => r.status === "Present").length;
      return Math.round((pres / clRecords.length) * 100);
    } else {
      return 85;
    }
  });
  const subjectsInDept = currentState.subjects
    .filter((sub) => {
      return currentState.timetable.some(
        (t) => t.subject_id === sub.id && classIds.includes(t.class_id),
      );
    })
    .slice(0, 6);
  const subLabels = subjectsInDept.map((s) => s.code);
  const subAttendance = subjectsInDept.map((sub) => {
    const subRecords = cumulativeRecords.filter((r) => r.subject_id === sub.id);
    if (subRecords.length > 0) {
      const pres = subRecords.filter((r) => r.status === "Present").length;
      return Math.round((pres / subRecords.length) * 100);
    } else {
      return 85;
    }
  });
  const currentAchievements = [];
  filteredStudents.forEach((s) => {
    if (
      s.achievements &&
      Array.isArray(s.achievements) &&
      s.achievements.length > 0
    ) {
      s.achievements.forEach((a) => {
        let bg = "rgba(59,130,246,0.08)";
        let badgeColor = "#3b82f6";
        if (a.type === "Open Source" || a.type === "Internship") {
          bg = "rgba(16,185,129,0.08)";
          badgeColor = "#10b981";
        } else if (a.type === "Placement" || a.type === "Entrepreneurship") {
          bg = "rgba(249,115,22,0.08)";
          badgeColor = "#f97316";
        } else if (a.type === "Design") {
          bg = "rgba(236,72,153,0.08)";
          badgeColor = "#ec4899";
        } else if (a.type === "Research" || a.type === "Academics") {
          bg = "rgba(100,116,139,0.08)";
          badgeColor = "#64748b";
        } else if (a.type === "Development") {
          bg = "rgba(139,92,246,0.08)";
          badgeColor = "#8b5cf6";
        }

        currentAchievements.push({
          student: `${s.name} (${s.branch} ${s.year || "4th"} Year)`,
          desc: a.name || "Achievement",
          tag: a.type || "Award",
          badgeColor: badgeColor,
          bg: bg,
        });
      });
    }
  });
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THUR", "FRI", "SAT"];
  const todayDay = daysOfWeek[new Date().getDay()];
  const deptSlots = currentState.timetable
    .filter((t) => classIds.includes(t.class_id))
    .map((t) => {
      const classInfo = currentState.classes.find((cl) => cl.id === t.class_id);
      const className = classInfo
        ? `${classInfo.branch} ${classInfo.year}-${classInfo.section}`
        : "Class";
      const branchName = classInfo ? classInfo.branch : "Unknown";
      const subjectCode =
        currentState.subjects.find((sub) => sub.id === t.subject_id)?.code ||
        "SUB";
      const teacherName =
        currentState.teachers.find((tch) => tch.id === t.teacher_id)?.name ||
        "Faculty";
      return { ...t, className, branchName, subjectCode, teacherName };
    });

  const groupedTimetable = {};
  deptSlots.forEach((s) => {
    const b = s.branchName;
    const c = s.className;
    if (!groupedTimetable[b]) {
      groupedTimetable[b] = {};
    }
    if (!groupedTimetable[b][c]) {
      groupedTimetable[b][c] = [];
    }
    groupedTimetable[b][c].push(s);
  });
  const deptMstTimetable = currentState.mstTimetable.filter((t) =>
    classIds.includes(t.class_id),
  );
  const mstSubjectIds = [...new Set(deptMstTimetable.map((t) => t.subject_id))];
  const scheduledSubjects = currentState.subjects.filter((s) =>
    mstSubjectIds.includes(s.id),
  );

  const mstSubjectLabels = [];
  const mst1Averages = [];
  const mst2Averages = [];

  scheduledSubjects.forEach((sub) => {
    mstSubjectLabels.push(sub.name);

    const subjectMstMarks = currentState.mstMarks.filter(
      (m) =>
        m.subject_id === sub.id &&
        !m.is_absent &&
        filteredStudents.some((s) => s.id === m.student_id),
    );

    const mst1Marks = subjectMstMarks.filter((m) => m.exam_type === "mst1");
    const mst2Marks = subjectMstMarks.filter((m) => m.exam_type === "mst2");

    const m1Avg =
      mst1Marks.length > 0
        ? (
            mst1Marks.reduce((sum, m) => sum + (m.marks || 0), 0) /
            mst1Marks.length
          ).toFixed(1)
        : 0;
    const m2Avg =
      mst2Marks.length > 0
        ? (
            mst2Marks.reduce((sum, m) => sum + (m.marks || 0), 0) /
            mst2Marks.length
          ).toFixed(1)
        : 0;

    mst1Averages.push(parseFloat(m1Avg));
    mst2Averages.push(parseFloat(m2Avg));
  });

  container.innerHTML = `
        <div class="academic-header-bar" style="border: none; background: transparent; padding: 1.5rem 0 0.5rem 0; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: none;">
            <div class="academic-header-welcome" style="display: flex; flex-direction: column; gap: 0.25rem;">
                <h2 style="font-size: 1.85rem; font-weight: 800; color: #0f172a; margin: 0;">Department HOD Panel 👋</h2>
                <p style="font-size: 0.9rem; color: #64748b; margin: 0; font-weight: 500;">
                    Review section-wise attendance, timetable allocations, exam marks, and accomplishments for ${activeDept}.
                </p>
            </div>
            <div class="academic-header-actions" style="margin-top: 0.5rem;">
                <div id="cyber-live-clock" style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); width: auto;">
                    Loading...
                </div>
            </div>
        </div>

        ${
          !currentState.teacherData || !currentState.teacherData.is_hod
            ? `
        <div style="display: flex; gap: 0.5rem; background: rgba(0,0,0,0.02); padding: 0.35rem; border-radius: 12px; border: 1px solid var(--border); width: fit-content; margin-bottom: 2rem;">
            <button onclick="window.currentState.hodDept = 'IT'; window.renderHodDashboard(document.getElementById('main-content'));" 
                    style="padding: 0.55rem 1.25rem; border-radius: 8px; border: none; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.25s;
                    background: ${activeDept === "IT" ? "var(--primary)" : "transparent"}; 
                    color: ${activeDept === "IT" ? "#ffffff" : "var(--text-muted)"};
                    box-shadow: ${activeDept === "IT" ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "none"};">
                Information Technology (IT)
            </button>
            <button onclick="window.currentState.hodDept = 'CS'; window.renderHodDashboard(document.getElementById('main-content'));" 
                    style="padding: 0.55rem 1.25rem; border-radius: 8px; border: none; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.25s;
                    background: ${activeDept === "CS" ? "var(--primary)" : "transparent"}; 
                    color: ${activeDept === "CS" ? "#ffffff" : "var(--text-muted)"};
                    box-shadow: ${activeDept === "CS" ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "none"};">
                Computer Science (CSE)
            </button>
            <button onclick="window.currentState.hodDept = 'CSIT'; window.renderHodDashboard(document.getElementById('main-content'));" 
                    style="padding: 0.55rem 1.25rem; border-radius: 8px; border: none; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.25s;
                    background: ${activeDept === "CSIT" ? "var(--primary)" : "transparent"}; 
                    color: ${activeDept === "CSIT" ? "#ffffff" : "var(--text-muted)"};
                    box-shadow: ${activeDept === "CSIT" ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "none"};">
                CS & IT (CSIT)
            </button>
        </div>
        `
            : ""
        }
        <div class="dashboard-grid-row" style="margin-bottom: 2rem;">
            <div class="academic-stat-card" onclick="window.showHodStudentsModal()" style="cursor: pointer; transition: transform 0.2s, box-shadow: 0 4px 20px rgba(0,0,0,0.05);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                <div class="card-top">
                    <div class="card-icon-wrapper students">
                        <i data-lucide="users" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Students</div>
                        <div class="card-value">${filteredStudents.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>+1.2% <span style="font-weight: 500; color: #94a3b8;">vs last month</span></span>
                </div>
            </div>
            <div class="academic-stat-card" onclick="window.showHodFacultyModal()" style="cursor: pointer; transition: transform 0.2s, box-shadow: 0 4px 20px rgba(0,0,0,0.05);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                <div class="card-top">
                    <div class="card-icon-wrapper teachers">
                        <i data-lucide="graduation-cap" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Faculty</div>
                        <div class="card-value">${filteredTeachers.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>Stable <span style="font-weight: 500; color: #94a3b8;">active staff</span></span>
                </div>
            </div>
            <div class="academic-stat-card" onclick="window.showHodSectionsModal()" style="cursor: pointer; transition: transform 0.2s, box-shadow: 0 4px 20px rgba(0,0,0,0.05);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                <div class="card-top">
                    <div class="card-icon-wrapper classes">
                        <i data-lucide="book" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Total Sections</div>
                        <div class="card-value">${filteredClasses.length}</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>Active <span style="font-weight: 500; color: #94a3b8;">timetable streams</span></span>
                </div>
            </div>
            <div class="academic-stat-card">
                <div class="card-top">
                    <div class="card-icon-wrapper attendance">
                        <i data-lucide="pie-chart" style="width: 26px; height: 26px;"></i>
                    </div>
                    <div class="card-info">
                        <div class="card-label">Avg Attendance</div>
                        <div class="card-value">${todayPct}%</div>
                    </div>
                </div>
                <div class="card-trend" style="margin-top: 0.5rem; margin-bottom: 2rem;">
                    <i data-lucide="trending-up" style="width: 14px; height: 14px; color: #10b981;"></i>
                    <span>Target >75% <span style="font-weight: 500; color: #94a3b8;">maintained</span></span>
                </div>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
            <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Section-wise Attendance</h3>
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">Today's Attendance Rate (%)</span>
                </div>
                <div style="height: 220px; position: relative; width: 100%;">
                    <canvas id="hod-section-chart"></canvas>
                </div>
            </div>
            <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Subject-wise Attendance</h3>
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">Lecture-wise Attendance Rate (%)</span>
                </div>
                <div style="height: 220px; position: relative; width: 100%;">
                    <canvas id="hod-subject-chart"></canvas>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; margin-bottom: 2rem; align-items: stretch;">
            <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0; height: 100%;">
                <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Section Timetables & Classes</h3>
                <div style="overflow-y: auto; max-height: 450px; display: flex; flex-direction: column; gap: 1.5rem; padding-right: 0.25rem;">
                    ${
                      Object.keys(groupedTimetable).length > 0
                        ? Object.keys(groupedTimetable)
                            .map(
                              (branch) => `
                        <div style="border: 1px solid var(--border); border-radius: 8px; padding: 1rem; background: var(--bg-dark);">
                            <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--primary); margin: 0 0 1rem 0; border-bottom: 2px solid var(--border); padding-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem; text-transform: uppercase; letter-spacing: 0.02em;">
                                <i data-lucide="folder" style="width: 14px; height: 14px;"></i> ${branch} Stream
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                ${Object.keys(groupedTimetable[branch])
                                  .map(
                                    (section) => `
                                    <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem;">
                                        <h5 style="font-size: 0.8rem; font-weight: 700; color: var(--text-main); margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.4rem;">
                                            <i data-lucide="layers" style="width: 13px; height: 13px; color: var(--accent);"></i> ${section}
                                        </h5>
                                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.78rem;">
                                            <thead>
                                                <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 600;">
                                                    <th style="padding: 0.4rem 0.25rem;">Subject</th>
                                                    <th style="padding: 0.4rem 0.25rem;">Teacher</th>
                                                    <th style="padding: 0.4rem 0.25rem;">Timings</th>
                                                    <th style="padding: 0.4rem 0.25rem;">Day</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${groupedTimetable[branch][
                                                  section
                                                ]
                                                  .map(
                                                    (s) => `
                                                    <tr style="border-bottom: 1px dashed var(--border); color: var(--text-main);">
                                                        <td style="padding: 0.5rem 0.25rem; font-weight: 700; color: var(--primary);">${s.subjectCode}</td>
                                                        <td style="padding: 0.5rem 0.25rem; color: var(--text-muted);">${s.teacherName}</td>
                                                        <td style="padding: 0.5rem 0.25rem; font-family: monospace;">${formatDbTime(s.start_time)} - ${formatDbTime(s.end_time)}</td>
                                                        <td style="padding: 0.5rem 0.25rem;"><span style="font-size: 0.65rem; color: var(--text-muted); background: var(--border); padding: 0.1rem 0.3rem; border-radius: 3px; font-weight: 600;">${s.day_of_week}</span></td>
                                                    </tr>
                                                `,
                                                  )
                                                  .join("")}
                                            </tbody>
                                        </table>
                                    </div>
                                `,
                                  )
                                  .join("")}
                            </div>
                        </div>
                    `,
                            )
                            .join("")
                        : `
                        <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-style: italic;">
                            No timetable slots scheduled for this department scope.
                        </div>
                    `
                    }
                </div>
            </div>
            <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                        <i data-lucide="award" style="width: 16px; height: 16px; color: var(--accent);"></i>
                        Student Achievements
                    </h3>
                    <button onclick="window.showHodAchievementsModal()" style="background:transparent; border:1px solid var(--border); border-radius:6px; color:var(--text-main); font-size:0.75rem; padding:0.3rem 0.75rem; cursor:pointer; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-dark)'" onmouseout="this.style.background='transparent'">View All</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.75rem; flex: 1; justify-content: ${currentAchievements.length > 0 ? "flex-start" : "center"};">
                    ${
                      currentAchievements.length > 0
                        ? currentAchievements
                            .slice(0, 4)
                            .map(
                              (ac) => `
                        <div style="border: 1px solid var(--border); padding: 0.85rem; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.01);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <span style="font-weight: 700; font-size: 0.8rem; color: var(--text-main);">${ac.student}</span>
                                <span style="font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px; background: ${ac.bg}; color: ${ac.badgeColor};">${ac.tag}</span>
                            </div>
                            <p style="font-size: 0.76rem; color: var(--text-muted); margin: 0; line-height: 1.3;">${ac.desc}</p>
                        </div>
                    `,
                            )
                            .join("")
                        : `
                        <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; font-style: italic;">
                            No student achievements recorded by the coordinator yet.
                        </div>
                    `
                    }
                </div>
            </div>
        </div>
        <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0;">Subject-wise MST Performance</h3>
                <button onclick="window.showHodMstDetailsModal()" style="background:transparent; border:1px solid var(--border); border-radius:6px; color:var(--text-main); font-size:0.75rem; padding:0.3rem 0.75rem; cursor:pointer; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-dark)'" onmouseout="this.style.background='transparent'">View Details</button>
            </div>
            <div style="height: 200px; position: relative; width: 100%;">
                <canvas id="hod-mst-chart"></canvas>
            </div>
        </div>
    `;

  lucide.createIcons();
  startLiveClock();

  setTimeout(() => {
    const sCtx = document.getElementById("hod-section-chart");
    if (sCtx) {
      new Chart(sCtx.getContext("2d"), {
        type: "bar",
        data: {
          labels:
            sectionLabels.length > 0
              ? sectionLabels
              : ["Sec A", "Sec B", "Sec C"],
          datasets: [
            {
              label: "Attendance Rate (%)",
              data:
                sectionAttendance.length > 0 ? sectionAttendance : [92, 94, 88],
              backgroundColor: "rgba(59, 130, 246, 0.65)",
              borderColor: "#3b82f6",
              borderWidth: 1.5,
              borderRadius: 6,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, ticks: { font: { size: 9 } } },
            x: { ticks: { font: { size: 9 } } },
          },
        },
      });
    }

    const subCtx = document.getElementById("hod-subject-chart");
    if (subCtx) {
      new Chart(subCtx.getContext("2d"), {
        type: "line",
        data: {
          labels:
            subLabels.length > 0
              ? subLabels
              : ["SUB1", "SUB2", "SUB3", "SUB4", "SUB5"],
          datasets: [
            {
              label: "Attendance Rate (%)",
              data: subAttendance,
              borderColor: "#10b981",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderWidth: 2,
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, ticks: { font: { size: 9 } } },
            x: { ticks: { font: { size: 9 } } },
          },
        },
      });
    }

    const mstCtx = document.getElementById("hod-mst-chart");
    if (mstCtx) {
      new Chart(mstCtx.getContext("2d"), {
        type: "bar",
        data: {
          labels:
            mstSubjectLabels.length > 0 ? mstSubjectLabels : ["Sub 1", "Sub 2"],
          datasets: [
            {
              label: "MST 1 Avg",
              data: mstSubjectLabels.length > 0 ? mst1Averages : [14, 15],
              backgroundColor: "rgba(59, 130, 246, 0.7)",
              borderColor: "#3b82f6",
              borderWidth: 1.5,
              borderRadius: 4,
            },
            {
              label: "MST 2 Avg",
              data: mstSubjectLabels.length > 0 ? mst2Averages : [16, 14],
              backgroundColor: "rgba(249, 115, 22, 0.7)",
              borderColor: "#f97316",
              borderWidth: 1.5,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: { boxWidth: 12, font: { size: 10 } },
            },
          },
          scales: {
            y: { min: 0, max: 20, ticks: { font: { size: 9 } } },
            x: { ticks: { font: { size: 9 } } },
          },
        },
      });
    }
  }, 100);
};

window.showHodStudentsModal = () => {
  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
  }
  const deptBranches =
    activeDept === "IT"
      ? ["IT", "DS"]
      : activeDept === "CS"
        ? ["CS"]
        : ["CSIT"];
  const deptStudents = currentState.students.filter((s) =>
    deptBranches.includes(s.branch),
  );

  const content = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 700;">
                        <th style="padding: 0.75rem 0.5rem;">Roll Number</th>
                        <th style="padding: 0.75rem 0.5rem;">Name</th>
                        <th style="padding: 0.75rem 0.5rem;">Branch</th>
                        <th style="padding: 0.75rem 0.5rem;">Year</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      deptStudents.length > 0
                        ? deptStudents
                            .map(
                              (s) => `
                        <tr style="border-bottom: 1px solid var(--border);">
                            <td style="padding: 0.75rem 0.5rem; font-family: monospace; font-weight: 600; color: var(--text-main);">${s.roll_no || "-"}</td>
                            <td style="padding: 0.75rem 0.5rem; color: var(--text-main); font-weight: 500;">${s.name || "-"}</td>
                            <td style="padding: 0.75rem 0.5rem; color: var(--text-muted); font-weight: 600;">${s.branch || "-"}</td>
                            <td style="padding: 0.75rem 0.5rem; color: var(--text-muted);">${s.year || "1st"} Year</td>
                        </tr>
                    `,
                            )
                            .join("")
                        : `
                        <tr>
                            <td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">No students registered in this department scope.</td>
                        </tr>
                    `
                    }
                </tbody>
            </table>
        </div>
    `;

  showModal(
    `Students List — ${activeDept} Department (${deptStudents.length})`,
    content,
    null,
    { hideConfirm: true },
  );
};

window.showHodFacultyModal = () => {
  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
  }
  const deptFaculty = currentState.teachers.filter(
    (t) => t.department === activeDept,
  );

  const content = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 700;">
                        <th style="padding: 0.75rem 0.5rem;">Name</th>
                        <th style="padding: 0.75rem 0.5rem;">Email</th>
                        <th style="padding: 0.75rem 0.5rem;">Role / Designation</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      deptFaculty.length > 0
                        ? deptFaculty
                            .map((t) => {
                              let roleBadge =
                                '<span class="badge" style="background: rgba(100,116,139,0.08); color: #64748b; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Faculty</span>';
                              if (t.is_hod) {
                                roleBadge =
                                  '<span class="badge" style="background: rgba(249,115,22,0.08); color: #f97316; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">HOD</span>';
                              } else if (t.is_coordinator) {
                                roleBadge =
                                  '<span class="badge" style="background: rgba(59,130,246,0.08); color: #3b82f6; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Coordinator</span>';
                              }
                              return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-main);">${t.name || "-"}</td>
                                <td style="padding: 0.75rem 0.5rem; color: var(--text-muted); font-family: monospace;">${t.email || "-"}</td>
                                <td style="padding: 0.75rem 0.5rem;">${roleBadge}</td>
                            </tr>
                        `;
                            })
                            .join("")
                        : `
                        <tr>
                            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">No faculty members registered in this department.</td>
                        </tr>
                    `
                    }
                </tbody>
            </table>
        </div>
    `;

  showModal(
    `Faculty List — ${activeDept} Department (${deptFaculty.length})`,
    content,
    null,
    { hideConfirm: true },
  );
};

window.showHodSectionsModal = () => {
  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
  }
  const deptBranches =
    activeDept === "IT"
      ? ["IT", "DS"]
      : activeDept === "CS"
        ? ["CS"]
        : ["CSIT"];
  const deptClasses = currentState.classes.filter((cl) =>
    deptBranches.includes(cl.branch),
  );

  const content = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 700;">
                        <th style="padding: 0.75rem 0.5rem;">Section / Class</th>
                        <th style="padding: 0.75rem 0.5rem;">Branch</th>
                        <th style="padding: 0.75rem 0.5rem;">Class Coordinator</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      deptClasses.length > 0
                        ? deptClasses
                            .map((cl) => {
                              const coordinatorName =
                                currentState.teachers.find(
                                  (t) =>
                                    t.is_coordinator &&
                                    t.department === activeDept,
                                )?.name || "Not Assigned";
                              return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-main);">${cl.branch} ${cl.year}-${cl.section}</td>
                                <td style="padding: 0.75rem 0.5rem; color: var(--text-muted); font-weight: 600;">${cl.branch}</td>
                                <td style="padding: 0.75rem 0.5rem; color: var(--text-muted); font-weight: 500;">${coordinatorName}</td>
                            </tr>
                        `;
                            })
                            .join("")
                        : `
                        <tr>
                            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">No sections/classes registered.</td>
                        </tr>
                    `
                    }
                </tbody>
            </table>
        </div>
    `;

  showModal(
    `Sections List — ${activeDept} Department (${deptClasses.length})`,
    content,
    null,
    { hideConfirm: true },
  );
};

window.showHodAchievementsModal = () => {
  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
  }
  const deptBranches =
    activeDept === "IT"
      ? ["IT", "DS"]
      : activeDept === "CS"
        ? ["CS"]
        : ["CSIT"];
  const deptStudents = currentState.students.filter((s) =>
    deptBranches.includes(s.branch),
  );

  const currentAchievements = [];
  deptStudents.forEach((s) => {
    if (
      s.achievements &&
      Array.isArray(s.achievements) &&
      s.achievements.length > 0
    ) {
      s.achievements.forEach((a) => {
        let bg = "rgba(59,130,246,0.08)";
        let badgeColor = "#3b82f6";
        if (a.type === "Open Source" || a.type === "Internship") {
          bg = "rgba(16,185,129,0.08)";
          badgeColor = "#10b981";
        } else if (a.type === "Placement" || a.type === "Entrepreneurship") {
          bg = "rgba(249,115,22,0.08)";
          badgeColor = "#f97316";
        } else if (a.type === "Design") {
          bg = "rgba(236,72,153,0.08)";
          badgeColor = "#ec4899";
        } else if (a.type === "Research" || a.type === "Academics") {
          bg = "rgba(100,116,139,0.08)";
          badgeColor = "#64748b";
        } else if (a.type === "Development") {
          bg = "rgba(139,92,246,0.08)";
          badgeColor = "#8b5cf6";
        }

        currentAchievements.push({
          studentName: s.name,
          branchInfo: `${s.branch} ${s.year}-${s.section}`,
          desc: a.name || "Achievement",
          tag: a.type || "Award",
          badgeColor: badgeColor,
          bg: bg,
        });
      });
    }
  });

  const content = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${
                  currentAchievements.length > 0
                    ? currentAchievements
                        .map(
                          (ac) => `
                    <div style="border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.01);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div>
                                <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main); display: block;">${ac.studentName}</span>
                                <span style="font-size: 0.7rem; color: var(--text-muted);">${ac.branchInfo}</span>
                            </div>
                            <span style="font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 12px; background: ${ac.bg}; color: ${ac.badgeColor};">${ac.tag}</span>
                        </div>
                        <p style="font-size: 0.8rem; color: var(--text-main); margin: 0; line-height: 1.4;">${ac.desc}</p>
                    </div>
                `,
                        )
                        .join("")
                    : `
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; font-style: italic;">
                        No student achievements recorded by the coordinator yet.
                    </div>
                `
                }
            </div>
        </div>
    `;

  showModal(
    `Department Achievements (${currentAchievements.length})`,
    content,
    null,
    { hideConfirm: true },
  );
};

window.showHodMstDetailsModal = () => {
  let activeDept = currentState.hodDept || "IT";
  if (currentState.teacherData?.is_hod) {
    activeDept =
      currentState.teacherData.hod_dept ||
      currentState.teacherData.department ||
      "IT";
  }
  const deptBranches =
    activeDept === "IT"
      ? ["IT", "DS"]
      : activeDept === "CS"
        ? ["CS"]
        : ["CSIT"];
  const deptClasses = currentState.classes.filter((cl) =>
    deptBranches.includes(cl.branch),
  );
  const classIds = deptClasses.map((c) => c.id);

  const deptMstTimetable = currentState.mstTimetable.filter((t) =>
    classIds.includes(t.class_id),
  );
  const mstSubjectIds = [...new Set(deptMstTimetable.map((t) => t.subject_id))];
  const filteredStudents = currentState.students.filter((s) =>
    deptBranches.includes(s.branch),
  );

  let detailsRows = [];

  deptClasses.forEach((cl) => {
    const className = `${cl.branch} ${cl.year}-${cl.section}`;
    const classStudentIds = filteredStudents
      .filter(
        (s) =>
          s.branch === cl.branch &&
          s.section === cl.section &&
          s.year === cl.year,
      )
      .map((s) => s.id);
    const classMstMarks = currentState.mstMarks.filter(
      (m) =>
        classStudentIds.includes(m.student_id) &&
        mstSubjectIds.includes(m.subject_id) &&
        !m.is_absent,
    );

    const mst1Marks = classMstMarks.filter((m) => m.exam_type === "mst1");
    const mst2Marks = classMstMarks.filter((m) => m.exam_type === "mst2");

    const m1Avg =
      mst1Marks.length > 0
        ? (
            mst1Marks.reduce((sum, m) => sum + (m.marks || 0), 0) /
            mst1Marks.length
          ).toFixed(1)
        : "-";
    const m2Avg =
      mst2Marks.length > 0
        ? (
            mst2Marks.reduce((sum, m) => sum + (m.marks || 0), 0) /
            mst2Marks.length
          ).toFixed(1)
        : "-";

    detailsRows.push(`
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-main);">${className}</td>
                <td style="padding: 0.75rem 0.5rem; color: #3b82f6; font-weight: 600;">${m1Avg} ${m1Avg !== "-" ? "/ 20" : ""}</td>
                <td style="padding: 0.75rem 0.5rem; color: #f97316; font-weight: 600;">${m2Avg} ${m2Avg !== "-" ? "/ 20" : ""}</td>
            </tr>
        `);
  });

  const content = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 700;">
                        <th style="padding: 0.75rem 0.5rem;">Section</th>
                        <th style="padding: 0.75rem 0.5rem;">MST 1 Avg</th>
                        <th style="padding: 0.75rem 0.5rem;">MST 2 Avg</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      detailsRows.length > 0
                        ? detailsRows.join("")
                        : `
                        <tr>
                            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">No MST data available for this department.</td>
                        </tr>
                    `
                    }
                </tbody>
            </table>
        </div>
    `;

  showModal(`Section-wise MST Details — ${activeDept}`, content, null, {
    hideConfirm: true,
  });
};

window.renderManageHods = (container) => {
  const teachersList = currentState.teachers || [];
  const hodsList = teachersList.filter((t) => t.is_hod);

  container.innerHTML = `
        <div class="academic-header-bar" style="border: none; background: transparent; padding: 1.5rem 0 0.5rem 0; display: flex; justify-content: space-between; align-items: center; box-shadow: none;">
            <div class="academic-header-welcome">
                <h2 style="font-size: 1.85rem; font-weight: 800; color: #0f172a; margin: 0;">HOD Assignment Center</h2>
                <p style="font-size: 0.9rem; color: #64748b; margin: 0; font-weight: 500;">
                    Designate teachers as Head of Department (HOD) for specific departmental streams.
                </p>
            </div>
            <button onclick="window.showAssignHodModal()" class="btn-primary" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 8px; font-weight: 700; padding: 0.65rem 1.25rem;">
                <i data-lucide="user-plus" style="width: 16px; height: 16px;"></i> Assign HOD
            </button>
        </div>

        <div class="card" style="padding: 1.5rem; margin-top: 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border);">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="shield-check" style="color: var(--primary);"></i>
                Active Department Heads (HODs)
            </h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 700;">
                            <th style="padding: 0.85rem;">Employee ID</th>
                            <th style="padding: 0.85rem;">Name</th>
                            <th style="padding: 0.85rem;">Assigned HOD Department</th>
                            <th style="padding: 0.85rem;">Original Department</th>
                            <th style="padding: 0.85rem;">Email</th>
                            <th style="padding: 0.85rem; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          hodsList.length > 0
                            ? hodsList
                                .map(
                                  (h) => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.85rem; font-weight: 600; color: var(--text-main);">${h.employee_id}</td>
                                <td style="padding: 0.85rem; font-weight: 700; color: var(--text-main);">${h.name}</td>
                                <td style="padding: 0.85rem;">
                                    <span style="padding: 0.25rem 0.65rem; background: rgba(59, 130, 246, 0.08); color: var(--primary); border: 1px solid var(--primary); border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                                        ${h.hod_dept || h.department || "Unknown"}
                                    </span>
                                </td>
                                <td style="padding: 0.85rem; color: var(--text-muted);">${h.department || "N/A"}</td>
                                <td style="padding: 0.85rem; color: var(--text-muted);">${h.email}</td>
                                <td style="padding: 0.85rem; text-align: center;">
                                    <button onclick="window.removeHodRole('${h.id}')" class="btn-secondary" style="color: var(--error); border-color: var(--error); padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 6px; font-weight: 600;">
                                        Revoke HOD
                                    </button>
                                </td>
                            </tr>
                        `,
                                )
                                .join("")
                            : `
                            <tr>
                                <td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                                    No Head of Departments assigned yet. Use the "Assign HOD" button above to add one.
                                </td>
                            </tr>
                        `
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
  lucide.createIcons();
};

window.showAssignHodModal = () => {
  const teachersList = currentState.teachers || [];
  const availableTeachers = teachersList.filter((t) => !t.is_hod);

  showModal(
    "Assign HOD Designation",
    `
        <form id="assign-hod-form">
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label>Select Teacher</label>
                <select id="hod-teacher-id" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
                    <option value="" disabled selected>Select Teacher</option>
                    ${availableTeachers.map((t) => `<option value="${t.id}">${t.name} (${t.department} - ${t.employee_id})</option>`).join("")}
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Assign Department</label>
                <select id="hod-assign-dept" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
                    <option value="" disabled selected>Select Department</option>
                    ${currentState.departments.map((d) => `<option value="${d.name}">${d.name}</option>`).join("")}
                </select>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; padding: 0.85rem; border-radius: 6px; font-weight: 700;">Confirm Assignment</button>
        </form>
    `,
    null,
    { hideConfirm: true },
  );

  document
    .getElementById("assign-hod-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const teacherId = document.getElementById("hod-teacher-id").value;
      const dept = document.getElementById("hod-assign-dept").value;

      if (teacherId && dept) {
        const { error } = await supabaseClient
          .from("teachers")
          .update({ is_hod: true, hod_dept: dept })
          .eq("id", teacherId);

        if (error) {
          showToast(error.message, "error");
        } else {
          showToast("HOD Assigned Successfully!");
          closeModal();
          await loadAllData();
          renderManageHods(document.getElementById("main-content"));
        }
      }
    });
};

window.removeHodRole = async (teacherId) => {
  if (
    confirm(
      "Are you sure you want to revoke the HOD designation for this teacher?",
    )
  ) {
    const { error } = await supabaseClient
      .from("teachers")
      .update({ is_hod: false, hod_dept: null })
      .eq("id", teacherId);

    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("HOD role revoked.");
      await loadAllData();
      renderManageHods(document.getElementById("main-content"));
    }
  }
};

window.renderDepartments = (container) => {
  const depts = currentState.departments || [];
  const branchSecs = currentState.branchSections || [];

  container.innerHTML = `
        <div class="academic-header-bar" style="border: none; background: transparent; padding: 1.5rem 0 0.5rem 0; display: flex; justify-content: space-between; align-items: center; box-shadow: none;">
            <div class="academic-header-welcome">
                <h2 style="font-size: 1.85rem; font-weight: 800; color: #0f172a; margin: 0;">Department & Branch Setup</h2>
                <p style="font-size: 0.9rem; color: #64748b; margin: 0; font-weight: 500;">
                    Manage institute departments, branch streams, and sections dynamically.
                </p>
            </div>
            <button onclick="window.showAddDepartmentModal()" class="btn-primary" style="display: flex; align-items: center; gap: 0.5rem; border-radius: 8px; font-weight: 700; padding: 0.65rem 1.25rem;">
                <i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Department
            </button>
        </div>

        <div class="card" style="padding: 1.5rem; margin-top: 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border);">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="building" style="color: var(--primary);"></i>
                Registered Departments
            </h3>
            <div class="table-container" style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 700;">
                            <th style="padding: 0.85rem;">Department Name</th>
                            <th style="padding: 0.85rem; text-align: center;">Branch Sections</th>
                            <th style="padding: 0.85rem; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          depts.length > 0
                            ? depts
                                .map((d) => {
                                  const branches = window.getDeptBranches(d.name);
                                  const secsText = branches.map((b) => {
                                    const secsForBranch = [...new Set(
                                      branchSecs
                                        .filter((bs) => bs.department_id === d.id && bs.branch === b)
                                        .map((bs) => bs.section)
                                    )];
                                    return `${b}: ${secsForBranch.length}`;
                                  }).join(", ");

                                  return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 0.85rem; font-weight: 700; color: var(--text-main);">${d.name}</td>
                                <td style="padding: 0.85rem; text-align: center; font-weight: 700; color: var(--text-main);">${secsText || "N/A"}</td>
                                <td style="padding: 0.85rem; text-align: right;">
                                    <button onclick="window.showEditDepartmentModal('${d.id}')" class="btn-secondary" style="margin-right: 0.5rem; color: var(--primary); border-color: var(--primary); padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 6px; font-weight: 600;">
                                        Edit
                                    </button>
                                    <button onclick="window.deleteDepartment('${d.id}')" class="btn-secondary" style="color: var(--error); border-color: var(--error); padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 6px; font-weight: 600;">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `;
                                })
                                .join("")
                            : `
                            <tr>
                                <td colspan="3" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                                    No departments configured yet. Click "+ Add Department" to create one.
                                </td>
                            </tr>
                        `
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
  lucide.createIcons();
};

window.showAddDepartmentModal = () => {
  showModal(
    "Add New Department",
    `
        <form id="add-dept-form">
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: block;">Department Name</label>
                <input type="text" id="dept-name" placeholder="e.g. IT" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
            </div>
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: block;">Branches (comma-separated)</label>
                <input type="text" id="dept-branches" placeholder="e.g. IT, DS" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
            </div>
            <div id="branch-sections-container" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
                <!-- Dynamically rendered per branch -->
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; padding: 0.85rem; border-radius: 6px; font-weight: 700;">Save Department</button>
        </form>
    `,
    null,
    { hideConfirm: true },
  );

  const branchesInput = document.getElementById("dept-branches");
  const updateSections = () => {
    const val = branchesInput.value;
    const branches = val.split(",").map(b => b.trim().toUpperCase()).filter(Boolean);
    const container = document.getElementById("branch-sections-container");
    if (!container) return;
    
    let html = "";
    if (branches.length > 0) {
      html = `<label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem; display: block;">Specify Sections per Branch</label>`;
      branches.forEach((b) => {
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--bg-dark); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border);">
            <span style="font-weight: 700; color: var(--accent);">${b}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="number" class="branch-section-count-input" data-branch="${b}" min="1" max="10" value="1" required style="width: 80px; padding: 0.35rem; border-radius: 4px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-main); text-align: center; font-family: inherit; font-weight: 600;">
              <span style="font-size: 0.75rem; color: var(--text-muted);">sections</span>
            </div>
          </div>
        `;
      });
    }
    container.innerHTML = html;
  };

  branchesInput.addEventListener("input", updateSections);

  document
    .getElementById("add-dept-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("dept-name").value.trim().toUpperCase();
      const branchesStr = document.getElementById("dept-branches").value.trim();

      if (!name || !branchesStr) {
        showToast("Please fill all required fields", "error");
        return;
      }

      const branches = branchesStr
        .split(",")
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);

      if (branches.length === 0) {
        showToast("Please enter at least one branch code", "error");
        return;
      }

      // Check if department already exists
      const existing = currentState.departments.find((d) => d.name === name);
      if (existing) {
        showToast(`Department "${name}" already exists!`, "error");
        return;
      }

      const branchInputs = document.querySelectorAll(".branch-section-count-input");
      const branchSectionsMap = {};
      branchInputs.forEach((inp) => {
        const br = inp.getAttribute("data-branch");
        const count = parseInt(inp.value) || 1;
        branchSectionsMap[br] = count;
      });

      showToast("Configuring department stream...", "info");

      // 1. Insert Department
      const { data: deptData, error: deptErr } = await supabaseClient
        .from("departments")
        .insert({ name })
        .select()
        .single();

      if (deptErr) {
        showToast(deptErr.message, "error");
        return;
      }

      // 2. Generate branch sections and core classes
      const newBranchSecs = [];
      const newClasses = [];
      const years = ["1st", "2nd", "3rd", "4th"];

      branches.forEach((branch) => {
        const count = branchSectionsMap[branch] || 1;
        for (let s = 1; s <= count; s++) {
          const secName = String(s);
          years.forEach((year) => {
            newBranchSecs.push({
              department_id: deptData.id,
              branch: branch,
              year: year,
              section: secName,
            });
            newClasses.push({
              branch: branch,
              year: year,
              section: secName,
            });
          });
        }
      });

      // 3. Insert Branch Sections
      const { error: bsErr } = await supabaseClient
        .from("branch_sections")
        .insert(newBranchSecs);

      if (bsErr) {
        showToast(bsErr.message, "error");
        return;
      }

      // 4. Insert Classes
      const { error: clErr } = await supabaseClient
        .from("classes")
        .insert(newClasses);

      if (clErr) {
        showToast(clErr.message, "error");
        return;
      }

      showToast("Department setup successfully!");
      closeModal();
      await loadAllData();
      window.renderDepartments(document.getElementById("main-content"));
    });
};

window.showEditDepartmentModal = (deptId) => {
  const d = currentState.departments.find((dept) => dept.id === deptId);
  if (!d) return;

  const bsList = currentState.branchSections.filter(
    (bs) => bs.department_id === deptId,
  );
  const branches = window.getDeptBranches(d.name);
  
  const existingData = {};
  branches.forEach((b) => {
    const secs = [...new Set(bsList.filter((bs) => bs.branch === b).map((bs) => bs.section))];
    existingData[b] = secs.length || 1;
  });

  showModal(
    "Edit Department Configuration",
    `
        <form id="edit-dept-form">
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: block;">Department Name</label>
                <input type="text" id="edit-dept-name" value="${d.name}" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
            </div>
            <div class="form-group" style="margin-bottom: 1.25rem;">
                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: block;">Branches (comma-separated)</label>
                <input type="text" id="edit-dept-branches" value="${branches.join(", ")}" required style="width: 100%; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-dark); color: var(--text-main);">
            </div>
            <div id="edit-branch-sections-container" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
                <!-- Dynamically rendered per branch -->
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; padding: 0.85rem; border-radius: 6px; font-weight: 700;">Update Department</button>
        </form>
    `,
    null,
    { hideConfirm: true },
  );

  const branchesInput = document.getElementById("edit-dept-branches");
  const container = document.getElementById("edit-branch-sections-container");

  const updateSections = () => {
    const val = branchesInput.value;
    const currentBranches = val.split(",").map((b) => b.trim().toUpperCase()).filter(Boolean);
    if (!container) return;
    
    let html = "";
    if (currentBranches.length > 0) {
      html = `<label style="font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem; display: block;">Sections per Branch</label>`;
      currentBranches.forEach((b) => {
        const val = existingData[b] !== undefined ? existingData[b] : 1;
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: var(--bg-dark); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border);">
            <span style="font-weight: 700; color: var(--accent);">${b}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="number" class="edit-branch-section-count-input" data-branch="${b}" min="1" max="10" value="${val}" required style="width: 80px; padding: 0.35rem; border-radius: 4px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-main); text-align: center; font-family: inherit; font-weight: 600;">
              <span style="font-size: 0.75rem; color: var(--text-muted);">sections</span>
            </div>
          </div>
        `;
      });
    }
    container.innerHTML = html;
  };

  updateSections();
  branchesInput.addEventListener("input", updateSections);

  document
    .getElementById("edit-dept-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const newName = document.getElementById("edit-dept-name").value.trim().toUpperCase();
      const branchesStr = document.getElementById("edit-dept-branches").value.trim();

      if (!newName || !branchesStr) {
        showToast("Please fill all required fields", "error");
        return;
      }

      const newBranches = branchesStr
        .split(",")
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);

      if (newBranches.length === 0) {
        showToast("Please enter at least one branch code", "error");
        return;
      }

      const branchInputs = document.querySelectorAll(".edit-branch-section-count-input");
      const branchSectionsMap = {};
      branchInputs.forEach((inp) => {
        const br = inp.getAttribute("data-branch");
        const count = parseInt(inp.value) || 1;
        branchSectionsMap[br] = count;
      });

      showToast("Updating department configuration...", "info");

      // 1. Resolve old branches
      const oldBranches = branches;

      // Fetch all existing classes for these old branches
      const { data: existingClasses, error: getClErr } = await supabaseClient
        .from("classes")
        .select("*")
        .in("branch", oldBranches);

      if (getClErr) {
        showToast("Error reading classes: " + getClErr.message, "error");
        return;
      }

      // Calculate what target classes we want
      const targetClasses = [];
      const years = ["1st", "2nd", "3rd", "4th"];
      newBranches.forEach((branch) => {
        const count = branchSectionsMap[branch] || 1;
        for (let s = 1; s <= count; s++) {
          const secName = String(s);
          years.forEach((year) => {
            targetClasses.push({ branch, year, section: secName });
          });
        }
      });

      // Identify classes to insert
      const classesToInsert = [];
      targetClasses.forEach((tc) => {
        const match = existingClasses.find(
          (ec) => ec.branch === tc.branch && ec.year === tc.year && ec.section === tc.section
        );
        if (!match) {
          classesToInsert.push(tc);
        }
      });

      // Identify classes to delete
      const classesToDelete = [];
      for (const ec of existingClasses) {
        const match = targetClasses.find(
          (tc) => tc.branch === ec.branch && tc.year === ec.year && tc.section === ec.section
        );
        if (!match) {
          // Check if this class has any associated data to avoid losing/removing it
          const { count: studCount } = await supabaseClient
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("class_id", ec.id);
            
          const { count: ttCount } = await supabaseClient
            .from("timetable")
            .select("*", { count: "exact", head: true })
            .eq("class_id", ec.id);
            
          const { count: attCount } = await supabaseClient
            .from("attendance_submissions")
            .select("*", { count: "exact", head: true })
            .eq("class_id", ec.id);

          if ((studCount || 0) > 0 || (ttCount || 0) > 0 || (attCount || 0) > 0) {
            console.log(`Keeping class ${ec.branch} ${ec.year} Sec ${ec.section} because it contains data.`);
          } else {
            classesToDelete.push(ec);
          }
        }
      }

      // 2. Delete old branch sections
      const { error: delBsErr } = await supabaseClient
        .from("branch_sections")
        .delete()
        .eq("department_id", deptId);

      if (delBsErr) {
        showToast("Error updating branch sections: " + delBsErr.message, "error");
        return;
      }

      // 3. Update Department Name
      const { error: deptErr } = await supabaseClient
        .from("departments")
        .update({ name: newName })
        .eq("id", deptId);

      if (deptErr) {
        showToast("Error updating department name: " + deptErr.message, "error");
        return;
      }

      // 4. Insert new classes first to generate their IDs
      let insertedClasses = [];
      if (classesToInsert.length > 0) {
        const { data: insClData, error: insClErr } = await supabaseClient
          .from("classes")
          .insert(classesToInsert)
          .select();

        if (insClErr) {
          showToast("Error inserting new classes: " + insClErr.message, "error");
          return;
        }
        insertedClasses = insClData || [];
      }

      // 5. Gather all active class records
      const allActiveClasses = [
        ...existingClasses.filter(ec => !classesToDelete.some(dc => dc.id === ec.id)),
        ...insertedClasses
      ];

      // 6. Migrate references for any classes scheduled to be deleted
      for (const dc of classesToDelete) {
        // Find fallback class of same branch/year, or first new branch of same year
        let fallback = allActiveClasses.find(
          (ac) => ac.branch === dc.branch && ac.year === dc.year
        );
        if (!fallback) {
          fallback = allActiveClasses.find((ac) => ac.year === dc.year);
        }

        if (fallback) {
          // Reassign students
          await supabaseClient
            .from("students")
            .update({ class_id: fallback.id })
            .eq("class_id", dc.id);

          // Reassign timetable
          await supabaseClient
            .from("timetable")
            .update({ class_id: fallback.id })
            .eq("class_id", dc.id);

          // Reassign coordinator
          await supabaseClient
            .from("teachers")
            .update({ coordinator_class: fallback.id })
            .eq("coordinator_class", dc.id);

          // Reassign attendance submissions
          await supabaseClient
            .from("attendance_submissions")
            .update({ class_id: fallback.id })
            .eq("class_id", dc.id);

          // Reassign MST timetable
          await supabaseClient
            .from("mst_timetable")
            .update({ class_id: fallback.id })
            .eq("class_id", dc.id);
        }
      }

      // 7. Delete classes that are no longer in the configuration
      if (classesToDelete.length > 0) {
        const deleteIds = classesToDelete.map(c => c.id);
        const { error: delClErr } = await supabaseClient
          .from("classes")
          .delete()
          .in("id", deleteIds);

        if (delClErr) {
          console.warn("Class deletion warning:", delClErr.message);
        }
      }

      // 8. Re-insert Branch Sections
      const newBranchSecs = [];
      newBranches.forEach((branch) => {
        const count = branchSectionsMap[branch] || 1;
        for (let s = 1; s <= count; s++) {
          const secName = String(s);
          years.forEach((year) => {
            newBranchSecs.push({
              department_id: deptId,
              branch: branch,
              year: year,
              section: secName,
            });
          });
        }
      });

      const { error: insBsErr } = await supabaseClient
        .from("branch_sections")
        .insert(newBranchSecs);

      if (insBsErr) {
        showToast("Error generating branch sections: " + insBsErr.message, "error");
        return;
      }

      showToast("Department updated and references synchronized!");
      closeModal();
      await loadAllData();
      window.renderDepartments(document.getElementById("main-content"));
    });
};

window.deleteDepartment = async (deptId) => {
  const dept = currentState.departments.find((d) => d.id === deptId);
  if (!dept) return;

  if (
    confirm(
      `Are you sure you want to delete department "${dept.name}"? This will delete all branches, sections, and associated classes from the database.`,
    )
  ) {
    showToast("Deleting department configuration...", "info");

    const branches = window.getDeptBranches(dept.name);

    // 1. Delete branch sections
    const { error: bsErr } = await supabaseClient
      .from("branch_sections")
      .delete()
      .eq("department_id", deptId);

    if (bsErr) {
      showToast(bsErr.message, "error");
      return;
    }

    // 2. Delete classes
    if (branches.length > 0) {
      const { error: clErr } = await supabaseClient
        .from("classes")
        .delete()
        .in("branch", branches);

      if (clErr) {
        showToast(clErr.message, "error");
        return;
      }
    }

    // 3. Delete department
    const { error: deptErr } = await supabaseClient
      .from("departments")
      .delete()
      .eq("id", deptId);

    if (deptErr) {
      showToast(deptErr.message, "error");
      return;
    }

    showToast("Department configuration removed successfully.");
    await loadAllData();
    window.renderDepartments(document.getElementById("main-content"));
  }
};
window.init3DTilt = () => {};
window.initScrollReveal = () => {};

init();
