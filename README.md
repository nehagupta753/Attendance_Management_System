# 📊 Attendance Management System (AMS)

A premium, highly interactive, and responsive web application designed for modern educational institutions. This system provides a **three-tier architecture** with specialized portals for **Students**, **Teachers**, and **Administrators**, powered by a high-performance **Supabase** backend and styled with sleek, modern glassmorphic aesthetics.

---

## ✨ Features & Portals

### 🎓 1. Student Portal (Zero-Credentials Access)
An instant-access, passwordless dashboard designed to keep students updated on their attendance status in real-time.
* **Instant Verification**: Access via Roll Number, Course, Branch, and Section details.
* **Exam Eligibility Analytics**: Dynamically calculates and tags eligibility based on attendance:
  * 🟢 **Eligible (≥ 75%)** — Meets required course criteria.
  * 🟡 **Borderline (60% - 75%)** — Warning status to boost attendance.
  * 🔴 **Ineligible (< 60%)** — Below minimum required limits.
* **Overall Attendance Gauge**: Interactive, color-coded visual indicator mapping present vs. conducted classes.
* **Subject-Wise Analytics**: Detail-rich cards displaying exact attendance fractions (e.g., `12/15` classes) and interactive progress bars for every subject.
* **Date-Wise Timeline**: Filterable list where students can search by subject or teacher name and toggle views specifically for "Present" or "Absent" days.

### 🏫 2. Teacher Portal (Secure Classroom Marking)
A robust, lightweight tool for educators to log daily attendance and manage schedules.
* **Secure Auth**: Fully verified teacher-only login via Supabase credentials.
* **Interactive Class Registry**: Dynamically load students by filtering **Year**, **Branch**, **Section**, and **Subject**.
* **Micro-Interactive Status Marking**: Single-click toggle buttons (`Present` / `Absent`) with dynamic color response.
* **Submission Summary Card**: Instantly showcases a performance gauge representing the attendance rate for the submitted lecture.
* **Interactive History & Records Modification**: 
  * View all conducted lectures with detailed class attendance rates.
  * Deep-dive into specific session details.
  * Instantly update a student's status for a past class (toggles between Present/Absent) with automatic sync.

### 🛡️ 3. Admin Portal (Scoped Institutional Management)
An enterprise-grade control panel for system configuration and department control.
* **Scope Locking**: A clean workspace architecture requiring administrators to pick a **Department** and **Branch** scope. The system filters all dashboards to match the selection, avoiding workspace visual clutter.
* **Teacher Management**: Complete profile management including Employee ID, Department, Class Coordinator privilege checkbox, and **Account Status Activation/Deactivation** toggles.
* **Student Registry**: Manage students and instantly edit their demographic fields (Roll No, Course, Class, etc.).
* **Course & Class Configuration**: Define Subject codes, map Year levels, and configure classrooms.
* **Lecture Scheduler (Timetable)**: A smart scheduling system that links Teachers, Subjects, and Classes. Includes **Auto-Resolution**, meaning that if a teacher or subject name typed by an admin does not exist in the database, the system automatically creates the profile dynamically to save time.
* **System Monitoring**: Live telemetry dashboard tracking daily submissions count and active coordinators.

---

## 🎨 Design System & Aesthetics

Crafted using vanilla **HTML5**, **CSS3**, and **ES6 Javascript** for blazing-fast page loads. No bulky CSS frameworks needed.
* **Color Palette (Dark Slate Theme)**:
  * Primary: Indigo (`#6366f1` / `#4f46e5`)
  * Accent/Active: Teal (`#2dd4bf`)
  * Error/Inactive: Red (`#ef4444`)
  * Background: Slate Dark (`#0f172a`)
  * Glassmorphism: Frosted card layouts (`rgba(30, 41, 59, 0.7)`) with subtle borders and shadows.
* **Typography**: Clean, professional look utilizing the **Outfit** Google Font.
* **Icons**: Powered by **Lucide Icons** for sharp, lightweight SVGs.
* **Smooth Transitions & Animations**: Hover micro-interactions on cards, slide-in/out alert toasts, spinning loaders, and premium tab transitions.

