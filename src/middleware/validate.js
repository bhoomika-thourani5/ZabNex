// Validate email pattern: @szabist.edu.pk or @szabist.pk
function isValidSzabistEmail(email) {
  const szabistEmailRegex = /^[a-zA-Z0-9._%+-]+@szabist\.(edu\.)?pk$/;
  return szabistEmailRegex.test(email);
}

// User Registration Validation
function validateRegister(req, res, next) {
  const { email, password, full_name, campus_id } = req.body;

  if (!email || !isValidSzabistEmail(email)) {
    return res.status(400).json({ error: 'Valid SZABIST email address is required (@szabist.edu.pk or @szabist.pk).' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  if (!full_name || full_name.trim().length === 0) {
    return res.status(400).json({ error: 'Full name is required.' });
  }

  if (!campus_id) {
    return res.status(400).json({ error: 'Campus block selection is required.' });
  }

  next();
}

// User Login Validation
function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  next();
}

// Post Creation / Editing Validation
function validatePost(req, res, next) {
  const { title, body, type, event_date, deadline_date } = req.body;

  if (!title || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required.' });
  }

  if (!body || body.trim().length === 0) {
    return res.status(400).json({ error: 'Post content is required.' });
  }

  const validTypes = ['event', 'scholarship', 'internship', 'job', 'announcement'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}.` });
  }

  // Event posts must have an event_date
  if (type === 'event' && !event_date) {
    return res.status(400).json({ error: 'Event date is required for event posts.' });
  }

  // Opportunity posts must have a deadline
  if (['scholarship', 'internship', 'job'].includes(type) && !deadline_date) {
    return res.status(400).json({ error: 'Deadline date is required for scholarships, internships, and jobs.' });
  }

  // Deadline must be in the future (optional, but we enforce database integrity too)
  if (deadline_date && new Date(deadline_date) <= new Date()) {
    return res.status(400).json({ error: 'Deadline date must be in the future.' });
  }

  next();
}

module.exports = {
  isValidSzabistEmail,
  validateRegister,
  validateLogin,
  validatePost,
};
