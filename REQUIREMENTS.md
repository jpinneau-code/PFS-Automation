## Global specifications

### Rights
3 types of users in the application.
- The administrator (Owner of the application)
- The project managers (Can Create a project and manage projects and resources where he is project project manager)
- People (the rest of the actors of the projects)

### Structure

- Users
-- UserId
-- UserName
-- Email
-- Password
-- Type (Administrator, Project Manager, or Actor)
-- Prefered language

- Projects
-- ProjectId
-- Project Name
-- ClientId
-- Country
-- Project Manager -> Users with type Project Manager
-- Assigned Users -> relation n-n to assign users
-- Status (can be : Created, In progress, Frozen, Closed)

- Stages
-- StageId
-- ProjectId -> Relation to Projects (cannot be null)
-- Stage Name
-- Order (number, by default 0)
-- Start date
-- End Date

- Tasks
-- TaskId
-- StageId -> Relation to Stages (can be null)
-- ProjectId -> Relation to Projects, when StageId is null
-- Task Name
-- SoldDays (number, by default 0)
-- Responsible -> relation with users (not mandatory).

- Clients
-- ClientId
-- Client Name
-- First Name of Contact
-- Last Name of Contact
-- Email of Contact