---

## 💾 Database Schema (Supabase PostgreSQL)

The system relies on the following interrelated tables:

```mermaid
erDiagram
    TEACHERS ||--o{ TIMETABLE : teaches
    TEACHERS ||--o{ ATTENDANCE_RECORDS : records
    SUBJECTS ||--o{ TIMETABLE : belongs_to
    SUBJECTS ||--o{ ATTENDANCE_RECORDS : maps_to
    CLASSES ||--o{ STUDENTS : contains
    CLASSES ||--o{ TIMETABLE : scheduled_for
    CLASSES ||--o{ ATTENDANCE_RECORDS : logs
    STUDENTS ||--o{ ATTENDANCE_RECORDS : receives
```

### Table Profiles
1. **`teachers`**: `id` (PK), `employee_id`, `name`, `department`, `email`, `phone`, `is_coordinator`, `status` (active/inactive).
2. **`students`**: `id` (PK), `roll_no` (Unique), `name`, `course`, `branch`, `year`, `section`.
3. **`subjects`**: `id` (PK), `code` (Unique), `name`, `department`.
4. **`classes`**: `id` (PK), `branch`, `year`, `section`.
5. **`timetable`**: `id` (PK), `day_of_week`, `start_time`, `end_time`, `teacher_id` (FK), `subject_id` (FK), `class_id` (FK).
6. **`attendance_records`**: `id` (PK), `student_id` (FK), `teacher_id` (FK), `class_id` (FK), `subject_id` (FK), `date`, `status` (Present/Absent).
7. **`attendance_submissions`**: `id` (PK), `date`, `teacher_id` (FK), `class_id` (FK).

---

## 🚀 Quick Start / Local Installation

### Prerequisites
* You only need a web browser to run the client-side system.
* Since the project relies on native ES6 modules (`import/export` statements), opening the `index.html` file using the `file://` protocol directly in your browser may trigger CORS restrictions. Running a simple local development server is **highly recommended**.

### Running Locally

#### Option A: Python Web Server (Fastest & Built-in)
Open a terminal in the project directory (`attendance system`) and run:
```powershell
python -m http.server 5500
```
Then, open your browser and navigate to:
👉 **[http://localhost:5500](http://localhost:5500)**

#### Option B: Live Server (VS Code Extension)
1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` and choose **"Open with Live Server"**.

#### Option C: Node.js (http-server / serve)
If you have Node.js installed, execute:
```bash
npx -y serve -l 5500
# OR
npx -y http-server -p 5500
```
And access it at `http://localhost:5500`.

---

## 🛠️ Configuration & Credentials

The connection to the cloud database is pre-configured in `app.js`:
* **Supabase Project Endpoint**: `https://heoxgbknrnxzhcdolgus.supabase.co`
* **Publishable API Key**: `sb_publishable_P2YPf-iogij7qNnwcK79XA_YUbJe1Ll`

To swap to your own custom Supabase backend:
1. Open [app.js](file:///c:/Users/yagye/OneDrive/Documents/attendance%20system/app.js).
2. Update the `SUPABASE_URL` and `SUPABASE_KEY` values on lines 2 and 3.

---

*Made with 💖 for high-performance classroom tracking.*


## 🚀 Installation & Execution Steps

1. **Clone the repository:**
   `ash
   git clone https://github.com/yourusername/attendance-system.git
   cd attendance-system
   `

2. **Run a local web server:**
   Since this is a vanilla HTML/JS application, you can serve it locally using Python:
   `ash
   python server.py
   `
   Or using a simple HTTP server:
   `ash
   python -m http.server 5500
   `

3. **Access the application:**
   Open your web browser and navigate to http://localhost:5500.

## 📸 Screenshots & Outputs

Screenshots of the application interfaces (Admin Dashboard, HOD Dashboard, Teacher Portal, Student View) can be found in the [screenshots/](./screenshots) directory.
