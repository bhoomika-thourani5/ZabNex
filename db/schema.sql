-- Create Enums
CREATE TYPE "Role" AS ENUM ('student', 'society_admin', 'super_admin');
CREATE TYPE "SocietyRole" AS ENUM ('marketing', 'president', 'member');
CREATE TYPE "PostType" AS ENUM ('event', 'scholarship', 'internship', 'job', 'announcement');
CREATE TYPE "CampusScope" AS ENUM ('all', 'specific');
CREATE TYPE "PostStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "NotificationType" AS ENUM ('new_post', 'rsvp_reminder', 'deadline_alert');

-- Create campuses table
CREATE TABLE campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_number VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role "Role" NOT NULL,
  campus_id UUID REFERENCES campuses(id),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  verification_code VARCHAR(10),
  is_verified BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create societies table
CREATE TABLE societies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  short_code VARCHAR(10) NOT NULL,
  description TEXT,
  logo_url TEXT,
  color_hex VARCHAR(7),
  campus_id UUID REFERENCES campuses(id),
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create society_members table
CREATE TABLE society_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role "SocietyRole" NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(society_id, user_id)
);

-- Create posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  type "PostType" NOT NULL,
  campus_scope "CampusScope" DEFAULT 'all' NOT NULL,
  campus_id UUID REFERENCES campuses(id),
  society_id UUID REFERENCES societies(id),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT,
  event_date TIMESTAMPTZ,
  deadline_date TIMESTAMPTZ,
  venue VARCHAR(255),
  status "PostStatus" DEFAULT 'published' NOT NULL,
  view_count INT DEFAULT 0 NOT NULL,
  rsvp_count INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create rsvps table
CREATE TABLE rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(post_id, user_id)
);

-- Create saved_posts table
CREATE TABLE saved_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(post_id, user_id)
);

-- Create notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type "NotificationType",
  title VARCHAR(255) NOT NULL,
  body TEXT,
  related_id UUID,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
