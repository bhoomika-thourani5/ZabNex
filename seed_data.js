const pool = require('./src/config/db');

async function seedData() {
  try {
    console.log('Starting data seeding with future deadlines relative to 2026...');

    // 1. Clean existing records to avoid duplicates and constraint errors
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM saved_posts');
    await pool.query('DELETE FROM rsvps');
    await pool.query('DELETE FROM posts');
    await pool.query('DELETE FROM society_members');
    await pool.query('DELETE FROM societies');

    const defaultPasswordHash = '$2b$10$Jmk2BSc.tyDW.jkvJc3TdOMJq6.gcj4U7rMg8tSmuxyt5OQ0HT/D6'; // admin123

    // 2. Ensure users exist
    const usersToInsert = [
      { email: 'bscs2412149@szabist.pk', full_name: 'Syed Muhammad Ali', role: 'student', campus_id: 3 },
      { email: 'bscs2412159@szabist.pk', full_name: 'Zainab Fatima', role: 'student', campus_id: 3 },
      { email: 'bscs2412147@szabist.pk', full_name: 'Bhomika Thourani', role: 'society_admin', campus_id: 3 },
      { email: 'bscs2412152@szabist.pk', full_name: 'Gungun Khetpal', role: 'society_admin', campus_id: 3 }
    ];

    for (const u of usersToInsert) {
      await pool.query(`
        INSERT INTO users (email, password_hash, full_name, role, campus_id, is_active, is_verified)
        VALUES ($1, $2, $3, $4, $5, true, true)
        ON CONFLICT (email) DO UPDATE SET 
          role = EXCLUDED.role,
          full_name = EXCLUDED.full_name,
          campus_id = EXCLUDED.campus_id,
          is_active = true,
          is_verified = true
      `, [u.email, defaultPasswordHash, u.full_name, u.role, u.campus_id]);
      console.log(`User ${u.email} ensured.`);
    }

    // Get user IDs for references
    const { rows: users } = await pool.query('SELECT id, email FROM users');
    const userMap = {};
    users.forEach(row => { userMap[row.email] = row.id; });

    // 3. Insert Societies
    const societiesToInsert = [
      { name: 'SZABIST Student Council', short_code: 'SSC', description: 'The official student council representing all SZABIST campus blocks.', color_hex: '#003b46', campus_id: 3, created_by: userMap['admin@szabist.edu.pk'] },
      { name: 'SZABIST Culture Society', short_code: 'SCS', description: 'Promoting cultural diversity and heritage at SZABIST through artistic events and traditional exhibitions.', color_hex: '#EE3124', campus_id: 3, created_by: userMap['bscs2412147@szabist.pk'] },
      { name: 'SZABIST Sports Society', short_code: 'SSS', description: 'Engaging students in physical activities, tournaments, and fitness campaigns across all campus blocks.', color_hex: '#2E8227', campus_id: 3, created_by: userMap['bscs2412152@szabist.pk'] },
      { name: 'IEEE SZABIST Student Branch', short_code: 'IEEE', description: 'Fostering technological innovation and excellence for the benefit of humanity among engineering and computing students.', color_hex: '#00629B', campus_id: 3, created_by: userMap['bscs2412147@szabist.pk'] }
    ];

    const socMap = {};
    for (const s of societiesToInsert) {
      const res = await pool.query(`
        INSERT INTO societies (name, short_code, description, color_hex, campus_id, created_by, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, short_code
      `, [s.name, s.short_code, s.description, s.color_hex, s.campus_id, s.created_by]);
      socMap[res.rows[0].short_code] = res.rows[0].id;
    }
    console.log('Societies inserted.');

    // 4. Insert Society Members linking admins to societies
    const memberships = [
      { society_id: socMap['SCS'], user_id: userMap['bscs2412147@szabist.pk'], role: 'president' },
      { society_id: socMap['IEEE'], user_id: userMap['bscs2412147@szabist.pk'], role: 'president' },
      { society_id: socMap['SSS'], user_id: userMap['bscs2412152@szabist.pk'], role: 'president' },
      { society_id: socMap['SSC'], user_id: userMap['bscs2412152@szabist.pk'], role: 'president' }
    ];

    for (const m of memberships) {
      await pool.query(`
        INSERT INTO society_members (society_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (society_id, user_id) DO UPDATE SET role = EXCLUDED.role
      `, [m.society_id, m.user_id, m.role]);
    }
    console.log('Society memberships assigned.');

    // 5. Insert Posts with valid future deadlines relative to July 2026
    const postsToInsert = [
      {
        title: 'SZABIST Need-Based Scholarship 2025-26',
        body: `External Relations & Financial Assistance Department (ERFA) invites applications for SZABIST Need-Based Scholarship 2025-26.

Eligibility Criteria:
1. Should be enrolled in any undergraduate or graduate degree program except PhD.
2. Annual Family Income should not be more than Rs. 1,500,000/-.

Application Submission Procedure:
Step 1: Download the scholarship application form from the link below and fill out the Physical Scholarship Form completely with all required documents. https://bit.ly/SNBSP2025-26Form
Step 2: Submit the Online Form accurately at: https://bit.ly/SNBSP2025-26OnlineForm
Step 3: Once the Online Form is submitted, an email will be sent with the appointment booking link to submit your physical form at the ERFA Department.
Step 4: Submit the completed Physical Form along with all required supporting documents on your scheduled appointment date and time at the ERFA Department.

Important Instructions:
- Appointment slots are limited and available on a first-come, first-served basis. Slots may close before the final deadline; students are advised to book early.
- Each student is permitted to book only one appointment. Multiple bookings will result in cancellation of all appointments and the student will not be permitted to submit the form.
- Students must arrive at least 5 minutes before their scheduled appointment time.
- Walk-in submissions will not be accepted.
- All steps, including online and physical form submission, are mandatory for scholarship consideration.

Physical Form Submission Days, Timing, and Deadline:
Days: Monday to Friday
Timing: 10:00 am to 3:30 pm
Venue: Room #5, ERFA Department, 153 Campus, SZABIST University Karachi
Submission Deadline: November 28, 2026.`,
        type: 'scholarship',
        campus_scope: 'specific',
        campus_id: 5, // Block 153
        society_id: null,
        author_id: userMap['admin@szabist.edu.pk'],
        image_url: '/uploads/image-1782910568965-538091111.png',
        deadline_date: new Date('2026-11-28T23:59:59'),
        venue: 'Room #5, ERFA Department, 153 Campus'
      },
      {
        title: 'SZABIST Talent-Based Scholarship 2025-26',
        body: `Celebrate excellence in arts, sports, and extracurricular achievements! External Relations & Financial Assistance Department (ERFA) invites applications for SZABIST Talent-Based Scholarship 2025-26.

Eligibility:
1. Registered Student at SZABIST University, Karachi Campus.
2. Top-three placement in recognized zonal, city, regional, national, or international competitions.
3. Valid certificates, letter, photographs, medals, or trophies of achievement.

Apply Now: https://forms.gle/qUkjrkOkx7MNwD6M8
Deadline: November 21, 2026.
Email: erfa@szabist.edu.pk`,
        type: 'scholarship',
        campus_scope: 'all',
        campus_id: null,
        society_id: null,
        author_id: userMap['admin@szabist.edu.pk'],
        image_url: '/uploads/image-1783090579618-987311912.png',
        deadline_date: new Date('2026-11-21T23:59:59'),
        venue: 'ERFA Department, Karachi Campus'
      },
      {
        title: 'Job Opportunity: Sr. Software Engineer at Zab Solutions',
        body: `Grow with us! Job opportunity at SZABIST University Karachi Campus.

Job Title: Sr. Software Engineer
Department: Zab Solutions
Qualification: Master's degree (18 Years of education) in Computer Science or equivalent
Experience: Minimum 3-5 years of overall professional experience. Proficiency in ASP.NET, NET Core, MVC, JavaScript, SQL Server.

Job Description:
- Work Design, Develop, and Maintain software applications.
- Write clean, efficient, and well-documented code.
- Collaborate with team members to deliver high quality software solutions.

Application Procedure:
Interested candidates must apply online within last date to apply i.e. May 07, 2027 through the following link: http://cmsbeta.szabist.edu.pk/SZABIST/advertisement.aspx

SZABIST University Karachi is an equal opportunity employer.`,
        type: 'job',
        campus_scope: 'all',
        campus_id: null,
        society_id: null,
        author_id: userMap['admin@szabist.edu.pk'],
        image_url: '/uploads/image-1783093427224-701866843.png',
        deadline_date: new Date('2027-05-07T23:59:59'),
        venue: 'Zab Solutions, Karachi Campus'
      },
      {
        title: 'ZAB E-FEST 2027: Design. Build. Inspire.',
        body: `IEEE SZABIST Student Branch is proud to present ZAB E-FEST 2027! 

Get ready for the biggest technical and engineering festival of the year. Compete in speed programming, design sprint, electronics exhibition, robotics competition, and gaming tournaments. Meet technology evangelists, showcase your brilliant projects, and win exciting cash prizes!

Join us in celebrating engineering excellence and technical innovation at SZABIST Clifton Campus.
Stay tuned for individual event details and registration guidelines!`,
        type: 'event',
        campus_scope: 'all',
        campus_id: null,
        society_id: socMap['IEEE'],
        author_id: userMap['bscs2412147@szabist.pk'],
        image_url: '/uploads/image-1783121637279-586838520.png',
        event_date: new Date('2027-02-25T09:00:00'),
        deadline_date: new Date('2027-02-24T23:59:59'),
        venue: 'SZABIST Clifton Campus Auditorium'
      },
      {
        title: 'Courtside Johar Special Discount Offer - Flat 40% Off!',
        body: `SZABIST Sports Society presents an exciting partnership offer!

Get Flat 40% OFF at Courtside Johar! 
This special discount is valid for all SZABIST Students, Staff, Faculty, and Alumni.
Show your official SZABIST ID card to avail the discount!

Validity: Offer is valid until September 2027.
Venue: Courtside Johar, Block 14, Gulistan-e-Jauhar, Karachi.`,
        type: 'announcement',
        campus_scope: 'all',
        campus_id: null,
        society_id: socMap['SSS'],
        author_id: userMap['bscs2412152@szabist.pk'],
        image_url: '/uploads/image-1783121638900-780122206.png',
        deadline_date: new Date('2027-09-30T23:59:59'),
        venue: 'Courtside Johar'
      }
    ];

    for (const p of postsToInsert) {
      await pool.query(`
        INSERT INTO posts (title, body, type, campus_scope, campus_id, society_id, author_id, image_url, event_date, deadline_date, venue, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published')
      `, [
        p.title, p.body, p.type, p.campus_scope, p.campus_id, p.society_id, p.author_id, p.image_url, p.event_date, p.deadline_date, p.venue
      ]);
    }
    console.log('Posts seeded successfully.');

  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

seedData();
