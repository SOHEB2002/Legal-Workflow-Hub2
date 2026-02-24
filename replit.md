# نظام إدارة مكتب المحاماة - Law Firm Management System

## Overview
This is an integrated law firm management system with an Arabic RTL interface. It features a luxurious, formal design using dark navy and gold colors, supporting 10 functional roles and 4 different departments. The system streamlines case management, consultations, client interactions, field tasks, and internal communications, aiming to enhance efficiency and decision-making within law firms. Key capabilities include comprehensive case lifecycle tracking, client relationship management, and performance analytics.

## User Preferences
I prefer clear and concise communication. For any proposed changes, please provide a high-level overview first. I value iterative development and prefer to review major architectural decisions before implementation. Ensure all output is in Arabic.

### CRITICAL: Data Preservation Rule
- **All modifications MUST preserve existing data.** No changes should ever delete, reset, modify, or affect any stored data (cases, clients, users, consultations, hearings, passwords, etc.).
- **Database schema changes** must be additive only (add columns/tables) - never drop or alter existing columns in ways that lose data.
- **Server initialization** must detect existing data and skip seeding/resetting. Never overwrite user passwords or reset user records on restart.
- **This rule applies to every single change** - whether it's a UI fix, feature addition, or bug fix. Data integrity is the top priority.

### Future Mobile App Requirement
- **All future modifications must consider mobile app conversion.** The system is planned to be converted to a native mobile app (App Store / Google Play) using PWA + Capacitor or similar wrapper technology.
- **Design Guidelines for Mobile Readiness**: Use responsive design patterns, avoid desktop-only interactions, ensure touch-friendly UI elements, keep API-first architecture, avoid browser-specific features that won't work in a native app wrapper.
- **Current Status**: Planned for future implementation. PWA setup (manifest.json, Service Worker) will be added later.

## System Architecture

