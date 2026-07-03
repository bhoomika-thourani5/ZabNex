# ZabNex 🎓

> **The Central Hub for Campus Life Across SZABIST Karachi**

ZabNex is a comprehensive, modern campus community platform designed to connect students, society administrators, and university officials. It provides a centralized space for campus announcements, society events, scholarships, and active student engagement.

---

## ✨ Features

- **Role-Based Access Control (RBAC):**
  - **Students:** Can view their campus feed, RSVP to events, manage their profile, and receive notifications.
  - **Society Admins:** Can manage their society's profile, add/remove members, and publish posts (events, announcements, etc.) to the feed.
  - **Super Admins:** Have full oversight through an analytics dashboard, can manage users, deactivate accounts, and configure campus blocks.
- **Dynamic Feed:** Real-time campus feed with filters for events, scholarships, internships, and general announcements.
- **Real-Time Notifications:** Students receive immediate email alerts (and in-app notifications) when relevant events are posted for their campus.
- **Modern UI:** Built with an interactive, responsive, and accessible interface utilizing Tailwind CSS and Alpine.js.

## 🛠️ Technologies Used

### Backend
- **Node.js & Express.js** - Robust server and API routing.
- **PostgreSQL** - Relational database for structured data storage (via `pg` and `connect-pg-simple`).
- **Bcrypt & Express-Session** - Secure password hashing and persistent session management.
- **Nodemailer** - For sending email verification and notifications.
- **Multer** - For handling image uploads on posts.

### Frontend
- **HTML5 & CSS3** - Standard web structure.
- **Tailwind CSS** - Utility-first CSS framework for rapid UI styling via CDN.
- **Alpine.js** - Lightweight JavaScript framework for reactive components and frontend logic via CDN.

---

## 🚀 Getting Started

Follow these steps to run ZabNex locally on your machine.

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [PostgreSQL](https://www.postgresql.org/) (or a cloud DB like Neon)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/bhoomika-thourani5/ZabNex.git
   cd ZabNex
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following details:
   ```env
   PORT=3000
   DATABASE_URL="your_postgresql_connection_string"
   SESSION_SECRET="your_secret_key"
   NODE_ENV="development"
   
   # For Email Notifications (e.g. Gmail App Passwords)
   SMTP_USER="your_email@gmail.com"
   SMTP_PASS="your_app_password"
   ```

4. **Initialize the Database:**
   Run the setup script to create the necessary tables and schema:
   ```bash
   npm run db:setup
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000`.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.

## 📝 License

This project is licensed under the ISC License.
