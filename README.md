# GroupTrip Planner

GroupTrip Planner is a collaborative full-stack web application for organising group trips, managing members and budgets, tracking shared expenses, calculating settlements, and planning itineraries. Built with React and Supabase, the project demonstrates authentication, database-backed CRUD operations, Row Level Security, server-side authorization, and atomic expense workflows.

## Features

- User authentication using Supabase Auth
- Create and manage trips
- Add, view, and manage trip members
- Set and update individual member budgets
- Add, edit, and delete expenses
- Expense categories for shared trip spending
- Expense splitting between trip members with validated split amounts
- Budget tracking and remaining balance summaries
- Settlement calculations for who owes or is owed money
- Spending insights and trip health/status indicators
- Itinerary creation and management for trip activities
- Loading states, validation messages, confirmations and error handling
- Responsive user interface for desktop and mobile use

## Tech Stack

- React
- Vite
- JavaScript
- HTML/CSS
- Supabase
- Supabase Auth
- PostgreSQL
- Supabase Edge Functions
- Git/GitHub

## Security

This project includes several security measures implemented in the application and database layer:

- Supabase Row Level Security (RLS) is used to protect application data
- Authentication is required for protected app flows
- Trip ownership is treated as the primary authorization model for trip-related operations
- Protected member lookup is performed through a server-side function before user identification is returned
- Atomic expense creation and editing are handled through PostgreSQL functions to reduce partial-write risk
- Function execution is restricted to authenticated users; public/anon execution is not used for protected operations
- No service-role key or private secret is exposed in the frontend source
- Environment variables are stored in `.env.local` for local development
- Foreign-key relationships and cascading delete behavior are used for related expense data

This project is designed with good security practices for a student engineering project, but it should still be treated as a portfolio application rather than a fully production-hardened commercial system.

## Application Architecture

The application follows a simple full-stack architecture:

- React frontend for the user interface and interaction logic
- Supabase Auth for sign-up, login, session management and protected access
- PostgreSQL database in Supabase for trips, members, expenses, splits, profiles and itinerary items
- Supabase Edge Function for authorized member lookup
- PostgreSQL database functions for atomic expense creation and update operations

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/JanhaviG007/grouptrip-planner.git
cd grouptrip-planner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root and add your own Supabase project values:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

These values should come from your own Supabase project configuration. Do not commit actual keys to the repository.

### 4. Start the development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

## Database

The application uses Supabase PostgreSQL for core trip data, including:

- `trips` for trip information and ownership
- `trip_members` for group membership and personal budgets
- `profiles` for member profile information
- `expenses` for trip spending entries
- `expense_splits` for how amounts are shared between members
- `itinerary_items` for trip activities and schedule entries

These tables support the main workflow of creating a trip, adding members, tracking spending and keeping the group budget organised.

## Project Structure

```text
grouptrip-planner/
|-- public/
|-- src/
|-- supabase/
|-- .gitignore
|-- index.html
|-- package.json
|-- vite.config.js
`-- README.md
```

## Testing and Validation

The project includes standard frontend validation steps:

- ESLint via `npm run lint`
- Production build via `npm run build`

There are no additional automated test suites in this repository at the moment.

## Future Improvements

Planned or future enhancements for this project could include:

- Notifications and reminders for trip updates
- More advanced trip collaboration workflows
- Additional analytics for spending and activity patterns
- Automated testing for critical user flows
- CI/CD setup for deployment automation
- Expanded itinerary and voting functionality

## Author

**Janhavi Gavali**

Second-year Computer Science student at Queen Mary University of London.