### UI/UX Decisions
The system features a formal and luxurious design.
- **Logo**: Al-Awn Company logo.
- **Primary Color**: Petrol Blue (#345774) for sidebars and headers.
- **Accent Color**: Gold (#D4AF37) for active buttons and icons.
- **Backgrounds**: Pure white (#FFFFFF) for cards, light gray (#F9FAFB) for the general background.
- **Fonts**: Tajawal, Cairo.
- **Theme**: Supports both dark and light modes.
- **Borders**: `rounded-lg` for buttons and cards.
- **Shadows**: `shadow-sm` for element separation.
- **Responsiveness**: The design is responsive and supports all devices.

### Technical Implementations
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn/UI (components), React Context with API + localStorage (state management), Wouter (routing).
- **Backend**: Express.js, Node.js.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT-based authentication with 10 distinct roles and permissions.
  - **Token Lifespan**: 2 hours with automatic refresh at 110 minutes.
  - **Refresh Token**: 30-minute grace period for expired tokens via `/api/auth/refresh`.
  - **Password Policy**: Minimum 8 characters, must contain letters and numbers.
  - **Default Password**: `Awn@2024!` for all seed users with `mustChangePassword: true`.
  - **Rate Limiting**: Login (5 attempts/15 min per IP), API (100 requests/min).
  - **SESSION_SECRET**: Required environment variable - app exits if not set.
  - **Forced Password Change**: Users with `mustChangePassword` flag see a change-password screen before accessing the system.
- **Security Middleware**: `requireAuth` on all API endpoints (except login/refresh), `requireRole` on admin operations.
- **Data Storage**: Client-side data is temporarily saved in `localStorage`.
- **API Endpoints**: Ready for future expansion.

### Feature Specifications
- **Dashboard**: Overview with statistics.
- **Case Management (`/cases`)**: Tracks cases through 9 stages: Receive, Data Completion, Study, Memorandum Editing, Review Committee, Adjustments, Ready for Submission, Submitted, Closed.
- **Consultation Management (`/consultations`)**: Manages legal consultations.
- **Hearings Schedule (`/hearings`)**: Manages court hearing schedules.
- **Client Management (`/clients`)**: Comprehensive client profiles with contact logs.
- **Field Tasks (`/field-tasks`)**: Manages external tasks (e.g., field review, document delivery, client visit) with statuses (pending, in progress, completed, canceled) and evidence upload.
- **User Management (`/users`)**: For administrators, including advanced features like password reset, status change, and restrictions on deleting/disabling the last branch manager.
- **Contact Log (`/clients`)**: Records and tracks client communications (phone, WhatsApp, email, meeting) with follow-up statuses.
- **Quick Search (Command Palette)**: `Ctrl+K` (or `Cmd+K`) for searching cases, clients, consultations, and hearings.
- **KPIs (`/kpis`)**: Advanced analytical page for case statistics, completion rates, employee performance, and time-period filtering.
- **Help Center (`/help`)**: FAQ, system section explanations, role guidelines, and onboarding tour restart.
- **Onboarding Tour**: 7-step guided tour for new users, savable state in `localStorage`.
- **Keyboard Shortcuts**: Defined shortcuts for navigation and common actions.
- **Favorites & Recent Items**: Users can favorite items and view their last 10 visited items, saved in `localStorage`.
- **Review Standards (`/standards`)**: Quality review system for contracts, consultations, reports, and legal letters, with checklists and review statuses.
- **Notifications & Alerts**:
    - **Types**: 19+ types including task reminders, case delays, deadlines, new assignments, escalations, workflow events (STAGE_CHANGED, SLA_WARNING, SLA_OVERDUE, RETURNED_FOR_REVISION, THIRD_RETURN_WARNING, WORKLOAD_HIGH, WORKLOAD_CRITICAL, CASE_ASSIGNED, CONSULTATION_ASSIGNED, SENT_TO_REVIEW).
    - **Priority Levels**: Low, Medium, High, Urgent.
    - **Statuses**: Pending, Sent, Read, Replied, Escalated, Archived.
    - **Features**: Notification bell, send to specific users/departments, scheduling, automatic escalation, 4 response types (approve, reject, in progress, note), dynamic templates.
    - **User Preferences**: Sound alerts, desktop notifications, notification mode (instant, daily, weekly summary), quiet hours, muting specific types, workflow notification toggles (assignment, stage change, review notes, returns, SLA warnings).
    - **Rule-Based System**: 10 default notification rules with configurable conditions (stages, priorities, departments), recipients (assigned employee, department head, branch manager, review committee), and auto-escalation settings.
    - **Workflow Integration**: Automatic notifications triggered by workflow events (case/consultation assignment, stage changes, returns, SLA warnings) via triggerWorkflowNotification function.
    - **Automated Scheduler** (`server/scheduler.ts`): Background `node-cron` jobs for:
        - Unupdated hearing alerts: 8h (lawyer+dept head+admin), 24h (branch manager escalation), 48h (final escalation).
        - Upcoming hearing reminders: 48h and 24h before hearing date.
        - Memo deadline reminders: 3 days, 1 day, and overdue alerts with `reminderSent*` flags to prevent duplicates.
        - Legal deadline reminders: 7 days, 3 days, 1 day, and overdue with auto-status update and escalation.
        - Delegation expiry: Auto-detection and notification when delegations expire.
        - Contact follow-up: Overdue contact follow-up reminders.
        - Weekly reports: Sunday 7am summary to managers (new/closed cases, hearings, overdue memos).
        - Monthly reports: 1st of month summary to branch manager/review head.
        - Auto-archive: Closed cases automatically archived after 6 months.
- **Workflow Management System**:
    - **Workflow Board (`/workflow-board`)**: Kanban-style board for visualizing cases/consultations across stages with drag-like stage progression.
    - **Workload Dashboard (`/workload-dashboard`)**: Monitors employee workload distribution with overload alerts (>15 items), overdue counts, and bottleneck detection.
    - **Performance Dashboard (`/performance-dashboard`)**: Analytics dashboard with top 5 performers ranking, return rate warnings, SLA compliance tracking.
    - **Components**: Stage tracker (7-stage visual), priority badge (animated urgent), SLA indicator (time-remaining), review notes dialog, workload cards.
    - **SLA Tracking**: Configurable hours per stage, priority-adjusted (urgent -50%, low +50%).
    - **Review Committee**: Third return triggers escalation to branch manager.
    - **State Management**: WorkflowProvider context with localStorage persistence.
- **User Management System** (ENHANCED):
    - **User Management (`/users`)**: CRUD operations with enhanced dropdown menu (7 actions: edit, password reset, toggle status, view profile, schedule vacation, create delegation, custom permissions, activity log).
    - **Vacation System**: Schedule vacations with conflict detection, auto-reassignment of cases/consultations, and delegation during absence.
    - **Delegation System**: Full or partial delegation of permissions to other users with date ranges and reason tracking.
    - **Custom Permissions**: Role-based permission defaults with granular custom permission overrides, expiration dates, and restriction capabilities.
    - **Team Management (`/teams`)**: Create and manage teams with leader assignment, member management, and workload tracking.
    - **Activity Log (`/activity-log`)**: Track all user actions with filtering by user, action type, entity type, and date range with CSV export.
    - **User Profile (`/user-profile/:id`)**: 6-tab comprehensive view (stats, cases, vacations, delegations, activity log, permissions).
    - **State Management**: UsersProvider context with localStorage persistence, supports 40+ methods for managing all user-related operations.

- **Enhancement Features (Phase 2)**:
    - **Lawyer Performance KPIs (`/kpis`)**: Server-side performance API with 5-star rating system, closure rate (30%), hearing update rate (25%), memo completion time (25%), win rate (20%).
    - **Case Activity Logging**: Automatic activity logging on case create/update/stage changes, hearing results via `logCaseActivity()`. Timeline view in case details.
    - **Internal Case Notes**: Confidential notes per case with importance marking, edit/delete capabilities.
    - **Legal Deadline Tracking**: Per-case deadline management with types (legal, administrative, payment, contractual), auto-reminder scheduling, status tracking.
    - **Delegations Management (`/delegations`)**: Full delegation CRUD with date ranges, permission types (full/partial), revocation.
    - **Reports & Analytics (`/reports`)**: Court analytics, CSV export with Arabic BOM support, case/consultation statistics.
    - **File Attachments**: Multer-based file uploads (max 10MB), restricted file types, unique filename storage in `./uploads`.
    - **Smart Search**: Cross-entity search across cases, clients, consultations, hearings.
    - **Database Tables**: `case_activity_log`, `case_notes`, `legal_deadlines`, `delegations_table`.
    - **Token Key**: Standardized to `lawfirm_token` across all frontend components.

## External Dependencies
- **PostgreSQL**: Integrated database for data persistence.
- **Drizzle ORM**: Used for database interactions.
- **React**: Frontend library.
- **Node.js/Express.js**: Backend runtime and framework.
- **Tailwind CSS**: Utility-first CSS framework.
- **Shadcn/UI**: UI component library.
- **Wouter**: Routing library.