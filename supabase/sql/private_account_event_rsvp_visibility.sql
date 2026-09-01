-- Private-account content (events hosted, events RSVP'd to) hidden from
-- non-followers — enforced server-side via RLS.
--
-- Background: src/app/user.tsx fetches a profile's "hosting" (events they
-- created) and "going" (events they RSVP'd to) unconditionally, then only
-- hides them in the render if the profile is private and the viewer
-- doesn't follow them. Checked live policies (2026-08-31):
--
--   events SELECT: "scoped event visibility" (PERMISSIVE, authenticated)
--     visibility = 'public' OR created_by = auth.uid()
--     OR (school IS NOT NULL AND school = my_university())
--   rsvps  SELECT: "authenticated can read rsvps" (PERMISSIVE, authenticated)
--     USING (true)   -- wide open, no privacy check at all
--
-- Neither policy considers profiles.is_private or the follows table, so a
-- private account's hosted/attended events are fully readable via the API
-- by any authenticated non-follower today. This script closes that gap.
--
-- Decision made before writing this (confirmed with the repo owner):
-- privacy is enforced GLOBALLY, not just on the profile page. A private
-- account's events are hidden from the home feed / search / map / event
-- attendee lists for non-followers too, not only from their own profile's
-- hosting/going tabs. This is what makes a single RLS policy correct and
-- sufficient — RLS can't be scoped to "only when queried from screen X."
--
-- Known, accepted side effect: rsvps also backs the "WHO'S GOING" list on
-- every event's detail page. A private account's RSVP to someone else's
-- public event becomes invisible to non-followers there too, and RSVP
-- counts become viewer-dependent (a private attendee is counted only for
-- their own followers). This follows directly from "private = private
-- everywhere" and is intentional, not a bug.
--
-- ============================================================
-- STEP 1 — Helper function (mirrors the style of the existing
-- my_university()/is_moderator() functions, which weren't found by name
-- but are clearly the established pattern here)
-- ============================================================
-- SECURITY DEFINER so it can read `profiles` and `follows` regardless of
-- the caller's own RLS visibility into those tables (Supabase functions
-- created via the SQL editor are owned by a role with RLS-bypass, same as
-- how my_university() must already work to read another user's row).
create or replace function public.can_view_profile_content(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- You can always see your own content.
    target_id = auth.uid()
    -- Public accounts: no restriction. Missing profile row → treat as
    -- not private rather than silently blocking everything.
    or not coalesce(
      (select p.is_private from public.profiles p where p.id = target_id),
      false
    )
    -- Private accounts: only visible to an accepted follower. This app
    -- has no follow-request/approval step (see src/lib/follows.ts —
    -- followUser() inserts directly), so "accepted follow" = any row in
    -- `follows` with the viewer as follower.
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = target_id
    )
$$;

-- ============================================================
-- STEP 2 — Restrictive policy on events
-- ============================================================
-- RESTRICTIVE, not permissive: Postgres OR's multiple permissive
-- policies together, so a second permissive policy here would be OR'd
-- with "scoped event visibility" (which already returns true for a lot of
-- rows) and would narrow nothing. RESTRICTIVE instead AND's against
-- whatever the permissive policy already allows, which is what "further
-- hide this" requires. Same reasoning as the earlier school-visibility
-- investigation (see events_school_visibility_rls.sql).
drop policy if exists "private_accounts_events_hidden_from_non_followers" on public.events;

create policy "private_accounts_events_hidden_from_non_followers"
on public.events
as restrictive
for select
to authenticated
using (public.can_view_profile_content(created_by));

-- ============================================================
-- STEP 3 — Restrictive policy on rsvps
-- ============================================================
drop policy if exists "private_accounts_rsvps_hidden_from_non_followers" on public.rsvps;

create policy "private_accounts_rsvps_hidden_from_non_followers"
on public.rsvps
as restrictive
for select
to authenticated
using (public.can_view_profile_content(user_id));

-- ============================================================
-- Verification queries to run after applying
-- ============================================================
-- Re-list policies to confirm both are present and RESTRICTIVE:
--   select tablename, policyname, permissive, cmd
--   from pg_policies where tablename in ('events','rsvps');
--
-- As a non-follower of a private test account, confirm their hosted
-- events / rsvps no longer come back:
--   select * from events where created_by = '<private-account-id>';
--   select * from rsvps where user_id = '<private-account-id>';
-- Both should return zero rows unless you are that user or follow them.

-- ============================================================
-- Rollback
-- ============================================================
-- drop policy if exists "private_accounts_events_hidden_from_non_followers" on public.events;
-- drop policy if exists "private_accounts_rsvps_hidden_from_non_followers" on public.rsvps;
-- drop function if exists public.can_view_profile_content(uuid);
