# Law Firm Management System

## Overview
This project is an integrated law firm management system with an Arabic RTL interface, featuring a luxurious and formal design. It supports 10 functional roles across 4 departments, aiming to streamline case management, client interactions, consultations, field tasks, and internal communications. The system's core purpose is to enhance efficiency, improve decision-making, and provide comprehensive tools for managing the entire lifecycle of legal operations within a law firm. It includes robust case tracking, client relationship management, and performance analytics capabilities.

## User Preferences
I prefer clear and concise communication. For any proposed changes, please provide a high-level overview first. I value iterative development and prefer to review major architectural decisions before implementation. Ensure all output is in Arabic.

### CRITICAL: Data Preservation Rule
- **All modifications MUST preserve existing data.** No changes should ever delete, reset, modify, or affect any stored data (cases, clients, users, consultations, hearings, passwords, etc.).
- **Database schema changes** must be additive only (add columns/tables) - never drop or alter existing columns in ways that lose data.
- **Server initialization** must detect existing data and skip seeding/resetting. Never overwrite user passwords or reset user records on restart.
- **This rule applies to every single change** - whether it's a UI fix, feature addition, or bug fix. Data integrity is the top priority.

### CRITICAL: Development & Production Database Sync Rule
- **Development and Production databases are SEPARATE.** Any direct database changes (SQL queries, password resets, user additions) MUST be applied to BOTH databases.
- **When resetting passwords via SQL**: Execute the query on both `environment: development` AND `environment: production`.
- **When adding/modifying users via SQL**: Apply to both databases.
- **Preferred approach**: Make user management changes through the app's UI on the published site (which writes directly to the production database), or apply SQL changes to both environments.
- **Always verify both databases** after any direct database modification to confirm sync.
- **This rule applies to every direct database operation** - never assume a change in one database affects the other.

### Future Mobile App Requirement
- **All future modifications must consider mobile app conversion.** The system is planned to be converted to a native mobile app (App Store / Google Play) using PWA + Capacitor or similar wrapper technology.
- **Design Guidelines for Mobile Readiness**: Use responsive design patterns, avoid desktop-only interactions, ensure touch-friendly UI elements, keep API-first architecture, avoid browser-specific features that won't work in a native app wrapper.
- **Current Status**: Planned for future implementation. PWA setup (manifest.json, Service Worker) will be added later.

## System Architecture

### UI/UX Decisions
The system features a formal and luxurious design with an Arabic RTL interface.
- **Color Scheme**: Primary Petrol Blue (#345774), Accent Gold (#D4AF37), Pure White (#FFFFFF) for cards, Light Gray (#F9FAFB) for backgrounds.
- **Typography**: Tajawal and Cairo fonts.
- **Theme**: Supports both dark and light modes.
- **Styling**: `rounded-lg` borders for components, `shadow-sm` for element separation.
- **Responsiveness**: Designed to be fully responsive across all devices.

### Technical Implementations
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn/UI, React Context for state management, Wouter for routing.
- **Backend**: Node.js with Express.js.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT-based with 10 distinct roles, 2-hour token lifespan, 30-minute refresh grace period. Strong password policy enforced, with a default password (`Awn@2024!`) requiring immediate change for new seed users. Rate limiting is applied to login attempts and API requests.
- **Security**: `requireAuth` middleware on all protected API endpoints and `requireRole` for administrative operations.
- **Dual Calendar System**: All date inputs and displays utilize a dual Hijri/Gregorian calendar, with dates stored internally as ISO Gregorian strings. Custom components (`HijriDatePicker`, `DualDateDisplay`) and utility functions handle conversions and formatting.
- **Data Storage**: Client-side temporary data stored in `localStorage`.
- **Key Features**:
    - **Case Management**: Comprehensive tracking through 9 stages, department-specific workflows for plaintiff cases, prioritizing `courtCaseNumber`. Case type is free text (not enum). Case data editing restricted to `branch_manager` and `admin_support` roles only.
    - **Consultation Management**: System for managing legal consultations.
    - **Hearings Schedule**: Management of court hearing dates with `attendingLawyerId` field. When a hearing is created for a case, the attending lawyer is auto-assigned from the case's `primaryLawyerId`. Department heads can override individual assignments.
    - **Client Management**: Detailed client profiles and contact logging.
    - **Field Tasks**: Management of external tasks with status tracking and evidence upload.
    - **User Management**: CRUD operations for users, including advanced features like password reset, status toggling, vacation scheduling with conflict detection, delegation system (full/partial permissions), custom permission overrides, and team management.
    - **Notifications & Alerts**: Rule-based system with 19+ types, priority levels, user preferences (sound, desktop, summary modes), auto-escalation, and integration with workflow events. Automated scheduler handles reminders for hearings, memos, legal deadlines, and delegation expiry.
    - **Workflow Management**: Kanban-style board, workload dashboard with overload alerts, performance dashboard, SLA tracking, and a review committee process.
    - **Reporting & Analytics**: KPIs, case activity logging, internal notes, legal deadline tracking, and file attachments.
    - **Search**: Quick search (command palette) and smart search across entities.
    - **Onboarding & Help**: Guided tour and help center for user support.
    - **Activity Log**: Comprehensive tracking of all user actions with filtering and export capabilities.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Object-relational mapper for database interactions.
- **React**: Frontend library.
- **Node.js**: Backend runtime.
- **Express.js**: Backend web framework.
- **Tailwind CSS**: Utility-first CSS framework.
- **Shadcn/UI**: Reusable UI components.
- **Wouter**: Lightweight React routing library.
- **node-cron**: For scheduling background jobs.