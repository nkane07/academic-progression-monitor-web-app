# 40176951 Academic Progression Monitoring Web App

## Student Information
- Student Number : 40176951
- Name: Niamh Kane
- Email: nkane07@qub.ac.uk
- Module: CSC7062 - Web Development

## Description
This web app was designed as part of my CSC7062 Web Development module, demonstrating my full stack web development skills using Node.js, Express, MySQL, and EJS templating. The app is designed to assist both students and staff manage academic progression, based on progression rules and CSV-based grade data. Key design principles include use of three tier architecture, MVC pattern, dynamic logic for student progression, secure login, session management, messaging and CSV import tools.

## The application includes;
- Secure login system for admin or students
- Student dashboard showing: Personal profile, Academic records (including full pass/fail/resit history), Progression decisions (automatically calculated),Messaging system for contacting staff
- Admin dashboard with: Student management (view/edit records), Grade management (upload via CSV, edit individual records), Manual progression decision overrides, Reports and module-level statistics
- Resit handling accounting for resit result when present
- Visual styling for grade outcomes (pass, fail, pass capped, excempt, absent)

## Technologies Used
- Node.js – server-side runtime
- Express – web framework and routing
- EJS – dynamic templating for views
- MySQL – relational database
- bcrypt – secure password hashing
- express-session – session control and login persistence
- multer – file uploads for profile images and CSV grades
- csv-parser – importing and parsing grades via CSV
- Chart.js – chart in admin reports

## Setup Instructions 
1. Clone repository - git clone https://gitlab.eeecs.qub.ac.uk/40176951/40176951.git
cd 40176951
2. Install dependencies - npm install
3. Import the database - Import 40176951.sql into your local MySQL server. Update const conn in app.js with your local DB credentials
4. Start the server - npm run dev
5. Open in browser - http://localhost:3000

## Test Login Credentials

### Student Login
- Use any Student ID from the database, e.g. 21-IFSY-0000001
- Password: studentpass

### Admin Login
- Use Admin ID: admin1 or admin2
- Password: adminpass123

> These test accounts and bcrypt passwords are pre-populated in the database for demonstration purposes.

## Account Recovery

If a user forgets their login credentials, they can recover them as follows:

### Forgot Username
- Click forgot username on login page
- Enter your registered email address (either from `users` or `students.contact_email` tables on the database)
- The system will return the username associated with that email

### Forgot Password
- Click forgot password on login page
- Enter your registered email address
- A temporary password will be generated and displayed in the terminal (for demonstration/testing)
- Use this password to log in, then you’ll be prompted to reset it

### Resetting Your Password
- After logging in with the temporary password from the terminal, the system will redirect you to reset password page/form
- Enter and confirm your new password to complete the reset.

## Data Source
All module, grade and enrollment data was populated from different clean versions of student_module_grade_data.csv, which included - resit attempts, grades, outcomes, module names, pathways and entry levels

## Screenshots

### 1. Login Page  
Allows both students and admins to log into the system securely using their details.  
![Login](screenshots/login.png)

### 2. Student Dashboard  
Provides students with quick access to their profile, grades, progression status, and messages.  
![Student Dashboard](screenshots/student_dashboard.png)

### 3. Student Profile  
Displays the student's personal and academic details with the ability to update secondary email and profile image.  
![Student Profile](screenshots/student_profile.png)

### 4. Student Grades  
Lists all modules taken by the student with grades, resits, and outcomes.  
![Grades](screenshots/student_records.png)

### 5. Student Progression  
Shows automated progression decision based on academic performance.  
![Progression](screenshots/student_progression.png)

### 6. Student Messages  
Inbox view for students to see messages from admins and respond.  
![Messages](screenshots/student_messages.png)

### 7. Student - View Message Thread  
Displays full message details and allows replying to or deleting a message.  
![Student Message Thread](screenshots/student_message_thread.png)

### 8. Student - Contact Admin  
Form for students to send messages directly to an academic advisor.  
![Contact Admin](screenshots/student_contact_admin.png)

### 9. Admin Dashboard  
Main interface for admins to manage students, grades, reports, and more.  
![Admin Dashboard](screenshots/admin_dashboard.png)

### 10. Admin - View Students  
Searchable list of all students with pagination and level/year display.  
![View Students](screenshots/admin_see_students.png)

### 11. Admin - Manage Student  
Edit student information including name, pathway, and current year.  
![Manage Student](screenshots/admin_manage_student.png)

### 12. Admin - Student Summary  
Detailed academic summary of an individual student with ability to override progression.  
![Student Summary](screenshots/admin_student_summary.png)

### 13. Admin - Add New Student  
Form to register a new student manually into the system.  
![Add Student](screenshots/admin_add_new_student.png)

### 14. Admin - Manage Grades  
View and edit individual grade records from enrolment table.  
![Manage Grades](screenshots/admin_manage_grades.png)

### 15. Admin - Upload CSV  
Upload multiple student grades at once using a CSV file.  
![Upload CSV](screenshots/admin_CSV_correct.png)

### 16. Admin - Reports  
Average grades, top failed modules, and progression summaries.  
![Reports](screenshots/admin_reports.png)

### 17. Admin - Manage Modules  
Edit existing module details or remove modules from the system.  
![Manage Modules](screenshots/admin_manage_modules.png)

### 18. Admin - Add Module  
Form to create and register a new module.  
![Add Module](screenshots/admin_add_module.png)

### 19. Admin - Edit Module  
Edit form for modifying an existing module's details.  
![Edit Module](screenshots/admin_edit_module.png)

### 20. Admin - Messages  
Inbox view of all student-admin messages.  
![Admin Messages](screenshots/admin_messages.png)

### 21. Admin - View Message Thread  
Detailed thread view and admin replies to messages.  
![Message Thread](screenshots/admin_message_thread.png)

### 22. Admin - Read vs Unread Messages  
Status highlighting of messages read/unread.  
![Read/Unread Messages](screenshots/admin_read_unread_messages.png)

### 23. Forgot Password  
Form to request a temporary password if forgotten.  
![Forgot Password](screenshots/forgot_password.png)

### 24. Forgot Username  
Form to retrieve username via registered email.  
![Forgot Username](screenshots/forgot_username.png)

### 25. Reset Password  
Secure form for users to reset their password after logging in with a temporary password.  
![Reset Password](screenshots/reset_password.png)


## Known Issues
- Admin notes only show most recent override note, full edit history is not maintained
- Limited client side validation, currently performed on the server-side
- All core logic is in app.js - could use modular refactoring

## Folder Structure 
- /views                      - EJS templates for each page (student/admin)
- /public                     - CSS styles, images, uploads
- /app.js                     - Main application logic and route handlers
- /utils                      - Utility functions (e.g. getAcademicYear)
- academic_progression.sql    - MySQL Database schema and sample data

## References
All references are listed in technical report

## Authors and acknowledgment
Developed by 40176951
Part of the Web Development CSC7062 module at Queens University Belfast
Special thanks to lecturer John Busch for course delivery and project support

## License
This coursework is intended for academic use and is not licensed for commercial distribution.


