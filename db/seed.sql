-- Insert basic campus blocks
INSERT INTO campuses (block_number, name, address) VALUES
  ('79', 'Block 79', 'Block 79, Clifton, Karachi'),
  ('98', 'Block 98 (Media)', 'Block 98, Clifton, Karachi'),
  ('99', 'Block 99 (Computing)', 'Block 99, Clifton, Karachi'),
  ('100', 'Block 100', 'Block 100, Clifton, Karachi'),
  ('153', 'Block 153', 'Block 153, Clifton, Karachi'),
  ('154', 'Block 154', 'Block 154, Clifton, Karachi'),
  ('174', 'Block 174', 'Block 174, Clifton, Karachi')
ON CONFLICT (block_number) DO NOTHING;

-- Insert a default super admin user (password is 'admin123' bcrypt hash)
INSERT INTO users (email, password_hash, full_name, role, is_active, is_verified) 
VALUES (
  'admin@szabist.edu.pk',
  '$2b$10$Jmk2BSc.tyDW.jkvJc3TdOMJq6.gcj4U7rMg8tSmuxyt5OQ0HT/D6',
  'System Administrator',
  'super_admin',
  true,
  true
)
ON CONFLICT (email) DO NOTHING;
