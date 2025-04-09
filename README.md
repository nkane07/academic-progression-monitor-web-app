# 40176951


## Student ID
40176951

## Name
Academic Progression Monitoring Web App for Web Development Project

## Description
This web app was designed as part of my CSC7062 Web Development module, demonstrating my full stack web development skills using Node.js, Express, MySQL, and EJS templating. The app is designed to assit both students and staff manage academc progression, based on progression rules and CSV-based grade data

## The application includes;
- Secure login system for admin or students
- Student dashboard showing: Personal profile, Academic records (including full pass/fail/resit history), Progression decisions (automatically calculated),Messaging system for contacting staff
- Admin dashboard with: Student management (view/edit records), Grade management (upload via CSV, edit individual records), Manual progression decision overrides, Reports and module-level statistics
- Resit handling accounting for resit result when present
- Visual styling for grade outcomes (pass, fail, pass capped, except, absent)


## Setup Instructions 
1. Clone repository - git clone https://gitlab.eeecs.qub.ac.uk/40176951/40176951.git
cd 40176951
2. Install dependencies - npm install
3. Import the database - Import academic_progression.sql into your local MySQL server
- Update /conn.js with your local DB credentials
4. Start the server - npm run dev
5. Open in browser - http://localhost:3000

## Test Login Credentials

### Student Login
- Use any Student ID from the database, e.g. 21-IFSY-0000001
- Password: student123

### Admin Login
- Use Admin ID: admin1 or admin2
- Password: admin123

> These test accounts and bcypt passwords are pre-populated in the database for demonstration purposes.


## Data Source
All module, grade and enrollment data was populated from different clean versions of student_module_grade_data.csv, which included - resit attempts, grades, outcomes, module names, pathways and entry levels

## Screenshots

## Known Issues
Admin notes only show most recent override note, full edit history is not maintained


## Authors and acknowledgment
Developed by 40176951
Part of the Web Development CSC7062 module at Queens University Belfast
Special thanks to lecturer John Busch for course delivery and project support

## License
This coursework is intended for academic use and is not licensed for commercial distribution.


