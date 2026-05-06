# InternHub

A full-stack internship search platform connecting students with companies. Built with plain HTML/CSS/JavaScript on the frontend and Supabase (PostgreSQL + Auth + Storage) on the backend. Deployed on Vercel.

**Live demo:** https://internhub-lac.vercel.app

---

## Features

### For Students
- Register and log in with email/password
- Edit profile: personal info, city, bio, education, skills, CV upload (PDF)
- Browse and filter internship listings (keyword, location, category, date)
- Save favorite positions (heart button)
- Apply for internships with a cover letter and CV
- Track application status (pending → viewed → accepted/rejected)
- Share internship experience (testimonial form, only for accepted applicants)

### For Companies
- Register and log in as a company
- Edit company profile: name, description, location, website, business ID
- Manage team members
- Post, edit and delete internship positions
- Review incoming applications inline (expand per position)
- Schedule interview dates for applicants
- Update application status (accept / decline / mark viewed)

### General
- Multi-language UI: English, Finnish, Swedish (i18n via localStorage)
- GDPR cookie consent banner
- Responsive design — mobile, tablet, desktop
- Admin panel for reviewing and deleting user feedback

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| File storage | Supabase Storage (CVs, company logos) |
| Hosting | Vercel |
| UI automation / demo | Python + Playwright |

---

## Project Structure

```
├── index.html                  # Landing page (hero, carousel, testimonials)
├── auth.html                   # Login / Register (student & company roles)
├── internships.html            # Internship listing with filters
├── internship-detail.html      # Single internship details + apply modal
├── student-profile.html        # Student dashboard (profile, applications, favorites)
├── company-profile.html        # Company dashboard (postings, applicants)
├── admin.html                  # Admin panel (feedback moderation)
├── verify-email.html           # Email verification redirect page
├── update-password.html        # Password reset page
├── footer_info/                # Static info pages (About, Contact, Resume Builder…)
├── css/
│   └── style.css               # All styles
├── js/
│   ├── supabase.js             # Supabase client init (not committed — see below)
│   ├── supabase.example.js     # Template for supabase.js
│   ├── auth.js                 # Session helpers, role checks
│   ├── i18n.js                 # Translations (EN / FI / SV)
│   ├── script.js               # Navigation, carousel, shared UI helpers
│   ├── profile.js              # Student & company profile logic
│   ├── favorites.js            # Favorites sync with Supabase
│   ├── internship-detail.js    # Detail page + apply modal
│   ├── share-experience.js     # Testimonial form and display
│   └── cookie-consent.js       # GDPR cookie banner
├── pics/                       # Institution logos and carousel images
├── demo_script.py              # Playwright UI automation / demo recording
├── .gitignore
└── README.md
```

---

## Database Tables (Supabase)

| Table | Description |
|-------|-------------|
| `Users` | App users with role (0 = admin, 1 = student, 2 = company) |
| `student_profiles` | Student profile data, linked to Users |
| `Companies` | Company profile data |
| `company_team` | Company team members |
| `positions` | Internship postings |
| `job_categories` / `job_groups` | Category taxonomy |
| `position_categories` | Many-to-many: positions ↔ categories |
| `student_categories` | Many-to-many: students ↔ categories |
| `applications` | Student applications for positions |
| `favorites` | Student saved positions (FK → Users.user_id) |
| `feedbacks` | Student testimonials (linked via application_id) |
| `Student_links` | Portfolio / social links for students |
| `student_practice_requests` | Practice period requests |

All tables are protected by Row Level Security (RLS) policies.

---

## Getting Started

### Prerequisites

- A [Supabase](https://supabase.com) project with the schema above
- [Vercel](https://vercel.com) account (or any static hosting)
- A modern browser

### Local setup

```bash
# Clone the repository
git clone https://github.com/marina-390/Internship-Search-App-Project.git
cd Internship-Search-App-Project

# Create your Supabase config file
cp js/supabase.example.js js/supabase.js
# Open js/supabase.js and fill in your Supabase URL and anon key

# Serve locally (any static server works)
# Option 1 — VS Code Live Server extension (recommended)
# Option 2 — Python
python -m http.server 5500
# Option 3 — Node
npx serve .
```

Open `http://localhost:5500` in your browser.

### Supabase credentials

`js/supabase.js` is excluded from version control (`.gitignore`).  
Copy the template and add your own keys:

```js
// js/supabase.js
const SUPABASE_URL      = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
const supabaseClient    = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

> **Never use the `service_role` key on the client side.** The anon key is safe to use in browser code — data access is controlled by RLS policies.

### Deploy to Vercel

1. Push to GitHub
2. Import the repository in Vercel
3. No build step required — it's a static site
4. Vercel serves `index.html` as the root

---

## Demo Recording Script

`demo_script.py` automates a full walkthrough of the app and records two video files that are merged into one.

### Requirements

```bash
pip install playwright
playwright install chromium
# ffmpeg must be installed for auto-merge
winget install ffmpeg        # Windows
brew install ffmpeg          # macOS
```

### Run

```bash
python demo_script.py
```

**What it records:**

| Part | Steps |
|------|-------|
| 1 | Home page → language switch (EN → FI) → registration |
| 2 | Login → profile edit → browse internships → mark favorites → apply → resume builder |

Part 1 pauses for email confirmation. After confirming, press **Enter** in the terminal to continue.  
The two clips are merged automatically into `demo_video/demo_final.webm`.

---

## Localization

Three languages are supported: **English**, **Finnish**, **Swedish**.

All translatable strings live in `js/i18n.js` inside the `TRANSLATIONS` object.  
The active language is stored in `localStorage` under the key `lang` and applied by `applyTranslations()` on every page load.

To add a new language:
1. Add a new top-level key to `TRANSLATIONS` in `i18n.js`
2. Add a button in the language dropdown in every HTML file

---

## License

Apache 2.0
