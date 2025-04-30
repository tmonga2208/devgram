# Devgram

Devgram is a developer-focused social media platform inspired by Instagram. It allows developers to share project screenshots, code snippets, and technical content, fostering a collaborative and inspiring space for the dev community.

## Features

- Developer-first feed with posts including images and code
- Like, comment, and save functionality
- User profiles with bio, skills, and GitHub link
- Explore page with tag-based and user-based search
- Secure authentication system
- Admin dashboard for moderation and analytics

## Tech Stack

- **Frontend:** Next.js, Tailwind CSS, TypeScript, Shadcn UI
- **Backend:** Node.js, Express.js, MongoDB (Mongoose)
- **Authentication:** Clerk or Firebase Auth
- **Image Storage:** Cloudinary
- **Deployment:** Vercel (frontend), Render/Heroku (backend)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/devgram.git
cd devgram
```

# Install dependencies
```bash
npm install
```

# Configure environment variables
Create a .env.local file in the root directory with the following:
```bash
# MongoDB
MONGODB_URI=your_mongodb_connection_string
# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```
# Run the development server
```bash
npm run dev
```
# Folder Structure
```csharp
devgram/
├── components/       # Reusable UI components
├── lib/              # Database, auth, and utility functions
├── models/           # Mongoose models
├── pages/            # Next.js routes
├── public/           # Static files
├── styles/           # Global CSS and Tailwind config
└── utils/            # Helper functions
```
# API Overview
```
GET /api/posts Fetch all posts
POST /api/posts Create a new post
GET /api/users/:id Fetch user profile
POST /api/auth/register Register new user
POST /api/auth/login User login
```

# License
This project is licensed under the MIT License © tmonga2208.

## Devgram is built for developers who want to share and explore real tech work, not just aesthetics
